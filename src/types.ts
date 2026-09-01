/** Genre johon biisi kuuluu. Johdetaan hakuvaiheessa, ei käsin. */
export type Genre = 'rock' | 'rap' | 'pop' | 'iskelma'

/** Aikakausi: 2020-luku, 2010-luku tai kaikki sitä ennen (1970–2010). */
export type Era = '2020' | '2010' | 'klassikot'

export interface Song {
  id: string
  artist: string
  title: string
  fullTitle: string
  album: string
  year: number | null
  artwork: string
  preview: string
  tier: number
  genre: Genre
  era: Era
  /**
   * Kaikki kappaleella esiintyvät artistit, myös feat-vieraat ja duon molemmat
   * puolet. Haku osuu jokaiseen näistä: "Uskomaton (feat. Sara Bee)" pitää löytyä
   * myös hakusanalla "Sara Bee", ei pelkällä "Elastisella".
   */
  artists: string[]
  /**
   * Kappaleen todellinen toistomäärä (Last.fm `playcount`). Esimerkiksi
   * Käärijän "Cha Cha Cha" on 5 402 811.
   *
   * Tämä on ainoa mittari joka kertoo onko biisi oikeasti kuultu – ilman sitä
   * kantaan valikoituu satunnaisia albumitäytteitä. Toistomäärä on myös
   * biisikannan karsinnan ja vaikeustason peruste.
   */
  plays: number
}

export type GuessKind = 'vaara' | 'ohitus' | 'oikein'

export interface Guess {
  kind: GuessKind
  /** Arvatun biisin id, jos käyttäjä valitsi ehdotuslistalta. */
  songId?: string
  /** Näytettävä teksti, esim. "Apulanta – Anna mulle piiskaa". */
  label?: string
  /** Tosi jos arvaus osui oikeaan artistiin mutta väärään biisiin. */
  artistHit?: boolean
}

export type RoundStatus = 'kesken' | 'oikein' | 'ohi'

export interface Round {
  songId: string
  guesses: Guess[]
  status: RoundStatus
}

export interface RunState {
  /** Satunnaissiemen, jolla kierroksen biisit arvottiin. */
  key: string
  songIds: string[]
  rounds: Round[]
  current: number
  finished: boolean
}

export interface Stats {
  played: number
  bestScore: number
  totalScore: number
  perfectRounds: number
}
