/**
 * Aikajanan sijaintilaskenta omana puhtaana moduulinaan, jotta se on
 * testattavissa (ks. scripts/selftest.ts) ilman DOM:ia tai React-puuta.
 *
 * Akseli on **yhtenäinen 0…15 sekuntia** koko pelin ajan, Songlessin tapaan:
 * palkki ei vaihda mittakaavaansa vihjeiden välillä, vaan avattu alue kasvaa
 * samalla janalla. Jokaisen vihjepituuden kohdalla on merkki, joten pelaaja
 * näkee kerralla missä on nyt ja kuinka paljon on vielä avattavissa.
 */
import { STAGES } from './rules'

/** Aika-akselin pituus sekunteina: pisin vihje. */
export const AXIS_SECONDS: number = STAGES[STAGES.length - 1]

/** Sekunnit prosentteina koko akselilla, rajattuna 0–100 %:iin. */
export function secondsToPercent(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.max(0, Math.min(100, (seconds / AXIS_SECONDS) * 100))
}

/** Nykyisen vihjetason klipin pituus sekunteina. */
export function clipSeconds(stageIndex: number): number {
  const i = Math.max(0, Math.min(STAGES.length - 1, stageIndex))
  return STAGES[i]
}

/** Avatun alueen leveys prosentteina tällä vihjetasolla. */
export function unlockedPercent(stageIndex: number): number {
  return secondsToPercent(clipSeconds(stageIndex))
}

/** Soittopään sijainti prosentteina kuluneiden sekuntien mukaan. */
export function headPercent(elapsedSeconds: number): number {
  return secondsToPercent(elapsedSeconds)
}

export interface Tick {
  seconds: number
  percent: number
  /** Näytetäänkö sekuntiluku? Liian lähekkäiset numerot jätetään pois. */
  labelled: boolean
}

/**
 * Aikamerkit koko akselille.
 *
 * Viiva piirretään jokaiseen vihjepituuteen, mutta **sekuntiluku vain silloin
 * kun se mahtuu**: 0,2 s ja 0,5 s osuvat kohtiin 1,3 % ja 3,3 %, joten niiden
 * numerot menisivät päällekkäin. Nykyisen vihjeen luku näytetään aina, jotta
 * pelaaja näkee mihin asti hän juuri nyt kuulee.
 *
 * @param stageIndex nykyinen vihjetaso – sen merkki nimetään aina
 * @param minGapPercent pienin väli jolla kaksi lukua mahtuvat vierekkäin
 */
export function ticks(stageIndex: number, minGapPercent = 8): Tick[] {
  let lastLabelled = -Infinity
  return STAGES.map((seconds, i) => {
    const percent = secondsToPercent(seconds)
    const isCurrent = i === stageIndex
    const fits = percent - lastLabelled >= minGapPercent
    const labelled = isCurrent || fits
    if (labelled) lastLabelled = percent
    return { seconds, percent, labelled }
  })
}

/**
 * Soiton eteneminen 0…1 nykyisestä klipistä.
 *
 * Tämä on eri asia kuin `headPercent`: jana kertoo kuinka pitkälle biisiin on
 * avattu (0,2 s on 1,3 % viidentoista sekunnin janasta), tämä kuinka pitkällä
 * yksittäinen toisto on. Soittonapin ympärillä kiertävä rengas käyttää tätä,
 * jolloin lyhyestäkin vihjeestä näkee että se etenee.
 */
export function clipProgress(elapsedSeconds: number | null, clipDuration: number): number {
  if (elapsedSeconds === null || !Number.isFinite(elapsedSeconds)) return 0
  if (!Number.isFinite(clipDuration) || clipDuration <= 0) return 0
  return Math.max(0, Math.min(1, elapsedSeconds / clipDuration))
}
