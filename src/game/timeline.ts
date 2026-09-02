/**
 * Aikajanan sijaintilaskenta omana puhtaana moduulinaan, jotta se on
 * testattavissa (ks. scripts/selftest.ts) ilman DOM:ia tai React-puuta.
 *
 * Akseli on **yhtenäinen ja lineaarinen 0…15 sekuntia**: yksi sekunti on aina
 * yhtä leveä riippumatta siitä missä kohtaa janaa ollaan. Sekuntiluvut ovat
 * siis siellä missä pelaaja ne odottaakin – 2 s on kahdeksasosassa janaa, ei
 * puolivälissä – ja soittopää liikkuu tasaisella nopeudella alusta loppuun.
 *
 * Aiemmin akseli oli paloittain lineaarinen: jokainen vihjepituus sai yhtä
 * leveän lohkon, jotta lyhinkin vihje näkyisi janalla. Se korjasi väärän
 * ongelman. Soittopään nopeus kymmenkertaistui joka lohkon rajalla (0,2 s
 * lohko ehti 83 %/s, 15 s lohko 2,4 %/s), joten pisimmällä vihjeellä pää
 * ampaisi kolmanneksen janasta puolessa sekunnissa ja madelsi sitten loput
 * 13 sekuntia. Liike näytti nykivältä ja luvut valehtelivat.
 *
 * Lyhyen vihjeen näkyvyys ratkaistaan nyt siellä minne se kuuluu: soittonapin
 * ympärillä on rengas, joka kiertää täyden kierroksen klipin pituudesta
 * riippumatta (ks. PlayButton). Jana vastaa kysymykseen "kuinka paljon
 * biisistä on auki", rengas kysymykseen "kuinka pitkällä tämä toisto on".
 */
import { STAGES } from './rules'

/** Aika-akselin pituus sekunteina: pisin vihje. */
export const AXIS_SECONDS: number = STAGES[STAGES.length - 1]

/** Sekunnit prosentteina akselilla, rajattuna 0–100 %:iin. */
export function secondsToPercent(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  if (seconds >= AXIS_SECONDS) return 100
  return (seconds / AXIS_SECONDS) * 100
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
 * Viiva piirretään jokaiseen vihjepituuteen ja sekuntiluku sen alle. Lineaari-
 * sella akselilla kaksi lyhintä vihjettä ovat 1,3 % ja 3,3 % kohdalla eli
 * käytännössä päällekkäin, joten luvut valitaan tärkeysjärjestyksessä:
 *
 *   1. nykyinen vihje – pelaajan pitää nähdä mihin asti hän juuri nyt kuulee
 *   2. akselin pää – jana on aina 15 sekuntia, ja se kannattaa sanoa
 *   3. loput vasemmalta oikealle sikäli kuin väliin mahtuu
 *
 * Näin ahtaassakin kohdassa näkyvä luku on aina se merkityksellisin eikä
 * numeroita koskaan piirretä toistensa päälle.
 *
 * @param stageIndex nykyinen vihjetaso – sen luku nimetään aina
 * @param minGapPercent pienin väli jolla kaksi lukua mahtuvat vierekkäin
 */
export function ticks(stageIndex: number, minGapPercent = 9): Tick[] {
  const marks: Tick[] = STAGES.map((seconds) => ({
    seconds,
    percent: secondsToPercent(seconds),
    labelled: false,
  }))

  const placed: number[] = []
  const fits = (percent: number) => placed.every((p) => Math.abs(percent - p) >= minGapPercent)
  const take = (i: number) => {
    if (marks[i].labelled) return
    marks[i].labelled = true
    placed.push(marks[i].percent)
  }

  const current = Math.max(0, Math.min(marks.length - 1, stageIndex))
  take(current)
  if (fits(marks[marks.length - 1].percent)) take(marks.length - 1)
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].labelled && fits(marks[i].percent)) take(i)
  }

  return marks
}
