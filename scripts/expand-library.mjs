/**
 * Kasvattaa biisikantaa jo haetusta aineistosta – ilman uutta verkkohakua.
 *
 * Miksi erillinen skripti eikä `build-library.mjs --stage=finalize`? Nykyinen
 * `src/data/songs.json` ei ole pelkkä finalizen tuotos: sen päälle on ajettu
 * `filter-language.mjs` (pois artistit jotka eivät laula suomeksi) ja
 * `prune-unknown.mjs` (pois biisit joita kukaan ei kuuntele). Kumpikin vaatii
 * verkkoa. Jos finalize ajettaisiin uudestaan isommalla katolla, se palauttaisi
 * kantaan juuri ne rivit jotka noilla ajoilla siivottiin.
 *
 * Siksi laajennus tehdään toisin päin: nykyinen kanta on totuus siitä, ketkä
 * artistit kelpaavat, ja lisää biisejä otetaan vain **näiltä samoilta
 * artisteilta**. Silloin kielisuodatus pätee jo valmiiksi, ja tunnettuus
 * varmistetaan samalla toistomääräkynnyksellä jota prune-unknown käyttää.
 *
 * Lokerokatto (genre × aikakausi) nostetaan 400:sta oletuksena 600:aan. Katon
 * tarkoitus on estää yhtä lokeroa syömästä koko kantaa, ei rajoittaa kokoa
 * sinänsä.
 *
 *   node scripts/expand-library.mjs --dry          näyttää mitä lisättäisiin
 *   node scripts/expand-library.mjs                kirjoittaa kannan
 *   node scripts/expand-library.mjs --cap=800      oma lokerokatto
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { norm, stripParens, isJunkTitle } from './shared.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SONGS = join(ROOT, 'src', 'data', 'songs.json')
const MATCHED = join(ROOT, 'data', '.pipeline-matched.json')

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const flag = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`))
  return a ? Number(a.split('=')[1]) : fallback
}
const CAP = flag('cap', 600)

/** Sama kynnys kuin prune-unknown.mjs:ssä: vanhat klassikot striimaavat
 *  vähemmän kuin uudet hitit vaikka kaikki tuntevat ne. */
const MIN_PLAYS = { 2020: 8000, 2010: 6000, klassikot: 3000 }

const GENRES = ['rock', 'rap', 'pop', 'iskelma']
const ERAS = ['2020', '2010', 'klassikot']

function eraOf(year) {
  if (!year || !Number.isFinite(year)) return 'klassikot'
  if (year >= 2020) return '2020'
  if (year >= 2010) return '2010'
  return 'klassikot'
}

/**
 * Biisin tunniste – sama sääntö kuin pelin `songKey` (src/game/match.ts).
 * Välilyönnit jätetään huomiotta, koska sama kappale on levytetty eri
 * kirjoitusasuilla ("Hei Neidit" / "Heineidit"). Ilman tätä kannassa on sama
 * biisi kahdesti ja pelaaja saa väärin vaikka kirjoitti oikein.
 */
function dedupKey(artist, title) {
  return `${norm(artist)}|${norm(stripParens(title)).replace(/ /g, '')}`
}

/**
 * Levytys joka ei ole arvattava kappale: välisoitot, introt, skitit.
 * `isJunkTitle` osuu vain nimen alkuun, mutta nämä esiintyvät myös keskellä
 * ("Vastuu outro", "Painajais Skit"). Tällaista ei voi tunnistaa 0,2
 * sekunnista eikä 15:stäkään – se ei kuulu arvoituksiin.
 */
function isNonSong(title) {
  return /\b(intro|outro|interlude|prelude|prologi|epilogi|skit|valisoitto|välisoitto|soundcheck|jingle|spiikki|tunnari)\b/i
    .test(title || '')
}

/** Hittikimarat ja ylipitkät nimet pois – sama sääntö kuin hakuputkessa. */
function isMedley(title) {
  if (((title || '').match(/\s\/\s/g) || []).length >= 2) return true
  if (/hittikima|medley|potpuri|sikerm/i.test(title || '')) return true
  return (title || '').length > 70
}

