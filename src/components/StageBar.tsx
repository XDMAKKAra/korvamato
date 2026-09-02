import { useRef } from 'react'
import { formatSeconds } from '../game/rules'
import { AXIS_SECONDS, clipSeconds, headPercent, ticks, unlockedPercent } from '../game/timeline'
import { useClipProgress } from '../game/useClipProgress'

interface Props {
  /** Monesko vihje on auki (0 = lyhin). */
  stageIndex: number
  /** Soiko klippi juuri nyt? Käynnistää soittopään animaation. */
  playing: boolean
}

/**
 * Yhtenäinen aikajana 0…15 sekuntia.
 *
 * Palkki pysyy samassa mittakaavassa koko pelin ajan: avattu alue kasvaa
 * vihje vihjeeltä samalla janalla sen sijaan että jokainen vihje piirtäisi
 * oman palkkinsa. Akseli on lineaarinen sekunneissa (ks. timeline.ts), joten
 * soittopää kulkee tasaisella nopeudella eivätkä sekuntiluvut valehtele.
 *
 * Kolme kerrosta, kolme eri kysymystä:
 *   - `unlocked` — kuinka pitkälle biisi on avattu (kasvaa vihje vihjeeltä)
 *   - `played`   — kuinka pitkälle tämä toisto on ehtinyt (liikkuu joka framella)
 *   - `head`     — soittopää eli `played`-alueen kärki
 *
 * Kaksi jälkimmäistä päivitetään suoraan DOM:iin refin kautta eikä React-tilan
 * läpi: ks. useClipProgress. Siksi tässä komponentissa ei ole tilaa lainkaan.
 *
 * Soittopää on radan ulkopuolella sisaruksena, koska rata leikkaa sisältönsä
 * (`overflow: hidden`) pyöristettyjen päiden vuoksi. Radan sisällä soittopää
 * katoaisi näkyvistä juuri janan lopussa, missä sitä eniten katsotaan.
 */
export function StageBar({ stageIndex, playing }: Props) {
  const unlocked = unlockedPercent(stageIndex)
  const marks = ticks(stageIndex)

  const playedRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)

  useClipProgress(playing, ({ seconds, active }) => {
    const percent = active ? headPercent(seconds) : 0
    const played = playedRef.current
    const head = headRef.current
    if (played) {
      played.style.width = `${percent}%`
      played.style.opacity = active ? '1' : '0'
    }
    if (head) {
      head.style.left = `${percent}%`
      head.style.opacity = active ? '1' : '0'
    }
  })

  return (
    <div className="stagebar">
      <div className="stagebar-rail">
        <div
          className="stagebar-track"
          role="progressbar"
          aria-label="Avattu osuus biisistä"
          aria-valuemin={0}
          aria-valuemax={AXIS_SECONDS}
          aria-valuenow={clipSeconds(stageIndex)}
          aria-valuetext={formatSeconds(clipSeconds(stageIndex))}
        >
          <div className="stagebar-unlocked" style={{ width: `${unlocked}%` }} />
          <div className="stagebar-played" ref={playedRef} />
          {marks.map((t) => (
            <span
              key={t.seconds}
              className={`stagebar-tick${t.percent <= unlocked ? ' on' : ''}`}
              style={{ left: `${t.percent}%` }}
            />
          ))}
        </div>
        <div className="stagebar-head" ref={headRef} />
      </div>

      <div className="stagebar-labels">
        {marks
          .filter((t) => t.labelled)
          .map((t, i, all) => (
            <span
              key={t.seconds}
              className={t.percent <= unlocked ? 'on' : ''}
              style={{
                left: `${t.percent}%`,
                // Luku keskitetään merkkinsä kohdalle. Reunimmaiset vedetään
                // kokonaan janan sisään, ettei numero valu kortin reunan yli.
                transform:
                  i === all.length - 1
                    ? 'translateX(-100%)'
                    : i === 0 && t.percent < 6
                      ? 'translateX(0)'
                      : 'translateX(-50%)',
              }}
            >
              {formatSeconds(t.seconds)}
            </span>
          ))}
      </div>
    </div>
  )
}
