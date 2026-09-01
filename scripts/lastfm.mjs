/**
 * Last.fm-asiakas biisikannan hakua varten.
 *
 * Last.fm on tämän pelin paras lähde, koska se antaa kolme asiaa jotka muualta
 * puuttuvat:
 *
 *   1. **Oikeat toistomäärät.** `track.getInfo` palauttaa `playcount`in ja
 *      `listeners`in — esim. Käärijän "Cha Cha Cha" 5 402 811 toistoa. Nämä
 *      ovat todellisia kuuntelukertoja, eivät indeksilukuja. Spotify poisti
 *      `popularity`-kentän Dev Mode -sovelluksilta helmikuussa 2026, ja
 *      Deezerin `rank` osoittautui epäluotettavaksi (se antoi tuntemattomalle
 *      bändille suuremman luvun kuin Cha Cha Challe).
 *   2. **Artistin kuunnelluimmat kappaleet.** `artist.getTopTracks` palauttaa
 *      sen mitä ihmiset oikeasti kuuntelevat – Kari Tapiolta "Olen suomalainen"
 *      eikä satunnaista kokoelmalevyn täyteraitaa.
 *   3. **Genre- ja kansallisuustagit.** `finnish`, `iskelma`, `suomirap` jne.
 *      Iskelmä on oma taginsa, mitä se ei ole Applella eikä Deezerillä.
 *
 * Ääninäytettä Last.fm ei anna, joten pysyvä 30 sekunnin näyte haetaan yhä
 * iTunesista. Avain luetaan .env-tiedostosta (LASTFM_API_KEY).
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://ws.audioscrobbler.com/2.0/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function loadEnv() {
  const env = { ...process.env }
  try {
    const text = await readFile(join(ROOT, '.env'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      const value = m[2].replace(/^["']|["']$/g, '')
      if (value) env[m[1]] = value
    }
  } catch {
    /* .env puuttuu – luotetaan ympäristömuuttujiin */
  }
  return env
}

/**
 * Last.fm pyytää enintään ~5 pyyntöä sekunnissa per avain. Tahdistin on
 * globaali, joten rinnakkaisuus ei voi ylittää rajaa.
 */
const MIN_INTERVAL_MS = 220
let nextSlot = 0

async function throttle() {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_INTERVAL_MS
  if (slot > now) await sleep(slot - now)
}

export const stats = { hits: 0, misses: 0, errors: 0 }

/**
 * Yksi API-kutsu välimuistilla.
 *
 * Ohimenevää virhettä EI koskaan talleteta. Deezer-putkessa juuri se virhe
 * myrkytti 8 688 välimuistimerkintää 9 868:sta, koska kuristusvastaus
 * tulkittiin tulokseksi "ei löytynyt". Last.fm:n virhekoodit 11, 16 ja 29
 * (palvelu alhaalla / väliaikainen / rajoitus) käsitellään uudelleenyrityksinä;
 * koodi 6 ("ei löytynyt") on aito tulos ja se talletetaan.
 */
export async function lfm(params, env, cache, cacheKey) {
  if (cache && cache[cacheKey] !== undefined) {
    stats.hits++
    return cache[cacheKey]
  }
  stats.misses++

  const key = env.LASTFM_API_KEY
  if (!key) throw new Error('LASTFM_API_KEY puuttuu .env-tiedostosta.')

  const qs = new URLSearchParams({ ...params, format: 'json', api_key: key })

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await throttle()
      const res = await fetch(`${BASE}?${qs}`, { headers: { 'User-Agent': 'korvamato-buildlib/1.0' } })

      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * 2 ** attempt)
        continue
      }

      const data = await res.json()
      if (data && data.error) {
        // 6 = "ei löytynyt" on aito tulos; loput ovat ohimeneviä.
        if (Number(data.error) === 6) {
          if (cache) cache[cacheKey] = null
          return null
        }
        stats.errors++
        await sleep(1500 * 2 ** attempt)
        continue
      }

      if (cache) cache[cacheKey] = data
      return data
    } catch {
      await sleep(500 * 2 ** attempt)
    }
  }
  return null
}

const num = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

/* ---------- kyselyt ---------- */

/** Tagin kuunnelluimmat kappaleet – tämä on ensisijainen löytökanava. */
export async function tagTopTracks(tag, env, cache, limit = 100, page = 1) {
  const d = await lfm(
    { method: 'tag.getTopTracks', tag, limit: String(limit), page: String(page) },
    env, cache, `tag:${tag}:${limit}:${page}`,
  )
  return d?.tracks?.track || []
}

