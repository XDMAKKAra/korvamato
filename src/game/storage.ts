import type { RunState, Stats } from '../types'
import type { Filter } from './categories'
import { ALL, ERAS, GENRES } from './categories'

/**
 * Kesken oleva kierros. Yksi avain riittää, koska pelissä on vain yksi
 * kierros kerrallaan – päivähaaste poistettiin, joten päivämääräkohtaisia
 * tallennuksia ei enää ole.
 */
const RUN_KEY = 'korvamato.run'
const STATS_KEY = 'korvamato.stats'
const FILTER_KEY = 'korvamato.filter'

const EMPTY_STATS: Stats = {
  played: 0,
  bestScore: 0,
  totalScore: 0,
  perfectRounds: 0,
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* selain voi estää tallennuksen – peli toimii silti */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ei kriittistä */
  }
}

/** Kesken jäänyt kierros, jotta sivun päivitys ei hukkaa peliä. */
export function loadRun(): RunState | null {
  return read<RunState>(RUN_KEY)
}

export function saveRun(run: RunState): void {
  if (run.finished) remove(RUN_KEY)
  else write(RUN_KEY, run)
}

export function clearRun(): void {
  remove(RUN_KEY)
}

export function loadStats(): Stats {
  return { ...EMPTY_STATS, ...(read<Stats>(STATS_KEY) ?? {}) }
}

/** Kirjaa päättyneen kierroksen tilastoihin. */
export function recordFinish(score: number, perfectRounds: number): Stats {
  const prev = loadStats()
  const next: Stats = {
    played: prev.played + 1,
    bestScore: Math.max(prev.bestScore, score),
    totalScore: prev.totalScore + score,
    perfectRounds: prev.perfectRounds + perfectRounds,
  }
  write(STATS_KEY, next)
  return next
}

/** Muistettu genre- ja aikakausivalinta. Oletus: kaikki biisit. */
export function loadFilter(): Filter {
  const raw = read<Partial<Filter>>(FILTER_KEY)
  if (!raw) return ALL
  // Tallennettu genre voi olla sellainen jota ei enää tarjota (rappi
  // poistettiin valikosta). Se jäisi näkymättömäksi suodattimeksi: pelaaja saisi
  // vain räppiä eikä yksikään nappi näyttäisi valitulta. Tuntematon arvo
  // pudotetaan takaisin kaikkiin.
  const genre = GENRES.some((g) => g.id === raw.genre) ? raw.genre! : null
  const era = ERAS.some((e) => e.id === raw.era) ? raw.era! : null
  return { era, genre }
}

export function saveFilter(filter: Filter): void {
  write(FILTER_KEY, filter)
}
