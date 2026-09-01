/**
 * Spotifyn Web API -asiakas biisikannan hakua varten.
 *
 * Spotify on paras saatavilla oleva lähde tähän peliin kahdesta syystä:
 *
 *   1. `popularity` (0–100) on vakaa suosiomittari. Se EI ole striimimäärä –
 *      mikään julkinen rajapinta ei kerro toistokertoja – mutta se on
 *      johdonmukainen, toisin kuin Deezerin `rank`, joka antoi tuntemattomalle
 *      bändille 981 001 ja Käärijän Cha Cha Challe 580 222.
 *   2. Artistien `genres` on suomalaisittain osuva ("finnish pop", "suomirap",
 *      "iskelma"), ja se toimii samalla kansallisuussuodattimena – Applen ja
 *      Deezerin genret luokittelevat esim. Portion Boysin väärin.
 *
 * Ääninäytettä täältä EI oteta: Spotify poisti `preview_url`in useimmilta
 * kappaleilta, joten pysyvä 30 sekunnin näyte haetaan yhä iTunesista.
 *
 * Tunnukset luetaan projektin juuren .env-tiedostosta (ks. .env.example).
 * Client Credentials -kulku riittää; käyttäjän kirjautumista ei tarvita.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- tunnukset ---------- */

/** Lukee .env-tiedoston yksinkertaisena avain=arvo-listana. */
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

let token = null
let tokenExpiresAt = 0

/**
 * Hakee (ja uusii) sovellustunnuksen. Token on voimassa tunnin; uusitaan
 * minuuttia ennen vanhenemista, ettei pitkä ajo katkea kesken.
 */
export async function getToken(env) {
  if (token && Date.now() < tokenExpiresAt) return token

  const id = env.SPOTIFY_CLIENT_ID
  const secret = env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error(
      'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET puuttuu. ' +
        'Kopioi .env.example -> .env ja täytä tunnukset (developer.spotify.com/dashboard).',
    )
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify-tunnistautuminen epäonnistui (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  token = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return token
}

/* ---------- pyynnöt ---------- */

/**
 * Tahdistin. Spotify ei julkaise tarkkaa kiintiötä, mutta ~10 pyyntöä/s on
 * turvallinen. Kuristuksesta tulee 429 ja `Retry-After`-otsake sekunteina,
 * jota on pakko noudattaa – muuten kiintiö vain kiristyy.
 */
const MIN_INTERVAL_MS = 100
let nextSlot = 0

async function throttle() {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_INTERVAL_MS
  if (slot > now) await sleep(slot - now)
}

export const stats = { hits: 0, misses: 0, throttled: 0 }

/**
 * Yksi API-kutsu välimuistilla.
 *
 * Kuristusta (429) tai palvelinvirhettä EI koskaan talleteta välimuistiin.
 * Deezer-putkessa juuri se virhe myrkytti 8 688 merkintää 9 868:sta ja pudotti
 * suosiotiedon kattavuuden 25 prosenttiin.
 *
 * @param cache muokattava välimuistiolio (avain -> vastaus tai null)
 */
export async function spGet(path, env, cache, cacheKey) {
  if (cache && cache[cacheKey] !== undefined) {
    stats.hits++
    return cache[cacheKey]
  }
  stats.misses++

  const url = path.startsWith('http') ? path : `https://api.spotify.com/v1/${path.replace(/^\//, '')}`

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await throttle()
      const bearer = await getToken(env)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } })

      if (res.status === 429) {
        stats.throttled++
        const wait = Number(res.headers.get('retry-after') || 2)
        await sleep((Number.isFinite(wait) ? wait : 2) * 1000 + 250)
        continue
      }
      if (res.status === 401) {
        // Token vanheni kesken ajon – pakotetaan uusinta ja yritetään heti.
        token = null
        tokenExpiresAt = 0
        continue
      }
      if (res.status === 404) {
        if (cache) cache[cacheKey] = null
        return null
      }
      if (res.status >= 500) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      if (!res.ok) {
        if (cache) cache[cacheKey] = null
        return null
      }

      const data = await res.json()
      if (cache) cache[cacheKey] = data
      return data
    } catch {
      await sleep(500 * 2 ** attempt)
    }
  }
  // Toistuva epäonnistuminen on ohimenevä eikä tulos – ei talleteta.
  return null
}

/* ---------- kyselyt ---------- */

/** Hakee soittolistoja vapaalla haulla. */
export async function searchPlaylists(query, env, cache, limit = 50) {
  const qs = new URLSearchParams({ q: query, type: 'playlist', limit: String(limit), market: 'FI' })
  const data = await spGet(`search?${qs}`, env, cache, `sp:pl:${query}:${limit}`)
  return (data?.playlists?.items || []).filter(Boolean)
}

