import type { Song } from '../types'

/**
 * Kaikki mitä haku ja arvausten vertailu tarvitsevat. Sekä `Song` (pelattava
 * kanta) että `CatalogEntry` (hakuluettelo) täyttävät tämän, joten sama
 * hakukoodi palvelee molempia.
 */
export interface Searchable {
  artist: string
  title: string
  fullTitle?: string
  artists?: string[]
  plays?: number
}

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
export function songLabel(song: Searchable): string {
  return `${song.artist} – ${song.fullTitle || song.title}`
}

/** Pudottaa sulkeissa olevat lisäkkeet: "Biisi (feat. X)" -> "Biisi". */
export function stripParens(s: string): string {
  return (s || '')
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s*-\s*(feat|ft)\..*$/i, ' ')
    .trim()
}

/**
 * Kaikki tekstit joista hakusanaa etsitään: artistit (myös feat-vieraat),
 * biisin nimi ja koko nimi sulkeineen.
 */
function haystack(song: Searchable): string {
  const artists = song.artists?.length ? song.artists : [song.artist]
  return normalize([...artists, song.title, song.fullTitle].join(' '))
}

/** Sama biisi vaikka eri julkaisu (esim. albumi vs. kokoelma). */
export function isSameSong(a: Song, b: Song): boolean {
  if (a.id === b.id) return true
  return normalize(a.artist) === normalize(b.artist) && normalize(a.title) === normalize(b.title)
}

/**
 * Biisin tunniste nimen perusteella: artisti + nimi ilman sulkeita, ääkkösiä,
 * välimerkkejä ja **välilyöntejä**.
 *
 * Välilyönnit jätetään huomiotta, koska sama kappale on levytetty eri
 * kirjoitusasuilla: Kapasiteettiyksikön "Hei Neidit" ja "Heineidit" ovat sama
 * biisi, samoin Eppu Normaalin "Joka Ikinen Yö" ja "Jokaikinen Yö". Ilman tätä
 * kannassa olisi sama biisi kahdesti, ja pelaaja saisi väärin vaikka kirjoitti
 * oikein – vain eri välilyönnein.
 */
export function songKey(artist: string, title: string): string {
  return `${normalize(artist)}|${normalize(stripParens(title)).replace(/ /g, '')}`
}

/**
 * Osuiko hakuluettelosta valittu rivi oikeaan biisiin?
 *
 * Vertailu on tehtävä nimien perusteella, koska luettelorivillä ei ole id:tä –
 * eikä saa ollakaan (ks. CatalogEntry). Sulkeissa olevat lisäkkeet pudotetaan
 * molemmilta puolilta, jotta "Uskomaton" ja "Uskomaton (feat. Sara Bee)"
 * tarkoittavat samaa biisiä.
 */
export function guessMatches(guess: Searchable, answer: Song): boolean {
  return songKey(guess.artist, guess.title) === songKey(answer.artist, answer.title)
}

interface Scored<T> {
  song: T
  score: number
}

interface NormalizedEntry {
  artist: string
  title: string
  both: string
  all: string
  guests: string[]
}

/**
 * Normalisointi (Unicode NFD -purku + useampi regex) maksaa mitattuna
 * 31 000 rivin hakuluettelolla n. 300 ms per kutsu. Ilman välimuistia se
 * ajettaisiin joka näppäimenpainalluksella jokaiselle riville uudestaan,
 * jolloin kirjoittaminen jää jälkeen: näppäily jonoutuu ja kentän teksti
 * tuntuu ilmestyvän vasta sekuntien viiveellä. Rivin sisältö ei muutu
 * kesken pelin, joten normalisoitu muoto lasketaan vain kerran per rivi ja
 * muistetaan WeakMapissa – uusi näppäily lukee sen sijaan vain valmiin
 * tuloksen.
 */
const normalizedCache = new WeakMap<Searchable, NormalizedEntry>()

function normalizedEntry(song: Searchable): NormalizedEntry {
  const cached = normalizedCache.get(song)
  if (cached) return cached
  const artist = normalize(song.artist)
  const title = normalize(song.title)
  const entry: NormalizedEntry = {
    artist,
    title,
    both: `${artist} ${title}`,
    // Haku osuu myös feat-vieraisiin, joten "sara bee" löytää
    // "Elastinen – Uskomaton (feat. Sara Bee)".
    all: haystack(song),
    guests: (song.artists ?? []).slice(1).map(normalize),
  }
  normalizedCache.set(song, entry)
  return entry
}

/**
 * Hakee biisejä vapaalla tekstillä. Osuu sekä artistiin että biisin nimeen,
 * ja sietää kirjoitusasun heitot ("kaarija" löytää Käärijän).
 */
export function searchSongs<T extends Searchable>(query: string, songs: T[], limit = 8): T[] {
  const q = normalize(query)
  if (q.length < 1) return []

  const tokens = q.split(' ').filter(Boolean)
  const out: Scored<T>[] = []

  for (const song of songs) {
    const { artist, title, both, all, guests } = normalizedEntry(song)

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
   * Yhtä hyvien osumien järjestys ratkaistaan AAKKOSILLA – ei toistomäärällä
   * eikä nimen pituudella.
   *
   * Tämä on hakuluettelon kanssa sama asia kuin luettelon laajuus: pelkkä
   * laaja luettelo ei riitä, jos järjestys nostaa kärkeen juuri ne rivit jotka
   * voivat olla vastaus. Toistomääräjärjestyksessä artistihaun kahdeksan
   * ensimmäistä osumaa olivat käytännössä aina artistin kuunnelluimmat biisit
   * – siis täsmälleen se joukko josta vastaus arvotaan, koska pelattavaan
   * kantaan valitaan kuunnelluin kärki. Ehdotuslista vuosi vastauksen vaikka
   * luettelossa oli 31 000 riviä.
   *
   * Aakkosjärjestys ei tiedä biisin suosiosta mitään, ja se on pelaajalle myös
   * käytettävämpi: pitkää ehdotuslistaa silmäillessä nimen löytää siitä missä
   * sen odottaakin. Osumatarkkuus ratkaisee yhä ensin (tarkka nimi ja alkuosa
   * saavat isommat pisteet), joten kirjoittamalla lisää oikea rivi nousee
   * kärkeen riippumatta siitä mistä kohtaa aakkosia se alkaa.
   */
  out.sort(
    (a, b) =>
      b.score - a.score ||
      a.song.title.localeCompare(b.song.title, 'fi') ||
      a.song.artist.localeCompare(b.song.artist, 'fi'),
  )

  // Sama biisi voi olla kannassa useana julkaisuna – näytetään vain yksi.
  const seen = new Set<string>()
  const unique: T[] = []
  for (const { song } of out) {
    const { artist, title } = normalizedEntry(song)
    const key = `${artist}|${title}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(song)
    if (unique.length >= limit) break
  }
  return unique
}
