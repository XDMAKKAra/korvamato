/**
 * Poistaa biisikannasta artistit, jotka eivät tee suomenkielistä musiikkia.
 *
 * Peli on suomenkielinen musiikkivisa. Kannassa oli sekä väärään artistiin
 * osuneita rivejä (nimitörmäys: suomalaisen Diablo-yhtyeen tilalle oli
 * imaistu serbialaisen ja arabiankielisen Diablon koko tuotanto) että
 * suomalaisia artisteja jotka tekevät musiikkia ulkomaille toisella kielellä
 * (Redrama, Nightwish, Blind Channel).
 *
 * Päätöslogiikka on scripts/language.mjs:ssä. Ratkaisu tehdään ARTISTITASOLLA
 * eikä kappaleen nimestä: moni suomenkielinen biisi on englanninkielisellä
 * nimellä, joten nimeä käytetään vain myönteisenä todisteena.
 *
 *   node scripts/filter-language.mjs --dry    näyttää mitä poistuisi
 *   node scripts/filter-language.mjs          kirjoittaa suodatetun kannan
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mbLanguages, decideFinnishLyrics } from './language.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SONGS = join(ROOT, 'src', 'data', 'songs.json')
const CACHE = join(ROOT, 'data', '.language-cache.json')

const DRY = process.argv.includes('--dry')

async function loadJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return fallback }
}

async function main() {
  const songs = await loadJson(SONGS, [])
  const cache = await loadJson(CACHE, {})

  const byArtist = new Map()
  for (const s of songs) {
    if (!byArtist.has(s.artist)) byArtist.set(s.artist, [])
    byArtist.get(s.artist).push(s)
  }

  console.log(`Tarkistetaan ${byArtist.size} artistia (${songs.length} biisiä)…\n`)

  const verdicts = new Map()
  let done = 0
  let mbCalls = 0

  for (const [artist, list] of byArtist) {
    const titles = list.map((s) => s.title)

    // Ensin ilmainen päätös pelkistä nimistä; MusicBrainziin mennään vain jos
    // se ei riitä. Näin verkkopyyntöjä tulee murto-osa artistimäärästä.
    let d = decideFinnishLyrics({ mb: null, titles, tags: [] })
    if (!d.finnish) {
      const mb = await mbLanguages(artist, cache)
      if (mb) mbCalls++
      d = decideFinnishLyrics({ mb, titles, tags: [] })
    }
    verdicts.set(artist, d)

    done++
    if (done % 25 === 0) {
      await writeFile(CACHE, JSON.stringify(cache), 'utf8')
      process.stdout.write(`  ${done}/${byArtist.size} (MusicBrainz-hakuja ${mbCalls})\r`)
    }
  }
  await writeFile(CACHE, JSON.stringify(cache), 'utf8')

  const keep = songs.filter((s) => verdicts.get(s.artist)?.finnish)
  const dropped = [...byArtist.entries()].filter(([a]) => !verdicts.get(a)?.finnish)

  console.log(`\n\n── Tulos ──`)
  console.log(`Artisteja: ${byArtist.size} -> ${byArtist.size - dropped.length} (poistuu ${dropped.length})`)
  console.log(`Biisejä:   ${songs.length} -> ${keep.length} (poistuu ${songs.length - keep.length})`)

  const before = {}
  const after = {}
  for (const s of songs) before[s.genre] = (before[s.genre] || 0) + 1
  for (const s of keep) after[s.genre] = (after[s.genre] || 0) + 1
  console.log('\nGenreittäin:')
  for (const g of Object.keys(before)) {
    console.log(`  ${g.padEnd(8)} ${String(before[g]).padStart(5)} -> ${String(after[g] || 0).padStart(5)}`)
  }

  const bucket = {}
  for (const s of keep) {
    const k = `${s.genre}/${s.era}`
    bucket[k] = (bucket[k] || 0) + 1
  }
  console.log('\nLokeroittain jäljelle:')
  for (const k of Object.keys(bucket).sort()) console.log(`  ${k.padEnd(18)} ${bucket[k]}`)

  console.log(`\nSuurimmat poistuvat artistit:`)
  dropped
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 25)
    .forEach(([a, list]) => console.log(`  ${a} (${list.length} biisiä) — ${verdicts.get(a).reason}`))

  if (!DRY) {
    await writeFile(SONGS, JSON.stringify(keep, null, 1) + '\n', 'utf8')
    console.log(`\nKirjoitettu: ${SONGS}`)
  } else {
    console.log('\n(kuiva ajo, ei kirjoitettu)')
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