/** Hakee kappaleita vapaalla haulla (esim. `genre:"suomirap" year:2020-2026`). */
export async function searchTracks(query, env, cache, limit = 50, offset = 0) {
  const qs = new URLSearchParams({
    q: query, type: 'track', limit: String(limit), offset: String(offset), market: 'FI',
  })
  const data = await spGet(`search?${qs}`, env, cache, `sp:tr:${query}:${limit}:${offset}`)
  return (data?.tracks?.items || []).filter(Boolean)
}

/** Soittolistan kaikki kappaleet, sivutus hoidettuna. */
export async function playlistTracks(playlistId, env, cache, max = 200) {
  const out = []
  for (let offset = 0; offset < max; offset += 100) {
    const qs = new URLSearchParams({
      limit: '100', offset: String(offset), market: 'FI',
      fields: 'items(track(id,name,popularity,explicit,album(id,name,release_date),artists(id,name))),next',
    })
    const data = await spGet(`playlists/${playlistId}/tracks?${qs}`, env, cache, `sp:plt:${playlistId}:${offset}`)
    const items = data?.items || []
    for (const it of items) if (it?.track?.id) out.push(it.track)
    if (!data?.next || items.length === 0) break
  }
  return out
}

/** Artistien tiedot erissä (genres, popularity, followers). Enintään 50/kutsu. */
export async function artistsBatch(ids, env, cache) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const data = await spGet(`artists?ids=${chunk.join(',')}`, env, cache, `sp:ar:${chunk.join(',')}`)
    for (const a of data?.artists || []) if (a?.id) out.set(a.id, a)
  }
  return out
}

/** Kappaleiden tiedot erissä (popularity puuttuu soittolistavastauksista joskus). */
export async function tracksBatch(ids, env, cache) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const data = await spGet(`tracks?ids=${chunk.join(',')}&market=FI`, env, cache, `sp:tb:${chunk.join(',')}`)
    for (const t of data?.tracks || []) if (t?.id) out.set(t.id, t)
  }
  return out
}

/** Artistin suosituimmat kappaleet Suomen markkinalla. */
export async function artistTopTracks(artistId, env, cache) {
  const data = await spGet(`artists/${artistId}/top-tracks?market=FI`, env, cache, `sp:top:${artistId}`)
  return data?.tracks || []
}

/** Artistin albumit (singlet mukaan lukien), sivutettuna. */
export async function artistAlbums(artistId, env, cache, max = 100) {
  const out = []
  for (let offset = 0; offset < max; offset += 50) {
    const qs = new URLSearchParams({
      include_groups: 'album,single', limit: '50', offset: String(offset), market: 'FI',
    })
    const data = await spGet(`artists/${artistId}/albums?${qs}`, env, cache, `sp:alb:${artistId}:${offset}`)
    const items = data?.items || []
    out.push(...items)
    if (!data?.next || items.length === 0) break
  }
  return out
}

/* ---------- johdettu tieto ---------- */

/**
 * Onko artisti suomalainen? Spotifyn genretunnisteet ovat tässä poikkeuksellisen
 * käyttökelpoisia: suomalaisilla artisteilla on lähes poikkeuksetta jokin
 * "finnish …" tai suomenkielinen tunniste. Tämä korvaa kansainvälisten
 * megatähtien käsin ylläpidetyn kieltolistan.
 */
export function isFinnishArtist(artist) {
  const genres = (artist?.genres || []).map((g) => g.toLowerCase())
  return genres.some((g) =>
    /finnish|suomi|suomirap|suomipop|iskelma|iskelmä|rautalanka|humppa|finntroll|finland/.test(g),
  )
}

/**
 * Pelin genre Spotifyn artistitunnisteista.
 *
 * Järjestys ratkaisee: iskelmä ensin (se on kapein ja tarkin tunniste), sitten
 * rap, sitten rock, ja pop viimeisenä oletuksena. Näin "finnish pop rap"
 * päätyy rapiksi eikä popiksi.
 */
export function genreFromSpotify(genres) {
  const g = (genres || []).map((x) => x.toLowerCase()).join(' ')
  if (!g) return null
  if (/iskelma|iskelmä|humppa|tango|schlager/.test(g)) return 'iskelma'
  if (/rap|hip hop|hip-hop|trap|drill/.test(g)) return 'rap'
  if (/rock|metal|punk|grunge|hardcore|emo/.test(g)) return 'rock'
  if (/pop|dance|house|r&b|soul|indie|singer-songwriter|electro/.test(g)) return 'pop'
  return null
}
