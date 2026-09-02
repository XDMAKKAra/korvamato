/**
 * Aikajanan sijaintilaskenta omana puhtaana moduulinaan, jotta se on
 * testattavissa (ks. scripts/selftest.ts) ilman DOM:ia tai React-puuta.
 *
 * Akseli on **yhtenäinen 0…15 sekuntia** koko pelin ajan: palkki ei vaihda
 * mittakaavaansa vihjeiden välillä, vaan avattu alue kasvaa samalla janalla.
 *
 * Akseli ei silti ole *lineaarinen* sekunneissa, koska vihjepituudet eivät ole
 * tasavälisiä: 0,2 / 0,5 / 2 / 5 / 8 / 15 s osuisivat suoraan mittakaavaan
 * kohtiin 1,3 %, 3,3 %, 13 %, 33 %, 53 % ja 100 %. Kolme ensimmäistä vihjettä
 * — eli puolet pelistä — mahtuisi janan ensimmäiseen kahdeksasosaan, jolloin
 * soittopää liikkuisi lyhyellä vihjeellä pari pikseliä eikä palkki näyttäisi
 * etenevän lainkaan.
 *
 * Siksi akseli on **paloittain lineaarinen**: jokainen vihjepituus saa yhtä
 * leveän lohkon, ja lohkon sisällä aika kulkee tasaisesti. Järjestys ja
 * suunta säilyvät (aika kasvaa aina vasemmalta oikealle), merkit jakautuvat
 * tasan koko janalle ja jokainen toisto vie soittopään täyden lohkon verran
 * eteenpäin – myös se 0,2 sekunnin isku.
 */
import { STAGES } from './rules'

/** Aika-akselin pituus sekunteina: pisin vihje. */
export const AXIS_SECONDS: number = STAGES[STAGES.length - 1]

/** Yhden vihjelohkon leveys prosentteina. */
const SEGMENT_PERCENT = 100 / STAGES.length

/**
 * Sekunnit prosentteina akselilla, rajattuna 0–100 %:iin.
 *
 * Paikannus tehdään lohkoittain: etsitään se vihjeväli johon `seconds` osuu ja
 * interpoloidaan sen sisällä. Näin jokainen vihjepituus osuu täsmälleen oman
 * lohkonsa rajalle (0,2 s = 1/6, 0,5 s = 2/6, …, 15 s = 100 %).
 */
export function secondsToPercent(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  if (seconds >= AXIS_SECONDS) return 100

  let from = 0
  for (let i = 0; i < STAGES.length; i++) {
    const to = STAGES[i]
    if (seconds <= to) {
      const withinSegment = (seconds - from) / (to - from)
      return (i + withinSegment) * SEGMENT_PERCENT
    }
    from = to
  }
  return 100
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
 * Viiva piirretään jokaiseen vihjepituuteen ja sekuntiluku sen alle. Tasa­
 * levyisillä lohkoilla merkkien väli on aina 100/6 ≈ 16,7 %, joten kaikki luvut
 * mahtuvat – mutta väljyystarkistus jää paikalleen, jottei vihjeiden määrän
 * kasvattaminen palauta päällekkäisiä numeroita huomaamatta. Nykyisen vihjeen
 * luku näytetään aina, jotta pelaaja näkee mihin asti hän juuri nyt kuulee.
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
