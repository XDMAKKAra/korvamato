/**
 * Pelin kategoriat: aikakausi ja genre.
 *
 * Molemmat johdetaan biisidatasta hakuvaiheessa (scripts/), ei käsin —
 * `era` päivämäärästä ja `genre` Applen genretiedosta artistipäättelyn kera.
 */
import type { Era, Genre, Song } from '../types'

export interface Category<T extends string> {
  id: T
  name: string
  short: string
}

export const ERAS: Category<Era>[] = [
  { id: '2020', name: '2020-luku', short: "'20" },
  { id: '2010', name: '2010-luku', short: "'10" },
  { id: 'klassikot', name: 'Klassikot 1970–2010', short: 'Klassikot' },
]

/**
 * Valittavat genret.
 *
 * Rappi puuttuu tarkoituksella: räppibiisit ovat kannassa ja tulevat vastaan
 * sekoituksessa, mutta omaa suodatinnappia niille ei tarjota. Genrevalinta on
 * pelaajan mieltymys, ei kannan sisällysluettelo.
 */
export const GENRES: Category<Genre>[] = [
  { id: 'rock', name: 'Rokki', short: 'Rokki' },
  { id: 'pop', name: 'Pop', short: 'Pop' },
  { id: 'iskelma', name: 'Iskelmä', short: 'Iskelmä' },
]

/** Aikakausi julkaisuvuodesta. Tuntematon vuosi menee klassikoihin. */
export function eraOf(year: number | null): Era {
  if (year === null || !Number.isFinite(year)) return 'klassikot'
  if (year >= 2020) return '2020'
  if (year >= 2010) return '2010'
  return 'klassikot'
}

export interface Filter {
  era: Era | null
  genre: Genre | null
}

export const ALL: Filter = { era: null, genre: null }

export function matches(song: Song, filter: Filter): boolean {
  if (filter.era && song.era !== filter.era) return false
  if (filter.genre && song.genre !== filter.genre) return false
  return true
}

export function filterSongs(songs: Song[], filter: Filter): Song[] {
  return songs.filter((s) => matches(s, filter))
}

/** Vakaa avain tallennukseen ja arvontaan: "kaikki", "2010", "rock", "2010-rock". */
export function filterKey(filter: Filter): string {
  return [filter.era, filter.genre].filter(Boolean).join('-') || 'kaikki'
}

export function filterLabel(filter: Filter): string {
  const era = ERAS.find((e) => e.id === filter.era)
  const genre = GENRES.find((g) => g.id === filter.genre)
  if (era && genre) return `${genre.name} · ${era.name}`
  return genre?.name ?? era?.name ?? 'Kaikki biisit'
}

/**
 * Kuinka monta biisiä kategoriassa pitää olla, jotta se kannattaa tarjota.
 *
 * Kierrokselle arvotaan kuusi biisiä eri vaikeustasoilta eikä sama artisti saa
 * toistua, joten kourallinen biisejä tuottaisi joka kerta saman kierroksen.
 */
export const MIN_PLAYABLE = 30

/**
 * Ne aikakaudet joista valitulla genrellä on oikeasti pelattavaa.
 *
 * Genret eivät jakaudu tasaisesti vuosikymmenille: suomiräppiä ei juuri ole
 * ennen 2000-lukua, ja 2020-luvun iskelmästä on vain kourallinen tunnettuja.
 * Siksi aikakausivalikoima riippuu genrestä eikä käyttäjälle tarjota
 * yhdistelmiä, joita ei voi pelata.
 */
export function availableEras(songs: Song[], genre: Genre | null): Category<Era>[] {
  return ERAS.filter((e) => filterSongs(songs, { genre, era: e.id }).length >= MIN_PLAYABLE)
}

/** Genret joista on ylipäätään pelattavaa. */
export function availableGenres(songs: Song[], era: Era | null): Category<Genre>[] {
  return GENRES.filter((g) => filterSongs(songs, { genre: g.id, era }).length >= MIN_PLAYABLE)
}
