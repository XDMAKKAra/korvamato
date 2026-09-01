/**
 * Karsii kannasta biisit joita kukaan ei tunne, ja täyttää `plays`-kentän.
 *
 * Kanta rakennettiin alun perin laajentamalla artistien koko katalogit, joten
 * sinne päätyi albumitäytettä hittien rinnalle ilman mitään mittaria siitä
 * onko biisi oikeasti kuultu. Last.fm:n `artist.getTopTracks` kertoo artistin
 * **kuunnelluimmat** kappaleet todellisine toistomäärineen, joten se on
 * suoraan se puuttuva mittari.
 *
 * Sääntö: biisi jää kantaan vain jos se löytyy artistin Last.fm-toplistalta ja
 * sen toistomäärä ylittää kynnyksen. Kynnys on porrastettu aikakauden mukaan,
 * koska vanhat klassikot striimaavat vähemmän kuin uudet hitit vaikka kaikki
 * tuntevat ne — sama absoluuttinen raja tyhjentäisi klassikot.
 *
 *   node scripts/prune-unknown.mjs --dry     näyttää mitä poistuisi
 *   node scripts/prune-unknown.mjs           kirjoittaa karsitun kannan
 *   node scripts/prune-unknown.mjs --min=5000  oma kynnys
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { norm, stripParens } from './shared.mjs'
import { loadEnv, artistTopTracks } from './lastfm.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SONGS = join(ROOT, 'src', 'data', 'songs.json')
const CACHE = join(ROOT, 'data', '.lastfm-cache.json')

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const flag = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`))
  return a ? Number(a.split('=')[1]) : d
}

/**
 * Toistomäärän alaraja aikakausittain.
 *
 * 2020-luvun hitit striimaavat moninkertaisesti 1980-luvun klassikoihin
 * verrattuna, joten yksi yhteinen raja joko päästäisi läpi tuntemattomia
 * uutuuksia tai pyyhkisi pois tunnetut vanhat biisit.
 */
const MIN_PLAYS = {
  '2020': flag('min-2020', 8000),
  '2010': flag('min-2010', 6000),
  klassikot: flag('min-klassikot', 3000),
}

async function loadJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return fallback }
}

const key = (artist, title) => `${norm(artist)}|${norm(stripParens(title))}`

async function main() {
  const env = await loadEnv()
  const songs = await loadJson(SONGS, [])
  const cache = await loadJson(CACHE, {})

  const artists = [...new Set(songs.map((s) => s.artist))]
  console.log(`Haetaan Last.fm-toplistat ${artists.length} artistille (${songs.length} biisiä)…\n`)

  /** norm(artisti|nimi) -> toistomäärä */
  const known = new Map()
  let done = 0

  for (const artist of artists) {
    let top = []
    try {
      top = await artistTopTracks(artist, env, cache, 50)
    } catch {
      /* yksittäinen artisti voi jäädä hakematta – biisit putoavat silloin pois */
    }
    for (const t of top) {
      const k = key(artist, t.name)
      known.set(k, Math.max(known.get(k) || 0, t.playcount))
      // Myös feat-artistin oma nimi voi poiketa; talletetaan Last.fm:n oma.
      known.set(key(t.artist, t.name), Math.max(known.get(key(t.artist, t.name)) || 0, t.playcount))
    }
    done++
    if (done % 40 === 0) {
      await writeFile(CACHE, JSON.stringify(cache), 'utf8')
      process.stdout.write(`  ${done}/${artists.length} artistia\r`)
    }
  }
  await writeFile(CACHE, JSON.stringify(cache), 'utf8')

  const kept = []
  const droppedNoMatch = []
  const droppedLowPlays = []

  for (const s of songs) {
    const plays = known.get(key(s.artist, s.title)) ?? 0
    if (plays === 0) {
      droppedNoMatch.push(s)
      continue
    }
    if (plays < (MIN_PLAYS[s.era] ?? 5000)) {
      droppedLowPlays.push({ ...s, plays })
      continue
    }
    kept.push({ ...s, plays })
  }

  console.log(`\n\n── Tulos ──`)
  console.log(`Biisejä: ${songs.length} -> ${kept.length}`)
  console.log(`  ei Last.fm-toplistalla:   ${droppedNoMatch.length}`)
  console.log(`  liian vähän toistoja:     ${droppedLowPlays.length}`)
  console.log(`Kynnykset: 2020-luku ${MIN_PLAYS['2020']}, 2010-luku ${MIN_PLAYS['2010']}, klassikot ${MIN_PLAYS.klassikot}`)

  const bucket = {}
  for (const s of kept) {
    const k = `${s.genre}/${s.era}`
    bucket[k] = (bucket[k] || 0) + 1
  }
  console.log('\nLokeroittain jäljelle:')
  for (const k of Object.keys(bucket).sort()) console.log(`  ${k.padEnd(18)} ${bucket[k]}`)

  console.log('\nParhaat jäljelle jäävät (tarkistusta varten):')
  ;[...kept].sort((a, b) => b.plays - a.plays).slice(0, 15)
    .forEach((s) => console.log(`  ${String(s.plays).padStart(9)}  ${s.artist} – ${s.title}`))

  console.log('\nEsimerkkejä poistuvista (liian vähän toistoja):')
  ;[...droppedLowPlays].sort((a, b) => b.plays - a.plays).slice(0, 10)
    .forEach((s) => console.log(`  ${String(s.plays).padStart(9)}  ${s.artist} – ${s.title}`))

  if (!DRY) {
    kept.sort((a, b) => a.tier - b.tier || b.plays - a.plays)
    await writeFile(SONGS, JSON.stringify(kept, null, 1) + '\n', 'utf8')
    console.log(`\nKirjoitettu: ${SONGS}`)
  } else {
    console.log('\n(kuiva ajo, ei kirjoitettu)')
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