/** Tagin suosituimmat artistit. */
export async function tagTopArtists(tag, env, cache, limit = 100, page = 1) {
  const d = await lfm(
    { method: 'tag.getTopArtists', tag, limit: String(limit), page: String(page) },
    env, cache, `tagart:${tag}:${limit}:${page}`,
  )
  return d?.topartists?.artist || []
}

/** Artistin kuunnelluimmat kappaleet toistomäärineen. */
export async function artistTopTracks(artist, env, cache, limit = 50) {
  const d = await lfm(
    { method: 'artist.getTopTracks', artist, limit: String(limit), autocorrect: '1' },
    env, cache, `artop:${artist.toLowerCase()}:${limit}`,
  )
  const list = d?.toptracks?.track || []
  return list.map((t) => ({
    name: t.name,
    artist: t.artist?.name || artist,
    playcount: num(t.playcount),
    listeners: num(t.listeners),
  }))
}

/** Artistin tagit ja kokonaistilastot – genre ja kansallisuus tulevat tästä. */
export async function artistInfo(artist, env, cache) {
  const d = await lfm(
    { method: 'artist.getInfo', artist, autocorrect: '1' },
    env, cache, `arinfo:${artist.toLowerCase()}`,
  )
  const a = d?.artist
  if (!a) return null
  return {
    name: a.name,
    tags: (a.tags?.tag || []).map((t) => String(t.name).toLowerCase()),
    listeners: num(a.stats?.listeners),
    playcount: num(a.stats?.playcount),
  }
}

/** Yksittäisen kappaleen todelliset toistomäärät. */
export async function trackInfo(artist, track, env, cache) {
  const d = await lfm(
    { method: 'track.getInfo', artist, track, autocorrect: '1' },
    env, cache, `trinfo:${artist.toLowerCase()}|${track.toLowerCase()}`,
  )
  const t = d?.track
  if (!t) return null
  return {
    name: t.name,
    artist: t.artist?.name || artist,
    playcount: num(t.playcount),
    listeners: num(t.listeners),
    tags: (t.toptags?.tag || []).map((x) => String(x.name).toLowerCase()),
  }
}

/* ---------- johdettu tieto ---------- */

/**
 * Onko artisti suomalainen? Last.fm:n käyttäjät merkitsevät suomalaiset
 * artistit lähes poikkeuksetta tagilla `finnish` tai `suomi`, mikä korvaa
 * kansainvälisten artistien käsin ylläpidetyn kieltolistan.
 */
export function isFinnishArtist(tags) {
  return (tags || []).some((t) => /^(finnish|suomi|finland|suomalainen)/.test(t) || /finnish|suomi/.test(t))
}

/**
 * Pelin genre Last.fm:n tageista.
 *
 * Tagit ovat painotettuja suosion mukaan, mutta järjestys ratkaisee tässä:
 * iskelmä ensin (kapein ja tarkin), sitten rap, rock ja pop viimeisenä
 * oletuksena. `OVERRIDES` on käyttäjän nimenomaisia korjauksia niihin
 * tapauksiin joissa data ja suomalaisen korva ovat eri mieltä.
 */
const OVERRIDES = new Map([
  // Molemmat lähteet luokittelevat nämä rapiksi, mutta ne ovat popbiisejä.
  ['käärijä', 'pop'],
  ['portion boys', 'pop'],
])

export function genreFromTags(tags, artistName = '') {
  const override = OVERRIDES.get(String(artistName).toLowerCase().trim())
  if (override) return override

  const g = (tags || []).join(' ')
  if (!g) return null

  if (/iskelm|humppa|tango|schlager|lavamusiikki/.test(g)) return 'iskelma'

  // Yhdistelmätagit ratkaistaan ennen puhtaita genretarkistuksia. Blind
  // Channelin tageissa on "rap metal", jolloin pelkkä rap-haku luokittelisi
  // metallibändin rapiksi. Rap-rockissa raskaampi puoli ratkaisee.
  if (/rap.?(metal|rock|core)|rapcore|nu.?metal|funk.?metal/.test(g)) return 'rock'

  if (/\brap\b|hip.?hop|\btrap\b|\bdrill\b|räp/.test(g)) return 'rap'
  if (/rock|metal|punk|grunge|hardcore|\bemo\b|progressive/.test(g)) return 'rock'
  if (/pop|dance|electro|house|r&b|soul|indie|singer.songwriter/.test(g)) return 'pop'
  return null
}