/** Vaikeustasot kvantiileittain lokeron SISÄLLÄ – sama jako kuin finalizessa. */
const TIER_QUANTILES = [0.1, 0.3, 0.6, 0.85]
function assignTiers(songs) {
  const buckets = new Map()
  for (const s of songs) {
    const key = `${s.genre}|${s.era}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(s)
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => (b.plays || 0) - (a.plays || 0))
    const n = list.length
    list.forEach((s, i) => {
      const p = n > 1 ? i / n : 0
      const tier = TIER_QUANTILES.findIndex((cut) => p < cut) + 1
      s.tier = tier === 0 ? 5 : tier
    })
  }
}

const base = JSON.parse(await readFile(SONGS, 'utf8'))
const matched = JSON.parse(await readFile(MATCHED, 'utf8'))

// Kielisuodatuksen läpäisseet artistit = ne jotka ovat jo kannassa.
const approved = new Set(base.map((s) => norm(s.artist)))

const shaped = (s) => ({
  id: s.id,
  artist: s.artist,
  title: s.title,
  fullTitle: s.fullTitle,
  album: s.album,
  year: s.year ?? null,
  artwork: s.artwork,
  preview: s.preview,
  tier: s.tier,
  genre: s.genre,
  era: eraOf(s.year),
  artists: s.artists?.length ? s.artists : [s.artist],
  plays: s.plays || 0,
})

// Ehdokkaat: nykyinen kanta + samojen artistien muut biisit hakuputken
// välituloksesta. Nykyinen kanta menee ensin, jotta se voittaa duplikaatit.
const pool = [
  ...base.filter((s) => !isNonSong(s.title)).map(shaped),
  ...matched
    .filter(
      (s) =>
        s.id &&
        s.preview?.startsWith('https://') &&
        s.artwork &&
        GENRES.includes(s.genre) &&
        approved.has(norm(s.artist)) &&
        !isJunkTitle(s.title) &&
        !isNonSong(s.title) &&
        !isMedley(s.fullTitle || s.title) &&
        (s.plays || 0) >= (MIN_PLAYS[eraOf(s.year)] ?? 5000),
    )
    .map(shaped),
]

const byId = new Map()
for (const s of pool) if (!byId.has(s.id)) byId.set(s.id, s)
const byKey = new Map()
for (const s of byId.values()) {
  const key = dedupKey(s.artist, s.title)
  const existing = byKey.get(key)
  if (!existing || (s.plays || 0) > (existing.plays || 0)) byKey.set(key, s)
}
const deduped = [...byKey.values()]

// Lokerokohtainen valinta: kuunnelluimmat ensin, katto per lokero.
const kept = []
const report = {}
for (const genre of GENRES) {
  for (const era of ERAS) {
    const list = deduped
      .filter((s) => s.genre === genre && s.era === era)
      .sort((a, b) => (b.plays || 0) - (a.plays || 0))
    const take = list.slice(0, CAP)
    kept.push(...take)
    const before = base.filter((s) => s.genre === genre && s.era === era).length
    report[`${genre}|${era}`] = {
      ennen: before,
      saatavilla: list.length,
      jalkeen: take.length,
      lisays: take.length - before,
      pienin_plays: take.length ? take[take.length - 1].plays : 0,
    }
  }
}

assignTiers(kept)

const final = kept.sort(
  (a, b) =>
    a.tier - b.tier ||
    b.plays - a.plays ||
    a.artist.localeCompare(b.artist, 'fi') ||
    a.title.localeCompare(b.title, 'fi'),
)

console.log(`\nLokerokatto ${CAP}, kynnykset 2020≥${MIN_PLAYS[2020]} 2010≥${MIN_PLAYS[2010]} klassikot≥${MIN_PLAYS.klassikot}`)
console.table(report)

const perTier = {}
for (const s of final) perTier[s.tier] = (perTier[s.tier] || 0) + 1
console.log(`\n${base.length} → ${final.length} biisiä (+${final.length - base.length})`)
console.log('Tier-jakauma:', perTier)

const artists = new Set(final.map((s) => norm(s.artist)))
console.log(`Artisteja: ${artists.size} (ennen ${approved.size})`)

const dupIds = final.length - new Set(final.map((s) => s.id)).size
const dupKeys = final.length - new Set(final.map((s) => dedupKey(s.artist, s.title))).size
const strays = final.filter((s) => !approved.has(norm(s.artist)))
console.log('Tarkistus:', {
  duplikaatti_id: dupIds,
  duplikaatti_artisti_nimi: dupKeys,
  hyvaksymattomia_artisteja: strays.length,
  ilman_previewia: final.filter((s) => !s.preview?.startsWith('https://')).length,
})

if (DRY) {
  console.log('\n(kuiva ajo, ei kirjoitettu)')
} else {
  await writeFile(SONGS, JSON.stringify(final, null, 1) + '\n', 'utf8')
  console.log(`\nKirjoitettu: ${SONGS}`)
}
