import type { RunState, Song } from '../types'
import { tierInfo } from '../game/rules'
import { solvedAtStage } from '../game/share'

interface Props {
  run: RunState
  songs: Song[]
}

/** Yläpalkki, joka näyttää missä kohtaa viiden biisin sarjaa ollaan. */
export function TierRail({ run, songs }: Props) {
  return (
    <div className="rail">
      {run.songIds.map((songId, i) => {
        const song = songs.find((s) => s.id === songId)
        const info = tierInfo(song?.tier ?? 1)
        const round = run.rounds[i]
        const done = round.status !== 'kesken'
        const stage = solvedAtStage(run, i)

        let mark = ''
        if (round.status === 'oikein') mark = `${stage + 1}.`
        else if (round.status === 'ohi') mark = '–'

        return (
          <div
            key={songId + i}
            className={`rail-step${i === run.current && !run.finished ? ' active' : ''}${done ? ' done' : ''}`}
            style={{ color: info.color }}
            title={info.name}
          >
            <div className="rail-dot" />
            <div className="rail-label">{info.short}</div>
            <div className="rail-mark" style={{ color: round.status === 'ohi' ? 'var(--muted)' : info.color }}>
              {mark}
            </div>
          </div>
        )
      })}
    </div>
  )
}
