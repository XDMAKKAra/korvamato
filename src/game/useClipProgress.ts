import { useEffect, useRef } from 'react'
import { player } from './audio'

export interface ClipFrame {
  /** Kuluneet sekunnit klipin alusta. */
  seconds: number
  /** Osuus 0…1 nykyisen klipin pituudesta. */
  fraction: number
  /** Soiko klippi juuri nyt? Epätosi kerran, kun toisto päättyy. */
  active: boolean
}

/**
 * Kutsuu `onFrame`-funktiota joka näytönpäivityksellä niin kauan kuin klippi
 * soi, ja kerran `active: false` -kehyksellä kun se loppuu.
 *
 * **Miksi tämä ei ole React-tilaa.** Aiemmin kulunut aika elettiin
 * `useState`-tilassa, jota päivitettiin joka framella. Yksikin `setState`
 * renderöi koko sovelluksen uudelleen – aikajanan lisäksi biisirailin (joka
 * hakee viisi biisiä lineaarisesti ~4000 biisin taulukosta), hakukentän ja
 * arvauslistan – siis 60 kertaa sekunnissa. Frameja putosi, ja animaatio
 * näytti nykivältä tai pahimmillaan pysähtyneeltä. Nyt rAF-silmukka kirjoittaa
 * arvot suoraan DOM:iin refin kautta: React ei renderöi toiston aikana
 * kertaakaan, ja liike on yhtä tasaista kuin näyttö sallii.
 *
 * Kello luetaan aina äänimoottorilta (`player.elapsed()`), joka Web Audio
 * -polulla käyttää `AudioContext.currentTime`-aikaa. Erillinen
 * `performance.now()`-ajastin ajautuisi äänestä erilleen.
 *
 * Klipin pituus luetaan niin ikään soittimelta eikä kutsuhetken arvosta, koska
 * klippiä voidaan pidentää kesken soiton (ohitus tai väärä arvaus).
 */
export function useClipProgress(playing: boolean, onFrame: (frame: ClipFrame) => void): void {
  // Tuorein callback refissä, jotta rAF-silmukkaa ei tarvitse käynnistää
  // uudelleen aina kun komponentti renderöityy.
  const latest = useRef(onFrame)
  useEffect(() => {
    latest.current = onFrame
  })

  useEffect(() => {
    const idle: ClipFrame = { seconds: 0, fraction: 0, active: false }
    if (!playing) {
      latest.current(idle)
      return
    }

    // Nollataan heti: ääni alkaa vasta hetken kuluttua (ajastettu t0), eikä
    // edellisen toiston loppuasento saa jäädä näkyviin.
    latest.current({ seconds: 0, fraction: 0, active: true })

    let raf = 0
    const tick = () => {
      const elapsed = player.elapsed()
      const duration = player.currentDuration()
      if (elapsed !== null && duration > 0) {
        const seconds = Math.min(elapsed, duration)
        latest.current({ seconds, fraction: seconds / duration, active: true })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      latest.current(idle)
    }
  }, [playing])
}
