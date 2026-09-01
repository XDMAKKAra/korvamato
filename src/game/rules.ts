/**
 * Vihjeen pituudet sekunteina. Kuusi askelta: ensimmäinen on 0,2 s eli
 * käytännössä yksi isku, viimeinen 15 s.
 */
export const STAGES = [0.2, 0.5, 2, 5, 8, 15] as const

/** Arvauksia per biisi: yksi jokaista vihjepituutta kohden. */
export const MAX_GUESSES = STAGES.length

/**
 * Pisteet sen mukaan, monennellako vihjeellä biisi meni oikein. Yksi arvo
 * jokaista vihjepituutta kohden – pituuden kasvaessa pisteet putoavat.
 */
export const STAGE_POINTS = [1000, 750, 550, 400, 250, 100] as const

export interface TierInfo {
  tier: number
  name: string
  short: string
  color: string
  mult: number
}

export const TIERS: TierInfo[] = [
  { tier: 1, name: 'Helppo', short: 'Helppo', color: '#4ade80', mult: 1 },
  { tier: 2, name: 'Keskitaso', short: 'Keski', color: '#a3e635', mult: 1.25 },
  { tier: 3, name: 'Vaikea', short: 'Vaikea', color: '#fbbf24', mult: 1.5 },
  { tier: 4, name: 'Todella vaikea', short: 'Tosi vaikea', color: '#fb7185', mult: 2 },
  { tier: 5, name: 'Mahdoton', short: 'Mahdoton', color: '#c084fc', mult: 3 },
]

export function tierInfo(tier: number): TierInfo {
  return TIERS.find((t) => t.tier === tier) ?? TIERS[0]
}

/** Pisteet yhdestä biisistä: vihjepituus × vaikeustason kerroin. */
export function scoreFor(tier: number, stageIndex: number): number {
  if (stageIndex < 0 || stageIndex >= STAGE_POINTS.length) return 0
  return Math.round(STAGE_POINTS[stageIndex] * tierInfo(tier).mult)
}

/** Suurin mahdollinen tulos: kaikki viisi biisiä 0,1 sekunnista. */
export const MAX_SCORE = TIERS.reduce((sum, t) => sum + Math.round(STAGE_POINTS[0] * t.mult), 0)

/**
 * Jatkuuko kierros vielä tämän arvauksen jälkeen?
 *
 * @param kind          arvauksen laji
 * @param guessesBefore montako arvausta kierroksella oli jo ennen tätä
 */
export function roundContinues(kind: 'vaara' | 'ohitus' | 'oikein', guessesBefore: number): boolean {
  if (kind === 'oikein') return false
  return guessesBefore + 1 < MAX_GUESSES
}

/**
 * Seuraavan vihjeen pituus sekunteina, kun kierroksella on `guessesBefore`
 * arvausta ja yksi lisätään. Tätä käytetään soivan klipin pidentämiseen:
 * ohitus ei aloita alusta vaan jatkaa uuteen rajaan asti.
 */
export function nextStageSeconds(guessesBefore: number): number {
  return STAGES[Math.min(guessesBefore + 1, STAGES.length - 1)]
}

/** Muotoilee luvun suomalaisittain välilyönnein: 8750 -> "8 750". */
export function formatScore(n: number): string {
  return n.toLocaleString('fi-FI')
}

/** "0,1 s", "15 s" */
export function formatSeconds(s: number): string {
  return `${s.toString().replace('.', ',')} s`
}
