/**
 * Rakentaa hakuluettelon `src/data/catalog.json` – sen listan josta pelaaja
 * valitsee arvauksensa.
 *
 * **Miksi tämä on eri lista kuin pelattava kanta.** Aiemmin hakukenttä ehdotti
 * suoraan `songs.json`:ista, siis täsmälleen siitä joukosta josta oikea vastaus
 * arvottiin. Se vuosi vastauksen: kirjoittamalla "kar" näki koko sen joukon
 * josta biisi *voi* olla, ja jos artistilta löytyi listalta vain yksi biisi,
 * arvaus oli varma. Peli mittasi hakukentän selaamista, ei biisin tunnistamista.
 *
 * Nyt luettelo on moninkertaisesti pelattavaa kantaa laajempi: mukana ovat myös
 * ne kappaleet jotka eivät päässeet kantaan (ei ääninäytettä, liian vähän
 * kuuntelijoita, lokerokatto täynnä). Listalla oleminen ei siis kerro mitään
 * siitä voiko biisi olla vastaus. Pelattava kanta on aina osajoukko, joten
 * jokainen oikea vastaus on yhä kirjoitettavissa.
 *
 * Lähteet, kaikki jo haettua aineistoa – ei uutta verkkohakua:
 *   1. src/data/songs.json          pelattava kanta (pakko olla mukana)
 *   2. data/.pipeline-matched.json  iTunesiin täsmätyt kappaleet
 *   3. data/.pipeline-candidates.json  Last.fm:n tagihaun kärki
 *
 *   node scripts/build-catalog.mjs --dry
 *   node scripts/build-catalog.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { norm, stripParens, isJunkTitle } from './shared.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SONGS = join(ROOT, 'src', 'data', 'songs.json')
const MATCHED = join(ROOT, 'data', '.pipeline-matched.json')
const CANDIDATES = join(ROOT, 'data', '.pipeline-candidates.json')
const CATALOG = join(ROOT, 'data', '.pipeline-catalog.json')
const OUT = join(ROOT, 'src', 'data', 'catalog.json')

const DRY = process.argv.includes('--dry')

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const songs = await loadJson(SONGS, [])
const matched = await loadJson(MATCHED, [])
const candidates = await loadJson(CANDIDATES, [])
const discographies = await loadJson(CATALOG, {})

/** Vain jo hyväksytyt artistit: kielisuodatus on tehty artistitasolla, eikä
 *  luetteloon haluta serbialaista Diabloa suomalaisen tilalle. */
const approved = new Set(songs.map((s) => norm(s.artist)))

function isMedley(title) {
  if (((title || '').match(/\s\/\s/g) || []).length >= 2) return true
  if (/hittikima|medley|potpuri|sikerm/i.test(title || '')) return true
  return (title || '').length > 70
}

/**
 * Levytys joka ei ole kappale: välisoitot, introt, puheraidat, äänitarkistukset.
 * `isJunkTitle` osuu vain nimen alkuun ("Intro"), mutta koko diskografiassa
 * samat raidat esiintyvät myös keskellä nimeä ("Arena Outro II").
 */
function isNonSong(title) {
  return /\b(intro|outro|interlude|prelude|prologi|epilogi|skit|valisoitto|välisoitto|soundcheck|jingle|spiikki|tunnari)\b/i
    .test(title || '')
}

/**
 * Pudottaa version merkinnän nimen perästä: "Cha Cha Cha - Reggae Mix",
 * "Kaunis - Live", "Aamuun asti (Vain elämää kausi 16)".
 *
 * Ilman tätä hakuluettelo täyttyy saman biisin variaatioista: pelaaja näkee
 * kahdeksan ehdotusta joista kolme on samaa kappaletta. Version merkintä ei
 * myöskään ole se nimi jolla biisiä etsitään.
 */
const VERSION_MARKER =
  /\s[-–]\s*(.*\b(remix|mix|live|instrumental|karaoke|demo|acoustic|akustinen|radio edit|edit|version|versio|remaster\w*|single|mono|stereo|extended|cover|vain elämää|sessions?)\b.*)$/i

function cleanTitle(title) {
  let t = (title || '').trim()
  t = t.replace(VERSION_MARKER, '')
  t = stripParens(t)
  return t.trim()
}

/**
 * Rivin tunniste. Välilyönnit jätetään huomiotta, koska sama biisi esiintyy
 * katalogissa eri kirjoitusasuina ("247 365" ja "247365").
 */
function rowKey(artist, title) {
  return `${norm(artist)}|${norm(cleanTitle(title)).replace(/ /g, '')}`
}

/**
 * Luettelorivi on tarkoituksella riisuttu: artisti, nimi, mahdollinen koko nimi
 * feat-vieraineen ja toistomäärä järjestystä varten. Ei id:tä, ei ääninäytettä,
 * ei kansikuvaa – rivi ei ole biisi vaan pelkkä nimi jonka voi arvata.
 */
const byKey = new Map()

