import type { Song } from '../types'

/** Pienet kirjaimet, ei ääkkösiä eikä välimerkkejä – vertailua varten. */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Näytettävä nimi. Käyttää `fullTitle`ä, jotta feat-vieras näkyy: pelkkä
 * "Elastinen – Uskomaton" salaa että kappaleella on myös Sara Bee, ja
 * juuri sillä nimellä pelaaja saattoi biisin etsiäkin.
 */
export function songLabel(song: Song): string {
  return `${song.artist} – ${song.fullTitle || song.title}`
}

/**
 * Kaikki tekstit joista hakusanaa etsitään: artistit (myös feat-vieraat),
 * biisin nimi ja koko nimi sulkeineen.
 */
function haystack(song: Song): string {
  const artists = song.artists?.length ? song.artists : [song.artist]
  return normalize([...artists, song.title, song.fullTitle].join(' '))
}

/** Sama biisi vaikka eri julkaisu (esim. albumi vs. kokoelma). */
export function isSameSong(a: Song, b: Song): boolean {
  if (a.id === b.id) return true
  return normalize(a.artist) === normalize(b.artist) && normalize(a.title) === normalize(b.title)
}

interface Scored {
  song: Song
  score: number
}

/**
 * Hakee biisejä vapaalla tekstillä. Osuu sekä artistiin että biisin nimeen,
 * ja sietää kirjoitusasun heitot ("kaarija" löytää Käärijän).
 */
export function searchSongs(query: string, songs: Song[], limit = 8): Song[] {
  const q = normalize(query)
  if (q.length < 1) return []

  const tokens = q.split(' ').filter(Boolean)
  const out: Scored[] = []

  for (const song of songs) {
    const artist = normalize(song.artist)
    const title = normalize(song.title)
    const both = `${artist} ${title}`
    // Haku osuu myös feat-vieraisiin, joten "sara bee" löytää
    // "Elastinen – Uskomaton (feat. Sara Bee)".
    const all = haystack(song)
    const guests = (song.artists ?? []).slice(1).map(normalize)

    let score = 0

    if (both === q || title === q) score = 1000
    else if (title.startsWith(q)) score = 700
    else if (artist.startsWith(q)) score = 600
    else if (both.startsWith(q)) score = 550
    // Feat-vieras on täysi osuma, mutta jää pääartistin osumien jälkeen.
    else if (guests.some((g) => g === q)) score = 520
    else if (guests.some((g) => g.startsWith(q))) score = 480
    else {
      // Kaikkien hakusanojen on löydyttävä jostain.
      const allPresent = tokens.every((t) => all.includes(t))
      if (!allPresent) continue
      score = 300
      // Bonus jos sana alkaa sanarajalta eikä keskeltä.
      for (const t of tokens) {
        if (new RegExp(`(^| )${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(all)) score += 25
      }
    }

    out.push({ song, score })
  }

  /*
   * Yhtä hyvien osumien järjestys ratkaistaan TOISTOMÄÄRÄLLÄ, ei nimen
   * pituudella eikä aakkosilla.
   *
   * Aiemmin lyhyt nimi sai paremmat pisteet (`700 - title.length`), jolloin
   * hakusanalla "par" nouseva ehdotus saattoi olla tuntematon lyhytnimineen
   * biisi tunnettujen ohi. Se näytti siltä kuin haku vihjaisisi vastausta.
   * Haku ei tiedä eikä ole koskaan tiennyt oikeaa vastausta – mutta nyt
   * järjestys on myös perusteltu: tunnetuin ensin, kuten pelaaja odottaa.
   */
  out.sort(
    (a, b) =>
      b.score - a.score ||
      (b.song.plays ?? 0) - (a.song.plays ?? 0) ||
      a.song.artist.localeCompare(b.song.artist, 'fi'),
  )

  // Sama biisi voi olla kannassa useana julkaisuna – näytetään vain yksi.
  const seen = new Set<string>()
  const unique: Song[] = []
  for (const { song } of out) {
    const key = `${normalize(song.artist)}|${normalize(song.title)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(song)
    if (unique.length >= limit) break
  }
  return unique
}
