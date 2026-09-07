/**
 * Rakentaa pelin biisikannan (src/data/songs.json) Last.fm:n varaan.
 *
 * Putki:
 *
 *   1. LÖYTÄMINEN TAGEILLA (scripts/lastfm.mjs: tagTopTracks/tagTopArtists).
 *      Tämä korvaa käsin poimitut soittolistat. Samat tagit toimivat kuin
 *      soittolistan haku, mutta rajapinta on vakaa ja avoin.
 *   2. ARTISTIN LAAJENNUS (artistTopTracks, limit=50): jokaiselle löydetylle
 *      suomalaiselle artistille haetaan hänen KUUNNELLUIMMAT kappaleensa,
 *      ei koko katalogia. Tämä on kannan runko.
 *   3. SUOMALAISUUS: isFinnishArtist(tags) — korvaa kansainvälisten kieltolistan.
 *   4. GENRE: genreFromTags(tags, artistName) artistin Last.fm-tageista.
 *   5. SUOSIOKARSINTA: plays >= 1 000 000 -alaraja, JA lokerokohtainen
 *      (genre×aikakausi) minimi-/kattopoiminta, jotta klassikot-lokerot
 *      (matalampi striimimäärä, silti tunnettuja) eivät tyhjene.
 *   6. iTUNES-RATKAISU: pysyvä previewUrl, kansikuva, julkaisuvuosi. Ensi-
 *      sijaisesti artistin KOKO katalogi haetaan kerralla (1-2 pyyntöä per
 *      artisti — halvempi kuin haku per kappale) ja Last.fm-kappaleet
 *      täsmätään siihen nimen perusteella; jäljelle jäävät haetaan yksitellen.
 *
 * Ajo on jaettu VAIHEISIIN (--stage=...), koska Apple-haku kuristaa ja koko
 * putki ei mahdu yhteen 10 minuutin ajoon. Jokainen vaihe tallentaa oman
 * välituloksensa data/-kansioon ja on jatkettavissa (jo tehty työ ohitetaan).
 *
 *   node scripts/build-library.mjs --stage=discover
 *   node scripts/build-library.mjs --stage=tracks
 *   node scripts/build-library.mjs --stage=catalog [--time-budget=520000]
 *   node scripts/build-library.mjs --stage=match
 *   node scripts/build-library.mjs --stage=resolve-missing [--time-budget=520000]
 *   node scripts/build-library.mjs --stage=finalize [--dry]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  artistMatches, isJunkTitle, norm, splitArtistNames, stripParens, extractFeatNames,
} from './shared.mjs'
import {
  loadEnv, tagTopTracks, tagTopArtists, artistTopTracks, artistInfo,
  isFinnishArtist, genreFromTags,
} from './lastfm.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'songs.json')
const ITUNES_CACHE = join(ROOT, 'data', '.itunes-cache.json')
const LASTFM_CACHE = join(ROOT, 'data', '.lastfm-cache.json')
const ARTISTS_FILE = join(ROOT, 'data', '.pipeline-artists.json')
const CANDIDATES_FILE = join(ROOT, 'data', '.pipeline-candidates.json')
const CATALOG_FILE = join(ROOT, 'data', '.pipeline-catalog.json')
const MATCHED_FILE = join(ROOT, 'data', '.pipeline-matched.json')
const UNMATCHED_FILE = join(ROOT, 'data', '.pipeline-unmatched.json')
const RESOLVED_MISSING_FILE = join(ROOT, 'data', '.pipeline-resolved-missing.json')

const COUNTRY = 'FI'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : fallback
}
const STAGE = flag('stage', 'all')
const DRY = args.includes('--dry')
const DELAY_MS = Number(flag('delay', 1400))
const TIME_BUDGET_MS = Number(flag('time-budget', 520000))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- pieni JSON-apu ---------- */
async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}
async function saveJson(path, data) {
  await writeFile(path, JSON.stringify(data), 'utf8')
}

/* ---------- iTunes-välimuisti + haku (kuristettu, sekventiaalinen) ---------- */
let itCache = {}
let itDirty = false
let itHits = 0
let itMisses = 0

async function loadItCache() { itCache = await loadJson(ITUNES_CACHE, {}) }
async function saveItCache() {
  if (!itDirty) return
  try { await writeFile(ITUNES_CACHE, JSON.stringify(itCache), 'utf8'); itDirty = false } catch {}
}
async function itGet(url, cacheKey) {
  if (itCache[cacheKey] !== undefined) { itHits++; return itCache[cacheKey] }
  itMisses++
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (itMisses > 1) await sleep(DELAY_MS)
      const res = await fetch(url, { headers: { 'User-Agent': 'korvamato-buildlib/1.0' } })
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        await sleep(4000 * 2 ** attempt)
        continue
      }
      const text = await res.text()
      if (!text.trim()) { await sleep(4000 * 2 ** attempt); continue }
      const data = JSON.parse(text)
      itCache[cacheKey] = data
      itDirty = true
      return data
    } catch {
      await sleep(4000 * 2 ** attempt)
    }
  }
  throw new Error(`kuristus tai verkkovirhe: ${url}`)
}

async function resolveArtistId(name) {
  const url = 'https://itunes.apple.com/search?' +
    new URLSearchParams({ term: name, country: COUNTRY, media: 'music', entity: 'song', limit: '25' })
  const data = await itGet(url, `search:${COUNTRY}:${norm(name)}`)
  const results = data.results || []
  let exact = null, partial = null
  for (const r of results) {
    const m = artistMatches(name, r.artistName)
    if (m === 'exact' && !exact) exact = r
    else if (m === 'part' && !partial) partial = r
  }
  const hit = exact || partial
  return hit ? hit.artistId : null
}

async function fetchArtistCatalog(artistId) {
  const url = 'https://itunes.apple.com/lookup?' +
    new URLSearchParams({ id: String(artistId), entity: 'song', limit: '200', country: COUNTRY })
  const data = await itGet(url, `catalog:${COUNTRY}:${artistId}`)
  return (data.results || []).filter((r) => r.wrapperType === 'track' && r.kind === 'song')
}

