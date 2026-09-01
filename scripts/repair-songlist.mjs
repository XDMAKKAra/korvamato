/**
 * Korjaa data/songlist.json:in rivit joita iTunesista ei löytynyt.
 *
 * Arvattu biisin nimi ei aina ole se, jolla kappale on kaupassa – tai kappaletta
 * ei myydä lainkaan. Tämä skripti hakee artistin oikean kappalevalikoiman ja
 * korvaa löytymättömän rivin saman artistin todellisella kappaleella.
 *
 *   node scripts/repair-songlist.mjs --dry    näyttää muutokset kirjoittamatta
 *   node scripts/repair-songlist.mjs          kirjoittaa songlist.json:in
 *
 * Aja tämän jälkeen: npm run songs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { artistMatches, isJunkTitle, norm, stripParens } from './shared.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = join(ROOT, 'data', 'songlist.json')
const SONGS = join(ROOT, 'src', 'data', 'songs.json')

const DRY = process.argv.includes('--dry')
const DELAY_MS = 1400

const JUNK = [
  'karaoke', 'tribute', 'made famous by', 'in the style of', 'instrumental',
  'backing track', 'cover version', 'originally performed', 'live at', 'live in',
]

/** Mistä kohtaa artistin kappalelistaa kunkin vaikeustason biisi poimitaan. */
const TIER_DEPTH = { 1: 0, 2: 2, 3: 8, 4: 15, 5: 24 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let requests = 0

async function itunes(params) {
  const url = 'https://itunes.apple.com/search?' + new URLSearchParams(params)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (requests > 0) await sleep(DELAY_MS)
      requests++
      const res = await fetch(url, { headers: { 'User-Agent': 'biisipiste-repair/1.0' } })
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        await sleep(5000 * 2 ** attempt)
        continue
      }
      const text = await res.text()
      if (!text.trim()) {
        await sleep(5000 * 2 ** attempt)
        continue
      }
      return JSON.parse(text).results || []
    } catch {
      await sleep(5000 * 2 ** attempt)
    }
  }
  return []
}

/** Artistin kappaleet kaupassa, siivottuna ja järjestys säilyttäen. */
async function catalogue(artist) {
  const results = await itunes({
    term: artist,
    attribute: 'artistTerm',
    country: 'FI',
    media: 'music',
    entity: 'song',
    limit: '60',
  })

  const seen = new Set()
  const out = []

  for (const r of results) {
    if (!r.previewUrl) continue
    // Vain oikean artistin kappaleet – ei "Inner Circle" kun haettiin "Circle".
    if (!artistMatches(artist, r.artistName)) continue

    const blob = norm(`${r.trackName} ${r.collectionName}`)
    if (JUNK.some((j) => blob.includes(norm(j)))) continue

    const title = stripParens(r.trackName) || r.trackName
    if (isJunkTitle(title)) continue
    const key = norm(title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ artist: r.artistName, title })
  }
  return out
}

function alreadyResolved(want, songs) {
  const wa = norm(want.artist)
  const wt = norm(stripParens(want.title))
  return songs.some((s) => {
    const sa = norm(s.artist)
    const st = norm(s.title)
    const artistOk = sa === wa || sa.includes(wa) || wa.includes(sa)
    const titleOk = st === wt || st.includes(wt) || wt.includes(st)
    return artistOk && titleOk
  })
}

async function main() {
  const list = JSON.parse(await readFile(LIST, 'utf8'))
  let songs = []
  try {
    songs = JSON.parse(await readFile(SONGS, 'utf8'))
  } catch {
    songs = []
  }

  const missing = list.filter((w) => !alreadyResolved(w, songs))
  console.log(`Listassa ${list.length} riviä, joista ${missing.length} ei ratkennut.\n`)

  const byArtist = new Map()
  for (const w of missing) {
    if (!byArtist.has(w.artist)) byArtist.set(w.artist, [])
    byArtist.get(w.artist).push(w)
  }
  console.log(`Haetaan ${byArtist.size} artistin kappalevalikoima…\n`)

  // Nimet jotka ovat jo listalla – ei haluta duplikaatteja.
  const usedTitles = new Set(list.map((w) => `${norm(w.artist)}|${norm(stripParens(w.title))}`))

  const replacements = new Map() // vanha rivi -> uusi rivi tai null (poistetaan)
  let fixed = 0
  let dropped = 0

  for (const [artist, entries] of byArtist) {
    const cat = await catalogue(artist)
    if (cat.length === 0) {
      console.log(`  ${artist}: ei kappaleita kaupassa – poistetaan ${entries.length} riviä`)
      for (const e of entries) {
        replacements.set(e, null)
        dropped++
      }
      continue
    }

    const taken = new Set()
    for (const entry of entries) {
      const start = Math.min(TIER_DEPTH[entry.tier] ?? 0, Math.max(0, cat.length - 1))

      // Etsitään ensimmäinen vapaa kappale halutulta syvyydeltä eteenpäin,
      // ja tarvittaessa kierretään listan alkuun.
      let chosen = null
      for (let i = 0; i < cat.length; i++) {
        const c = cat[(start + i) % cat.length]
        const key = `${norm(c.artist)}|${norm(c.title)}`
        if (taken.has(key) || usedTitles.has(key)) continue
        chosen = c
        taken.add(key)
        usedTitles.add(key)
        break
      }

      if (!chosen) {
        replacements.set(entry, null)
        dropped++
        continue
      }

      replacements.set(entry, { tier: entry.tier, artist: chosen.artist, title: chosen.title })
      fixed++
      console.log(`  taso ${entry.tier}  ${entry.artist} – ${entry.title}`)
      console.log(`          -> ${chosen.artist} – ${chosen.title}`)
    }
  }

  const updated = []
  for (const w of list) {
    if (!replacements.has(w)) {
      updated.push(w)
      continue
    }
    const rep = replacements.get(w)
    if (rep) updated.push(rep)
  }

  updated.sort((a, b) => a.tier - b.tier)

  const perTier = {}
  for (const w of updated) perTier[w.tier] = (perTier[w.tier] || 0) + 1

  console.log(`\n── Yhteenveto ──`)
  console.log(`Korvattu: ${fixed}   Poistettu: ${dropped}   Rivejä nyt: ${updated.length}`)
  console.log(`Tasoittain:`, perTier)

  if (DRY) {
    console.log('(kuiva ajo – tiedostoa ei kirjoitettu)')
    return
  }

  const json =
    '[\n' +
    updated
      .map((w) => `  { "tier": ${w.tier}, "artist": ${JSON.stringify(w.artist)}, "title": ${JSON.stringify(w.title)} }`)
      .join(',\n') +
    '\n]\n'
  await writeFile(LIST, json, 'utf8')
  console.log(`Kirjoitettu: ${LIST}`)
  console.log('Aja seuraavaksi: npm run songs')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
