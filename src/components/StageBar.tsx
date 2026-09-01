import { formatSeconds } from '../game/rules'
import { AXIS_SECONDS, headPercent, ticks, unlockedPercent } from '../game/timeline'

interface Props {
  /** Monesko vihje on auki (0 = lyhin). */
  stageIndex: number
  /** Kuluneet sekunnit nykyisestä klipistä, tai null kun ei soiteta. */
  elapsed: number | null
}

/**
 * Yhtenäinen aikajana 0…15 sekuntia.
 *
 * Palkki pysyy samassa mittakaavassa koko pelin ajan: avattu alue kasvaa
 * vihje vihjeeltä samalla janalla sen sijaan että jokainen vihje piirtäisi
 * oman palkkinsa. Jokaisessa vihjepituudessa on merkki, ja sekuntiluku
 * näytetään aina kun se mahtuu päällekkäin menemättä.
 */
export function StageBar({ stageIndex, elapsed }: Props) {
  const unlocked = unlockedPercent(stageIndex)
  const marks = ticks(stageIndex)

  return (
    <div className="stagebar">
      <div
        className="stagebar-track"
        role="progressbar"
        aria-label="Vihjeen pituus aikajanalla"
        aria-valuemin={0}
        aria-valuemax={AXIS_SECONDS}
        aria-valuenow={elapsed ?? 0}
      >
        <div className="stagebar-unlocked" style={{ width: `${unlocked}%` }} />
        {marks.map((t) => (
          <span
            key={t.seconds}
            className={`stagebar-tick${t.percent <= unlocked ? ' on' : ''}`}
            style={{ left: `${t.percent}%` }}
          />
        ))}
        {elapsed !== null && (
          <div className="stagebar-head" style={{ left: `${headPercent(elapsed)}%` }} />
        )}
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
                // Ensimmäinen ja viimeinen kiinnitetään reunoihin, muut keskitetään.
                transform:
                  i === 0 ? 'translateX(0)' : i === all.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {formatSeconds(t.seconds)}
            </span>
          ))}
      </div>
    </div>
  )
}