/**
 * @param locked tosi pelattavan kannan riveille: ne eivät saa koskaan väistyä
 *   myöhemmän rivin tieltä, muuten oikeaa vastausta ei voisi kirjoittaa.
 */
function add(artist, title, fullTitle, artists, plays, locked = false) {
  if (!artist || !title) return
  if (!approved.has(norm(artist))) return
  const clean = locked ? title : cleanTitle(title)
  if (!clean) return
  if (isJunkTitle(clean) || isNonSong(clean) || isMedley(fullTitle || clean)) return

  const key = rowKey(artist, clean)
  const existing = byKey.get(key)
  if (existing?.locked) return
  if (existing && (existing.plays || 0) >= (plays || 0)) return

  // Kentät jätetään pois kun niissä ei ole tietoa: luettelossa on kymmeniä
  // tuhansia rivejä, ja pelkkä `"plays":0` joka rivillä maksaisi satoja
  // kilotavuja.
  const row = { artist, title: clean }
  // Koko nimi säilytetään vain kun se kertoo feat-vieraan – se on hakusana.
  // Muut sulkeissa olevat lisäykset ovat version merkintöjä eli kohinaa.
  if (fullTitle && fullTitle !== clean && /\b(feat|ft|featuring)\b/i.test(fullTitle)) {
    row.fullTitle = fullTitle
  }
  if (artists?.length > 1) row.artists = artists
  if (plays > 0) row.plays = plays
  if (locked) row.locked = true
  byKey.set(key, row)
}

// 1. Pelattava kanta ensin – nämä on pakko löytyä hausta, eikä niiden nimiä
//    siivota: pelaajan on voitava kirjoittaa vastaus juuri siinä muodossa
//    jossa peli sen näyttää.
for (const s of songs) add(s.artist, s.title, s.fullTitle, s.artists, s.plays, true)
const afterSongs = byKey.size

// 2. iTunesiin täsmätyt: sama aineisto josta kanta poimittiin, mutta koko
//    laajuudessaan – juuri nämä hukkuivat lokerokaton alle.
for (const s of matched) add(s.artist, s.title, s.fullTitle, s.artists, s.plays)
const afterMatched = byKey.size

// 3. Last.fm:n tagihaun kärki: mukana myös kappaleet joille ei koskaan
//    löytynyt ääninäytettä. Nämä eivät voi olla vastaus – ja juuri siksi ne
//    ovat luettelossa.
for (const c of candidates) add(c.artistName, c.title, c.title, null, c.plays)
const afterCandidates = byKey.size

// 4. Artistien koko iTunes-katalogi. Tämä on se lähde joka tekee luettelosta
//    aidosti sokean: mukaan tulee jokainen levytys, myös albumitäyte jota
//    kukaan ei arvaisi. Ilman tätä luettelo olisi vain puolitoista kertaa
//    pelattavan kannan kokoinen, jolloin listalla näkyminen olisi yhä vihje.
for (const entry of Object.values(discographies)) {
  for (const t of entry.tracks || []) {
    add(t.artistName, t.trackName, t.trackName, null, 0)
  }
}
const afterDiscography = byKey.size

const catalog = [...byKey.values()]
  .sort((a, b) => a.artist.localeCompare(b.artist, 'fi') || a.title.localeCompare(b.title, 'fi'))
  .map(({ locked: _locked, ...row }) => row)

// Terveystarkistus: jokaisen pelattavan biisin on löydyttävä luettelosta,
// muuten oikeaa vastausta ei voi kirjoittaa.
const inCatalog = new Set(catalog.map((c) => rowKey(c.artist, c.title)))
const missing = songs.filter((s) => !inCatalog.has(rowKey(s.artist, s.title)))

console.log(`\nHakuluettelo:`)
console.table({
  'pelattava kanta': { rivit: afterSongs, lisays: afterSongs },
  '+ itunes-täsmätyt': { rivit: afterMatched, lisays: afterMatched - afterSongs },
  '+ lastfm-ehdokkaat': { rivit: afterCandidates, lisays: afterCandidates - afterMatched },
  '+ koko diskografia': { rivit: afterDiscography, lisays: afterDiscography - afterCandidates },
})
console.log(`Luettelo on ${(catalog.length / songs.length).toFixed(1)}× pelattavaa kantaa (${songs.length} biisiä).`)
console.log(`Pelattavia biisejä puuttuu luettelosta: ${missing.length}`)
if (missing.length) {
  console.log(missing.slice(0, 5).map((s) => `  ${s.artist} – ${s.title}`).join('\n'))
  process.exitCode = 1
}

const bytes = Buffer.byteLength(JSON.stringify(catalog))
console.log(`Koko: ${(bytes / 1024 / 1024).toFixed(2)} MB`)

if (DRY) {
  console.log('\n(kuiva ajo, ei kirjoitettu)')
} else {
  await writeFile(OUT, JSON.stringify(catalog) + '\n', 'utf8')
  console.log(`\nKirjoitettu: ${OUT}`)
}
