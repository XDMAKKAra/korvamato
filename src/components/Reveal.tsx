import type { Song } from '../types'
import { formatScore, formatSeconds, STAGES } from '../game/rules'

interface Props {
  song: Song
  solved: boolean
  stage: number
  points: number
  isLast: boolean
  playing: boolean
  loading: boolean
  onPlay: () => void
  onNext: () => void
}

export function Reveal({
  song,
  solved,
  stage,
  points,
  isLast,
  playing,
  loading,
  onPlay,
  onNext,
}: Props) {
  return (
    <div className="reveal">
      {song.artwork && <img src={song.artwork} alt="" loading="lazy" />}

      <div>
        <div className={`verdict ${solved ? 'ok' : 'bad'}`}>
          {solved ? `Oikein — ${formatSeconds(STAGES[stage])}` : 'Meni ohi'}
        </div>
        <h2>{song.title}</h2>
        <p className="artist">{song.artist}</p>
        {song.album && (
          <p className="album">
            {song.album}
            {song.year ? ` · ${song.year}` : ''}
          </p>
        )}
      </div>

      <div className="points">{points > 0 ? `+${formatScore(points)}` : '0'}</div>

      <div className="actions">
        <button className="btn" onClick={onPlay} disabled={loading}>
          {loading ? 'Ladataan…' : playing ? 'Pysäytä' : 'Kuuntele'}
        </button>
        <button className="btn primary" onClick={onNext} autoFocus>
          {isLast ? 'Näytä tulos' : 'Seuraava biisi'}
        </button>
      </div>
    </div>
  )
}