/**
 * Etsii iTunesista parhaan osuman (artisti+nimi) annetuille hyväksytyille
 * artistinimille. Sama pisteytyslogiikka kuin vanhassa putkessa.
 */
function pickBestItunesMatch(results, acceptNames, wantTitle) {
  let best = null
  let bestScore = -1
  for (const r of results) {
    if (r.wrapperType !== 'track' || r.kind !== 'song' || !r.previewUrl) continue
    let aMatch = null
    for (const name of acceptNames) {
      const m = artistMatches(name, r.artistName)
      if (m === 'exact') { aMatch = 'exact'; break }
      if (m === 'part' && aMatch !== 'exact') aMatch = 'part'
    }
    if (!aMatch) continue
    const rTitle = norm(stripParens(r.trackName))
    let titleScore = 0
    if (rTitle === wantTitle) titleScore = 2
    else if (rTitle.includes(wantTitle) || wantTitle.includes(rTitle)) {
      const shorter = Math.min(rTitle.length, wantTitle.length)
      if (shorter >= 4) titleScore = 1
    }
    if (titleScore === 0) continue
    const score = titleScore * 10 + (aMatch === 'exact' ? 2 : 1)
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

/* ============================================================
 * Suodattimet: karaoke/tribuutti/cover/instrumentaali/live/remix/demo,
 * introt/skitit, hittikimarat. Samat säännöt kuin vanhassa putkessa.
 * ============================================================ */
const HARD_JUNK = [
  /\bkaraoke\b/i, /\btribute\b/i, /made famous by/i, /in the style of/i,
  /\binstrumental\b/i, /backing track/i, /cover version/i, /originally performed/i,
  /vain elämää/i, /tähdet,? ?tähdet/i, /the voice of finland/i,
]
const ALT_VERSION = [
  /\blive\b/i, /\bremix\b/i, /\bacoustic\b/i, /\bakustinen\b/i, /\bdemo\b/i,
  /radio edit/i, /radio version/i, /\brmx\b/i, /\bmashup\b/i, /\bsession\b/i,
]

function isMedley(title) {
  if (((title || '').match(/\s\/\s/g) || []).length >= 2) return true
  if (/hittikima|medley|potpuri|sikerm/i.test(title || '')) return true
  return (title || '').length > 70
}

function isJunk(title, album) {
  const blob = `${title || ''} ${album || ''}`
  if (HARD_JUNK.some((re) => re.test(blob))) return true
  if (isJunkTitle(title)) return true
  if (ALT_VERSION.some((re) => re.test(title || ''))) return true
  if (isMedley(title)) return true
  return false
}

/** Sama sääntö kuin src/game/categories.ts:n eraOf() */
function eraOf(year) {
  if (year === null || !Number.isFinite(year)) return 'klassikot'
  if (year >= 2020) return '2020'
  if (year >= 2010) return '2010'
  return 'klassikot'
}

const COMPILATION = /kaikki levytykset|greatest hits|\bparhaa|suosikkia|kokoelma|collection|superhitti|the best|\bhits\b|\d{4}\s*[-–]\s*\d{4}/i

function releaseYear(track) {
  const own = track.releaseDate ? new Date(track.releaseDate).getFullYear() : null
  const album = track.collectionName || ''
  if (!COMPILATION.test(album)) return own
  const span = album.match(/(19|20)\d{2}\s*[-–]\s*(?:19|20)?\d{2}/)
  if (span) return Number(span[0].slice(0, 4))
  return null
}

/** Kaikki artistit kappaleella: pääartisti + fullTitle:n feat-vieraat. */
function deriveArtists(primaryArtistName, fullTitle) {
  const names = new Map()
  const add = (n) => { const k = norm(n); if (k && !names.has(k)) names.set(k, n) }
  for (const p of splitArtistNames(primaryArtistName)) add(p)
  for (const p of extractFeatNames(fullTitle)) add(p)
  return [...names.values()]
}

function dedupKey(artist, title) {
  return `${norm(artist)}|${norm(stripParens(title))}`
}

/* ============================================================
 * VAIHE 1: discover — tagipohjainen artistilöytö + suomalaisuus/genre
 * ============================================================ */

const TAGS = [
  'finnish', 'suomi', 'finland', 'suomalainen',
  'finnish rock', 'suomirock', 'suomi rock', 'finnish alternative', 'finnish alternative rock',
  'finnish punk', 'suomi punk', 'finnish hardcore', 'finnish emo',
  'finnish metal', 'suomi metal', 'finnish folk metal', 'finnish power metal',
  'finnish black metal', 'finnish death metal', 'finnish gothic', 'finnish symphonic metal',
  'finnish indie', 'suomi indie', 'finnish singer-songwriter',
  'iskelma', 'suomalainen iskelma', 'schlager', 'humppa', 'finnish folk',
  // pop/rap ovat Last.fm:llä rakenteellisesti aliedustettuja rockiin nähden — syvempi tagijoukko
  'finnish pop', 'suomipop', 'pop suomi', 'suomipop 2010', 'suomipop 2020',
  'suomi pop 2010', 'suomi pop 2020', 'finnish pop 2010', 'finnish pop 2020',
  'suomi pop hitit', 'finnish dance pop', 'finnish electropop',
  'finnish rap', 'suomirap', 'suomi rap', 'suomi räp', 'rap suomi',
  'finnish hip-hop', 'finnish hip hop', 'suomi hiphop', 'suomi trap',
  'uusi suomirap', 'vanha suomirap', 'suomirap 2010', 'suomirap 2011', 'suomirap 2012',
  'suomirap 2013', 'suomirap 2014', 'suomirap 2015', 'suomirap 2016', 'suomirap 2017',
  'suomirap 2018', 'suomirap 2019', 'suomirap 2020', 'suomirap 2021', 'suomirap 2022',
  'suomirap 2023', 'suomirap 2024', 'suomirap 2025', 'suomi rap 2020', 'suomi rap 2021',
]

/** pop- ja rap-tagit saavat syvemmän sivutuksen tagihaussa: laaja "finnish"/
 *  "suomi" -tagi löytää artisteja hyvin, mutta genrekohtaiset alalajitagit
 *  (suomirap, suomipop) tuottavat todistetusti vähemmän per sivu, joten
 *  niistä kannattaa hakea useampi sivu saman kutsumäärän hinnalla. */
const PRIORITY_GENRE_TAGS = new Set([
  'finnish pop', 'suomipop', 'pop suomi', 'suomipop 2010', 'suomipop 2020',
  'suomi pop 2010', 'suomi pop 2020', 'finnish pop 2010', 'finnish pop 2020',
  'suomi pop hitit', 'finnish dance pop', 'finnish electropop',
  'finnish rap', 'suomirap', 'suomi rap', 'suomi räp', 'rap suomi',
  'finnish hip-hop', 'finnish hip hop', 'suomi hiphop', 'suomi trap',
  'uusi suomirap', 'vanha suomirap', 'suomirap 2010', 'suomirap 2011', 'suomirap 2012',
  'suomirap 2013', 'suomirap 2014', 'suomirap 2015', 'suomirap 2016', 'suomirap 2017',
  'suomirap 2018', 'suomirap 2019', 'suomirap 2020', 'suomirap 2021', 'suomirap 2022',
  'suomirap 2023', 'suomirap 2024', 'suomirap 2025', 'suomi rap 2020', 'suomi rap 2021',
])

/**
 * Genret joilla Last.fm:n toistomäärä on rakenteellisesti pienempi kuin
 * rockilla/metallilla (havaittu datasta: 83 645 kandidaatista vain 133
 * ylitti 1 000 000 toistoa, ja niistä 121 oli rockia — suomalainen metalli/
 * rock on kansainvälisesti paljon scrobblatumpaa kuin suomikielinen pop/rap/
 * iskelmä). Näille genreille annetaan etusija rajallisessa iTunes-
 * aikabudjetissa, jotta ne saadaan kokonaan ratkaistuksi ennen kuin aika
 * käytetään rockiin, jolla on joka tapauksessa runsaasti ylitarjontaa.
 */
const LOW_COVERAGE_GENRES = new Set(['pop', 'rap', 'iskelma'])

/** Artistinimien turvaverkko (ei koskaan kappaleita) — ks. README:n periaate.
 *  Tagihaku on ensisijainen löytökanava; nämä täydentävät kattavuutta
 *  erityisesti iskelmässä, jota Last.fm-tagit eivät aina kata täysin. */
const SEED_SUPPLEMENT = [
  'Eino Grön', 'Kari Tapio', 'Tapani Kansa', 'Katri Helena', 'Marion Rung', 'Marion',
  'Fredi', 'Danny', 'Paula Koivuniemi', 'Anneli Saaristo', 'Arja Koriseva', 'Frederik',
  'Kirka', 'Vicky Rosti', 'Reijo Taipale', 'Riki Sorsa', 'Suvi Teräsniska',
  'Jari Sillanpää', 'Matti ja Teppo', 'Arttu Wiskari', 'Erika Vikman', 'Antti Railio',
  'Laura Voutilainen', 'Marko Maunuksela', 'Tommi Läntinen', 'Kaija Koo',
  'Vesa-Matti Loiri', 'Nina Tapio', 'Diandra', 'Cristal Snow', 'Sami Saari',
  'Topi Sorsakoski', 'Armi Aavikko', 'Tapio Rautavaara', 'Eija Kantola',
  'Redrama', 'Mikael Gabriel', 'Pyhimys', 'Stig', 'Gettomasa', 'Ege Zulu',
  'Musta Barbaari', 'VilleGalle', 'Signmark', 'Sini Sabotage', 'Cledos',
  'Ruger Hauer', 'Prinssi Jusuf', 'Ares', 'Turisti', 'Averagekidluke',
  'Costello', 'Iso H', 'Ceebrolistics', 'Nikke Ankara', 'Ezkimo',
  'Von Hertzen Brothers', 'Battle Beast', 'Beast in Black', 'Wintersun',
  'Ensiferum', 'Turisas', 'Cyan Kicks', 'Nightwish', 'Amorphis', 'Children of Bodom',
]

/**
 * Last.fm yhdistää joskus SAMANNIMISTEN mutta eri artistien scrobblaukset
 * samalle artistisivulle (yleinen ongelma lyhyillä/yleisillä nimillä).
 * Löytyi datasta: "Clarissa" kantaa tageja ['brazilian','finnish',...] ja
 * "Lelo" tageja ['detroit hip hop','michigan','finnish',...] — nämä ovat
 * kahden ERI artistin sivut sulautuneena yhteen, ja niiden playcount on
 * kahden artistin summa, ei yhden suomalaisen. isFinnishArtist(tags) ei
 * osaa erottaa tätä, joten karsitaan erikseen: jos tageissa on sekä
 * suomalaisuusmerkki ETTÄ selvä toisen maan/kaupungin merkki, hylätään
 * varmuuden vuoksi (mieluummin menettää yksittäinen aito monikansallinen
 * artisti kuin päästää läpi vääriä isoja toistolukuja).
 */
const OTHER_NATIONALITY_TAGS = new Set([
  'brazilian', 'brazil', 'brasil', 'portuguese', 'american', 'usa', 'us hip hop',
  'american hip hop', 'british', 'uk', 'england', 'scottish', 'scotland', 'welsh',
  'wales', 'irish', 'ireland', 'canadian', 'canada', 'australian', 'australia',
  'german', 'germany', 'french', 'france', 'spanish', 'spain', 'italian', 'italy',
  'dutch', 'netherlands', 'belgian', 'belgium', 'norwegian', 'norway', 'danish',
  'denmark', 'icelandic', 'iceland', 'russian', 'russia', 'polish', 'poland',
  'japanese', 'japan', 'korean', 'korea', 'chinese', 'china', 'mexican', 'mexico',
  'colombian', 'colombia', 'argentine', 'argentina', 'chilean', 'chile', 'peruvian',
  'peru', 'indian', 'india', 'detroit', 'michigan', 'chicago', 'atlanta',
  'california', 'texas', 'new york', 'nyc', 'london', 'memphis', 'houston',
  'bay area', 'seattle', 'boston', 'philadelphia', 'miami', 'nashville',
  'southern hip hop', 'uk drill', 'uk rap', 'grime',
])
function isNationalityCollision(tags) {
  return (tags || []).some((t) => OTHER_NATIONALITY_TAGS.has(t))
}

async function stageDiscover(env) {
  const lcache = await loadJson(LASTFM_CACHE, {})
  const names = new Map() // norm -> alkuperäinen kirjoitusasu
  const add = (n) => { if (!n) return; const k = norm(n); if (k && !names.has(k)) names.set(k, n) }

  console.log(`── Vaihe 1: tagipohjainen löytö (${TAGS.length} tagia) ──`)
  const tagReport = {}
  for (const tag of TAGS) {
    const before = names.size
    const priority = PRIORITY_GENRE_TAGS.has(tag)
    const artistPages = priority ? 6 : 3
    const trackPages = priority ? 4 : 2
    for (let page = 1; page <= artistPages; page++) {
      const artists = await tagTopArtists(tag, env, lcache, 50, page)
      for (const a of artists) add(a.name)
      if (artists.length < 50) break
    }
    for (let page = 1; page <= trackPages; page++) {
      const tracks = await tagTopTracks(tag, env, lcache, 100, page)
      for (const t of tracks) if (t.artist?.name) add(t.artist.name)
      if (tracks.length < 100) break
    }
    tagReport[tag] = names.size - before
    await saveJson(LASTFM_CACHE, lcache)
    process.stdout.write(`  "${tag}"${priority ? ' [priority]' : ''}: +${tagReport[tag]} uutta nimeä (yht. ${names.size})\n`)
  }
  for (const n of SEED_SUPPLEMENT) add(n)
  console.log(`\nRaakaehdokkaita yhteensä (tagit + turvaverkko): ${names.size}`)

  console.log('\nVarmistetaan suomalaisuus ja genre (artistInfo)…')
  const confirmed = []
  let i = 0
  let skippedIntl = 0, skippedNoGenre = 0
  for (const name of names.values()) {
    i++
    const info = await artistInfo(name, env, lcache)
    if (i % 25 === 0) {
      await saveJson(LASTFM_CACHE, lcache)
      process.stdout.write(`  [${i}/${names.size}] varmistettu: ${confirmed.length}\r`)
    }
    if (!info) continue
    if (!isFinnishArtist(info.tags)) { skippedIntl++; continue }
    if (isNationalityCollision(info.tags)) { skippedIntl++; continue }
    const genre = genreFromTags(info.tags, info.name) || 'pop'
    if (!genre) { skippedNoGenre++; continue }
    confirmed.push({ name: info.name, tags: info.tags, genre, listeners: info.listeners, playcount: info.playcount })
  }
  await saveJson(LASTFM_CACHE, lcache)

  // dedup lopullisessa listassa (autocorrect voi tuoda saman artistin eri kirjoitusasuilla)
  const byNorm = new Map()
  for (const c of confirmed) {
    const k = norm(c.name)
    const existing = byNorm.get(k)
    if (!existing || c.playcount > existing.playcount) byNorm.set(k, c)
  }
  const finalList = [...byNorm.values()]

  await saveJson(ARTISTS_FILE, finalList)
  console.log(`\n\nVahvistettuja suomalaisia artisteja: ${finalList.length} (ei-suomalaisia karsittu: ${skippedIntl})`)
  console.log('Kirjoitettu:', ARTISTS_FILE)
  console.log('\nTagien tuotto (uusia nimiä per tagi):')
  console.table(tagReport)
}

/* ============================================================
 * VAIHE 2: tracks — artistin kuunnelluimmat kappaleet + toistomäärä
 * ============================================================ */
async function stageTracks(env) {
  const lcache = await loadJson(LASTFM_CACHE, {})
  const artists = await loadJson(ARTISTS_FILE, [])
  if (!artists.length) throw new Error('data/.pipeline-artists.json puuttuu — aja ensin --stage=discover')

  console.log(`── Vaihe 2: artistTopTracks(limit=50) x ${artists.length} artistia ──`)
  const candidates = new Map()
  let i = 0
  for (const a of artists) {
    i++
    const tracks = await artistTopTracks(a.name, env, lcache, 50)
    for (const t of tracks) {
      if (!t.name || !t.playcount) continue
      if (isJunk(t.name, '')) continue
      const key = dedupKey(a.name, t.name)
      const existing = candidates.get(key)
      const cand = { artistName: a.name, title: t.name, plays: t.playcount, listeners: t.listeners, genre: a.genre }
      if (!existing || cand.plays > existing.plays) candidates.set(key, cand)
    }
    if (i % 25 === 0) { await saveJson(LASTFM_CACHE, lcache); process.stdout.write(`  [${i}/${artists.length}] kandidaatteja: ${candidates.size}\r`) }
  }
  await saveJson(LASTFM_CACHE, lcache)

  const list = [...candidates.values()]

  const plays = list.map((c) => c.plays).sort((x, y) => x - y)
  const pct = (p) => plays[Math.min(plays.length - 1, Math.floor(plays.length * p))]
  console.log(`\n\nKappalekandidaatteja yhteensä: ${list.length}`)
  console.log('Toistomääräjakauma (kaikki kandidaatit):', {
    min: plays[0], p10: pct(0.1), p25: pct(0.25), p50: pct(0.5),
    p75: pct(0.75), p90: pct(0.9), max: plays[plays.length - 1],
  })

  /**
   * iTunes-ratkaisu on kallis (n. 1,4 s/pyyntö), joten sitä ei kannata
   * tuhlata kandidaatteihin joilla ei ikinä ole mahdollisuutta selvitä
   * suosiokarsinnasta. Datasta mitattu: koko 82 000+ kandidaatin joukossa
   * jopa lokerokohtaisen top-4000/genre-rajauksen alapäässä toistomäärä on
   * silti moninkertainen lopulliseen ~130/lokero-turvaverkkoon nähden (ks.
   * BUCKET_TARGET), joten rajaus ei voi tyhjentää yhtäkään lokeroa — se
   * vain jättää pois kappaleet jotka eivät ikinä olisi selvinneet.
   */
  const perGenreCap = Number(flag('candidate-cap-per-genre', 4000))
  const byGenre = new Map()
  for (const c of list) { if (!byGenre.has(c.genre)) byGenre.set(c.genre, []); byGenre.get(c.genre).push(c) }
  const trimmed = []
  const trimReport = {}
  for (const [genre, arr] of byGenre) {
    arr.sort((a, b) => b.plays - a.plays)
    const slice = arr.slice(0, perGenreCap)
    trimmed.push(...slice)
    trimReport[genre] = { ennen: arr.length, jälkeen: slice.length, min_plays_mukaan: slice[slice.length - 1]?.plays }
  }
  console.log(`\niTunes-ratkaisun rajaus (top ${perGenreCap}/genre, suosituimmat ensin):`)
  console.table(trimReport)

  await saveJson(CANDIDATES_FILE, trimmed)
  console.log(`Kirjoitettu: ${CANDIDATES_FILE} (${trimmed.length} kandidaattia jatkokäsittelyyn)`)
}

/* ============================================================
 * VAIHE 3: catalog — artistin koko iTunes-katalogi kerralla (halpa)
 * ============================================================ */
async function stageCatalog() {
  await loadItCache()
  const artistsMeta = await loadJson(ARTISTS_FILE, [])
  const candidates = await loadJson(CANDIDATES_FILE, [])
  if (!candidates.length) throw new Error('data/.pipeline-candidates.json puuttuu — aja ensin --stage=tracks')

  // Vain kandidaateissa esiintyvät artistit tarvitsevat katalogin (ks.
  // candidate-cap-per-genre stageTracks:ssä) — tämä karsii turhat pyynnöt
  // artisteille joiden kappaleilla ei ikinä ollut mahdollisuutta selvitä.
  const genreByArtist = new Map(artistsMeta.map((a) => [norm(a.name), a.genre]))
  const wantedNames = new Map()
  for (const c of candidates) {
    const k = norm(c.artistName)
    if (!wantedNames.has(k)) wantedNames.set(k, { name: c.artistName, genre: genreByArtist.get(k) || c.genre })
  }
  // pop/rap/iskelma ensin (ks. LOW_COVERAGE_GENRES): ne tarvitsevat jokaisen
  // ratkaistun kappaleen täyttääkseen lokeronsa, rockilla on ylitarjontaa.
  const artists = [...wantedNames.values()].sort((a, b) => {
    const pa = LOW_COVERAGE_GENRES.has(a.genre) ? 0 : 1
    const pb = LOW_COVERAGE_GENRES.has(b.genre) ? 0 : 1
    return pa - pb
  })
  const catalog = await loadJson(CATALOG_FILE, {})
  const deadline = Date.now() + TIME_BUDGET_MS

  console.log(`── Vaihe 3: iTunes-katalogit (${artists.length} artistia tarvitaan kandidaattien perusteella, jo valmiina: ${Object.keys(catalog).length}, pop/rap/iskelma priorisoitu) ──`)
  let processed = 0, skipped = 0, timedOut = false
  for (const a of artists) {
    const key = norm(a.name)
    if (catalog[key]) { skipped++; continue }
    if (Date.now() > deadline) { timedOut = true; break }

    let artistId = null
    try { artistId = await resolveArtistId(a.name) } catch { /* verkkovirhe: yritetään uudestaan seuraavalla ajolla */ }
    if (artistId === null) { catalog[key] = { artistId: null, tracks: [] }; processed++; continue }

    let tracks = []
    try { tracks = await fetchArtistCatalog(artistId) } catch { continue }

    catalog[key] = {
      artistId,
      tracks: tracks.filter((t) => t.previewUrl).map((t) => ({
        trackId: t.trackId, trackName: t.trackName, collectionName: t.collectionName,
        releaseDate: t.releaseDate, artworkUrl100: t.artworkUrl100, previewUrl: t.previewUrl,
        artistName: t.artistName, trackCount: t.trackCount,
      })),
    }
    processed++
    if (processed % 10 === 0) {
      await saveItCache()
      await saveJson(CATALOG_FILE, catalog)
      process.stdout.write(`  käsitelty ${processed} uutta, ohitettu (valmis) ${skipped}\r`)
    }
  }
  await saveItCache()
  await saveJson(CATALOG_FILE, catalog)

  const remaining = artists.filter((a) => !catalog[norm(a.name)]).length
  console.log(`\n\nVaihe 3 tämä ajo: ${processed} uutta katalogia, ${skipped} oli jo valmiina.`)
  console.log(`iTunes-välimuisti: ${itHits} osumaa, ${itMisses} uutta pyyntöä.`)
  console.log(`Jäljellä ilman katalogia: ${remaining}${timedOut ? ' (aikabudjetti loppui — aja vaihe uudelleen)' : ' (kaikki käsitelty)'}`)
}

/* ============================================================
 * VAIHE 4: match — Last.fm-kappaleet vs. iTunes-katalogi
 * ============================================================ */
function isAltVersionOrJunk(track) {
  return isJunk(track.trackName || '', track.collectionName || '')
}

function matchTrackInCatalog(catalog, wantTitle) {
  let exactCandidates = []
  let partial = null
  let partialScore = -1
  for (const r of catalog) {
    if (!r.previewUrl) continue
    if (isAltVersionOrJunk(r)) continue
    const rTitle = norm(stripParens(r.trackName))
    if (rTitle === wantTitle) { exactCandidates.push(r); continue }
    if (rTitle.includes(wantTitle) || wantTitle.includes(rTitle)) {
      const shorter = Math.min(rTitle.length, wantTitle.length)
      if (shorter >= 4 && shorter > partialScore) { partialScore = shorter; partial = r }
    }
  }
  if (exactCandidates.length) {
    // alkuperäisin julkaisu voittaa (sama biisi voi olla albumilla + singlenä)
    exactCandidates.sort((a, b) => {
      const ta = a.releaseDate ? new Date(a.releaseDate).getTime() : Infinity
      const tb = b.releaseDate ? new Date(b.releaseDate).getTime() : Infinity
      return ta - tb
    })
    return exactCandidates[0]
  }
  return partial
}

function buildSongFromHit(hit, candidate) {
  const isSingle = /-\s*single$/i.test(hit.collectionName || '') || (hit.trackCount || 99) <= 2
  return {
    id: String(hit.trackId),
    artist: hit.artistName,
    title: stripParens(hit.trackName) || hit.trackName,
    fullTitle: hit.trackName,
    album: hit.collectionName || '',
    year: releaseYear(hit),
    artwork: (hit.artworkUrl100 || '').replace('100x100bb', '400x400bb'),
    preview: hit.previewUrl,
    tier: 0,
    genre: candidate.genre,
    era: null,
    artists: deriveArtists(hit.artistName, hit.trackName),
    plays: candidate.plays,
    _isSingle: isSingle,
  }
}

async function stageMatch() {
  const candidates = await loadJson(CANDIDATES_FILE, [])
  const catalog = await loadJson(CATALOG_FILE, {})
  if (!candidates.length) throw new Error('data/.pipeline-candidates.json puuttuu — aja ensin --stage=tracks')

  console.log(`── Vaihe 4: täsmäytys Last.fm-kappale <-> iTunes-katalogi (${candidates.length} kandidaattia) ──`)
  const matched = []
  const unmatched = []
  for (const c of candidates) {
    const entry = catalog[norm(c.artistName)]
    const cat = entry?.tracks || []
    const wantTitle = norm(stripParens(c.title))
    const hit = matchTrackInCatalog(cat, wantTitle)
    if (hit) matched.push(buildSongFromHit(hit, c))
    else unmatched.push(c)
  }
  await saveJson(MATCHED_FILE, matched)
  await saveJson(UNMATCHED_FILE, unmatched)
  console.log(`Täsmäsi katalogista: ${matched.length}`)
  console.log(`Ei täsmännyt (tarvitsee hakuvarmistuksen): ${unmatched.length}`)
  console.log('Kirjoitettu:', MATCHED_FILE, 'ja', UNMATCHED_FILE)
}

/* ============================================================
 * VAIHE 5: resolve-missing — yksittäishaku niille jotka eivät täsmänneet
 * ============================================================ */
async function stageResolveMissing() {
  await loadItCache()
  const unmatched = await loadJson(UNMATCHED_FILE, [])
  const resolved = await loadJson(RESOLVED_MISSING_FILE, [])
  const doneKeys = new Set(resolved.map((s) => dedupKey(s._srcArtist, s._srcTitle)))

  const worklist = unmatched
    .filter((c) => !doneKeys.has(dedupKey(c.artistName, c.title)))
    .sort((a, b) => {
      // pop/rap/iskelma ensin (ks. LOW_COVERAGE_GENRES), sitten suosituimmat ensin
      const pa = LOW_COVERAGE_GENRES.has(a.genre) ? 0 : 1
      const pb = LOW_COVERAGE_GENRES.has(b.genre) ? 0 : 1
      if (pa !== pb) return pa - pb
      return b.plays - a.plays
    })

  console.log(`── Vaihe 5: hakuvarmistus (${worklist.length} jäljellä / ${unmatched.length} yhteensä) ──`)
  const deadline = Date.now() + TIME_BUDGET_MS
  let done = 0, found = 0, notfound = 0, timedOut = false

  for (const c of worklist) {
    if (Date.now() > deadline) { timedOut = true; break }
    const wantTitle = norm(stripParens(c.title))
    const url = 'https://itunes.apple.com/search?' +
      new URLSearchParams({ term: `${c.artistName} ${stripParens(c.title)}`, country: COUNTRY, media: 'music', entity: 'song', limit: '10' })
    let data
    try {
      data = await itGet(url, `resolve:${COUNTRY}:${norm(c.artistName)}|${wantTitle}`)
    } catch {
      notfound++; done++
      resolved.push({ _srcArtist: c.artistName, _srcTitle: c.title, _skip: true })
      continue
    }
    const hit = pickBestItunesMatch(data.results || [], [c.artistName], wantTitle)
    done++
    if (!hit) {
      notfound++
      resolved.push({ _srcArtist: c.artistName, _srcTitle: c.title, _skip: true })
    } else {
      found++
      const song = buildSongFromHit(hit, c)
      song._srcArtist = c.artistName
      song._srcTitle = c.title
      resolved.push(song)
    }
    if (done % 20 === 0) {
      await saveItCache()
      await saveJson(RESOLVED_MISSING_FILE, resolved)
      process.stdout.write(`  [${done}/${worklist.length}] löytyi ${found}, ei löytynyt ${notfound}\r`)
    }
  }
  await saveItCache()
  await saveJson(RESOLVED_MISSING_FILE, resolved)
  console.log(`\n\nTämä ajo: ${done} käsitelty, ${found} löytyi, ${notfound} ei löytynyt.`)
  console.log(`iTunes-välimuisti: ${itHits} osumaa, ${itMisses} uutta pyyntöä.`)
  const stillLeft = worklist.length - done
  console.log(stillLeft > 0
    ? `Jäljellä: ${stillLeft}${timedOut ? ' (aikabudjetti loppui — aja vaihe uudelleen)' : ''}`
    : 'Kaikki käsitelty.')
}

/* ============================================================
 * VAIHE 6: finalize — suosiokarsinta, tier, skeema, src/data/songs.json
 * ============================================================ */

/** Käyttäjän pyytämä alaraja: "yli miljoona striimiä sisään, alle miljoona ulos". */
const PLAYS_FLOOR = 1_000_000

/**
 * Jokaisessa 12 genre×aikakausi-lokerossa taataan vähintään tämä monta
 * (lokeron kuunnelluinta kärkeä) VAIKKA ne jäisivät alarajan alle — muuten
 * klassikot- ja iskelmä-tyyppiset lokerot tyhjenisivät kokonaan, koska
 * Last.fm:n toistomäärä on rakenteellisesti pienempi vanhoille/ei-rock-
 * genreille (ks. LOW_COVERAGE_GENRES-kommentti). Tavoite on kannan
 * vaatimus "vähintään ~80 biisiä per lokero" plus puskuri, jotta tier-
 * kvantiilijako ja päivittäisarvonta eivät ajaudu toistamaan biisejä.
 * Tämä on VAIN backfill-turvaverkko: ensisijainen keino kasvattaa lokeroa
 * on löytää enemmän oikeasti kuunneltuja biisejä (tagihaku), ei löysätä
 * alarajaa.
 */
const BUCKET_TARGET = Number(flag('bucket-target', 130))
/** Yläraja per lokero, ettei yksikään genre×aikakausi-yhdistelmä (rock on
 *  Last.fm:llä ylitarjonnassa) syö koko 2 000–3 500 biisin tavoitetta yksin. */
const BUCKET_CAP = Number(flag('bucket-cap', 400))

function scoreTier(song) {
  return song.plays || 0
}

const TIER_QUANTILES = [0.1, 0.3, 0.6, 0.85]

/** Vaikeustasot kvantiileittain genre×aikakausi-lokeron SISÄLLÄ, ei koko
 *  kannan yli — muuten kapea lokero (esim. rap/2020) menisi vinoon. */
function assignTiersByQuantile(songs) {
  const buckets = new Map()
  for (const s of songs) {
    const key = `${s.genre}|${s.era}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(s)
  }
  for (const list of buckets.values()) {
    const scored = list.map((s) => ({ s, score: scoreTier(s) }))
    scored.sort((a, b) => b.score - a.score)
    const n = scored.length
    scored.forEach((item, i) => {
      const p = n > 1 ? i / n : 0
      const tier = TIER_QUANTILES.findIndex((cut) => p < cut) + 1
      item.s.tier = tier === 0 ? 5 : tier
    })
  }
}

function quantiles(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return { n: s.length, min: s[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), max: s[s.length - 1] }
}

async function checkAudioSample(songs, n = 25) {
  const sample = [...songs].sort(() => Math.random() - 0.5).slice(0, n)
  let ok = 0
  const results = []
  for (const s of sample) {
    try {
      const res = await fetch(s.preview, { headers: { Range: 'bytes=0-1023' } })
      const good = res.status === 200 || res.status === 206
      if (good) ok++
      results.push({ artist: s.artist, title: s.title, status: res.status })
    } catch (err) {
      results.push({ artist: s.artist, title: s.title, status: 'ERR:' + err.message })
    }
  }
  return { ok, total: sample.length, results }
}

async function stageFinalize() {
  const matched = await loadJson(MATCHED_FILE, [])
  const resolvedMissing = (await loadJson(RESOLVED_MISSING_FILE, [])).filter((s) => !s._skip)
  console.log(`── Vaihe 6: finalize ── (katalogista: ${matched.length}, hakuvarmistuksesta: ${resolvedMissing.length})`)

  const all = [...matched, ...resolvedMissing]

  // dedup: id ensin, sitten artisti+nimi (parempi plays voittaa)
  const byId = new Map()
  for (const s of all) {
    if (!s.id || !s.preview) continue
    const existing = byId.get(s.id)
    if (!existing || (s.plays || 0) > (existing.plays || 0)) byId.set(s.id, s)
  }
  const byKey = new Map()
  for (const s of byId.values()) {
    const key = dedupKey(s.artist, s.title)
    const existing = byKey.get(key)
    if (!existing || (s.plays || 0) > (existing.plays || 0)) byKey.set(key, s)
  }
  const deduped = [...byKey.values()]
  for (const s of deduped) s.era = eraOf(s.year)

  console.log(`\nYhdistetty ja deduplikoitu: ${deduped.length} biisiä (raakana ${all.length})`)

  // Toistomääräjakauma per lokero ENNEN karsintaa
  const preBuckets = new Map()
  for (const s of deduped) {
    const key = `${s.genre}|${s.era}`
    if (!preBuckets.has(key)) preBuckets.set(key, [])
    preBuckets.get(key).push(s.plays)
  }
  console.log(`\nToistomääräjakauma per lokero ENNEN suosiokarsintaa (alaraja=${PLAYS_FLOOR.toLocaleString('fi-FI')}):`)
  const preReport = {}
  for (const [key, plays] of preBuckets) preReport[key] = quantiles(plays)
  console.table(preReport)

  // Suosiokarsinta: alaraja JA lokerokohtainen turvaverkko (backfill) + katto
  const kept = []
  const bucketReport = {}
  for (const [key, plays] of preBuckets) {
    const list = deduped.filter((s) => `${s.genre}|${s.era}` === key).sort((a, b) => b.plays - a.plays)
    const meetingFloor = list.filter((s) => s.plays >= PLAYS_FLOOR).length

    const bucketKept = []
    for (let i = 0; i < list.length && bucketKept.length < BUCKET_CAP; i++) {
      const s = list[i]
      if (s.plays >= PLAYS_FLOOR || i < BUCKET_TARGET) bucketKept.push(s)
    }
    kept.push(...bucketKept)
    bucketReport[key] = {
      saatavilla: list.length,
      ylitti_alarajan: meetingFloor,
      mukaan: bucketKept.length,
      backfill: meetingFloor < BUCKET_TARGET
        ? `KYLLÄ (${Math.min(BUCKET_TARGET, list.length) - meetingFloor} kpl alarajan alta)` : 'ei',
    }
  }
  console.log(`\nSuosiokarsinnan lokeriraportti (alaraja=${PLAYS_FLOOR.toLocaleString('fi-FI')}, lokerokohtainen turvaverkko=${BUCKET_TARGET}, katto=${BUCKET_CAP}):`)
  console.table(bucketReport)
  console.log(`Karsinta pudotti ${deduped.length - kept.length} biisiä (${deduped.length} -> ${kept.length}).`)

  assignTiersByQuantile(kept)

  const finalSongs = kept
    .map(({ id, artist, title, fullTitle, album, year, artwork, preview, tier, genre, era, artists, plays }) => ({
      id, artist, title, fullTitle, album, year, artwork, preview, tier, genre, era, artists, plays,
    }))
    .sort((a, b) => a.tier - b.tier || b.plays - a.plays || a.artist.localeCompare(b.artist, 'fi') || a.title.localeCompare(b.title, 'fi'))

  /* ---------- verifiointiraportti ---------- */
  console.log(`\n══ Lopullinen kanta: ${finalSongs.length} biisiä ══`)

  const cross = {}
  for (const s of finalSongs) { cross[s.genre] ??= {}; cross[s.genre][s.era] = (cross[s.genre][s.era] || 0) + 1 }
  console.log('\nGenre × aikakausi:')
  console.table(cross)

  const perTier = {}
  for (const s of finalSongs) perTier[s.tier] = (perTier[s.tier] || 0) + 1
  console.log('Tier-jakauma:', perTier)

  console.log('\nplays-jakauma per lokero (LOPULLINEN kanta):')
  const finalBuckets = new Map()
  for (const s of finalSongs) {
    const key = `${s.genre}|${s.era}`
    if (!finalBuckets.has(key)) finalBuckets.set(key, [])
    finalBuckets.get(key).push(s.plays)
  }
  const finalReport = {}
  for (const [key, plays] of finalBuckets) finalReport[key] = quantiles(plays)
  console.table(finalReport)

  // skeematarkistus
  const ids = new Set(finalSongs.map((s) => s.id))
  const dupIds = finalSongs.length - ids.size
  const keys = new Set()
  let dupKeys = 0
  for (const s of finalSongs) { const k = dedupKey(s.artist, s.title); if (keys.has(k)) dupKeys++; keys.add(k) }
  const badPreview = finalSongs.filter((s) => !s.preview?.startsWith('https://') || !s.preview.includes('apple'))
  const badGenre = finalSongs.filter((s) => !['rock', 'rap', 'pop', 'iskelma'].includes(s.genre))
  const badEra = finalSongs.filter((s) => !['2020', '2010', 'klassikot'].includes(s.era))
  const medleys = finalSongs.filter((s) => isMedley(s.fullTitle))
  console.log('\nSkeematarkistus:', {
    uniikkeja_id: ids.size, duplikaatti_id: dupIds, duplikaatti_artisti_nimi: dupKeys,
    virheellinen_preview: badPreview.length, virheellinen_genre: badGenre.length,
    virheellinen_era: badEra.length, hittikimaroita: medleys.length,
  })

  const multiArtist = finalSongs.filter((s) => s.artists.length > 1)
  console.log(`\nBiisejä joilla >1 artisti (artists[]): ${multiArtist.length} / ${finalSongs.length}`)
  const uskomaton = finalSongs.find((s) => norm(s.artist) === norm('Elastinen') && norm(s.title).includes('uskomaton'))
  console.log('Testi "Elastinen – Uskomaton":', uskomaton
    ? { artist: uskomaton.artist, fullTitle: uskomaton.fullTitle, artists: uskomaton.artists, plays: uskomaton.plays, tier: uskomaton.tier }
    : 'EI LÖYTYNYT KANNASTA')

  if (DRY) {
    console.log('\n(kuiva ajo, ei kirjoitettu tiedostoon)')
    return finalSongs
  }

  await writeFile(OUT, JSON.stringify(finalSongs, null, 1) + '\n', 'utf8')
  console.log(`\nKirjoitettu: ${OUT}`)

  console.log('\nÄäninäyteotos (25 kpl, HTTP Range-pyyntö)…')
  const audio = await checkAudioSample(finalSongs, 25)
  console.log(`Ääninäytteet: ${audio.ok}/${audio.total} vastasi 200/206`)
  console.table(audio.results)

  console.log('\nTunnettuustarkistus — tier 1 per lokero (10 kpl, nimi + plays):')
  for (const genre of ['rock', 'rap', 'pop', 'iskelma']) {
    for (const era of ['2020', '2010', 'klassikot']) {
      const list = finalSongs.filter((s) => s.genre === genre && s.era === era && s.tier === 1).slice(0, 10)
      console.log(`\n  ${genre} / ${era} (tier 1, ${list.length} näytetty):`)
      for (const s of list) console.log(`    ${s.artist} – ${s.title}  (plays: ${s.plays.toLocaleString('fi-FI')})`)
    }
  }

  return finalSongs
}

/* ============================================================ */

async function main() {
  const env = await loadEnv()
  if (STAGE === 'discover') return stageDiscover(env)
  if (STAGE === 'tracks') return stageTracks(env)
  if (STAGE === 'catalog') return stageCatalog()
  if (STAGE === 'match') return stageMatch()
  if (STAGE === 'resolve-missing') return stageResolveMissing()
  if (STAGE === 'finalize') return stageFinalize()
  throw new Error(`Tuntematon --stage=${STAGE}. Käytä: discover | tracks | catalog | match | resolve-missing | finalize`)
}

main().catch(async (err) => {
  await saveItCache()
  console.error(err)
  process.exit(1)
})
