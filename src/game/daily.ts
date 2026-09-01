import type { Song } from '../types'
import { TIERS } from './rules'

/** Ensimmäisen pelipäivän päivämäärä – tästä lasketaan pelin numero. */
const EPOCH = Date.UTC(2026, 0, 1)

function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Paikallinen päivämäärä muodossa 2026-09-01 (arvoitus vaihtuu keskiyöllä). */
export function dateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function puzzleNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

const mod = (n: number, m: number) => ((n % m) + m) % m

/**
 * Rakentaa yhden kierroksen: yksi biisi jokaiselta vaikeustasolta.
 *
 * Kunkin tason biisit käydään läpi kiinteässä kierrossa, jonka askel on
 * yhteistekijätön poolin koon kanssa – näin koko pooli tulee käytyä läpi ennen
 * kuin mikään biisi toistuu. Siemen riippuu vain tasosta, ei päivästä.
 */
function buildRun(songs: Song[], step: number, avoid: Set<string>): Song[] {
  const chosen: Song[] = []
  const usedArtists = new Set<string>()

  for (const tier of TIERS) {
    const pool = songs.filter((s) => s.tier === tier.tier)
    if (pool.length === 0) continue

    const salt = hashString(`korvamato-taso-${tier.tier}`)
    const offset = salt % pool.length

    let stride = (salt >>> 8) % pool.length || 1
    while (gcd(stride, pool.length) !== 1) stride = (stride % pool.length) + 1

    const base = offset + step * stride

    let pick: Song | null = null
    for (let attempt = 0; attempt < pool.length; attempt++) {
      const candidate = pool[mod(base + attempt, pool.length)]
      if (!usedArtists.has(candidate.artist) && !avoid.has(candidate.id)) {
        pick = candidate
        break
      }
    }
    // Jos pooli on niin pieni ettei ehtoja voi täyttää, tyydytään peruskohtaan.
    pick = pick ?? pool[mod(base, pool.length)]

    usedArtists.add(pick.artist)
    chosen.push(pick)
  }

  return chosen
}

/**
 * Ketju päivästä 1 haluttuun päivään. Jokainen päivä välttää edellisen päivän
 * biisit, joten sama biisi ei voi tulla kahtena peräkkäisenä päivänä.
 * Välimuistin ansiosta ketju rakennetaan vain kerran.
 */
const chainCache = new Map<string, Song[]>()

function dailyChain(songs: Song[], step: number): Song[] {
  const target = Math.max(0, step)
  const stamp = `${songs.length}`

  let prev: Song[] = []
  for (let s = 0; s <= target; s++) {
    const cacheKey = `${stamp}|${s}`
    const hit = chainCache.get(cacheKey)
    if (hit) {
      prev = hit
      continue
    }
    const run = buildRun(songs, s, new Set(prev.map((x) => x.id)))
    chainCache.set(cacheKey, run)
    prev = run
  }
  return prev
}

/**
 * Valitsee kierroksen biisit.
 *
 * @param index Ohittaa päivämäärän – rajaton tila arpoo tällä satunnaisen
 *              kohdan samasta kierrosta.
 */
export function pickRun(key: string, songs: Song[], index?: number): Song[] {
  if (index !== undefined) return buildRun(songs, index, new Set())

  const step = puzzleNumber(key)
  if (!Number.isFinite(step)) return buildRun(songs, 0, new Set())
  return dailyChain(songs, step)
}

/** Satunnainen kierros rajattomaan tilaan. */
export function randomRunKey(): string {
  return `r${Math.floor(Math.random() * 0xffffffff).toString(36)}${Date.now().toString(36)}`
}
