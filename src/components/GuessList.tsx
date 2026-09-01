import type { Guess } from '../types'
import { MAX_GUESSES } from '../game/rules'

export function GuessList({ guesses }: { guesses: Guess[] }) {
  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => guesses[i])

  return (
    <div className="guesses">
      {rows.map((g, i) => {
        if (!g) {
          return (
            <div className="guess empty" key={i}>
              <span className="guess-icon">·</span>
              <span className="guess-text">Arvaus {i + 1}</span>
            </div>
          )
        }

        const icon = g.kind === 'oikein' ? '✓' : g.kind === 'ohitus' ? '»' : '✕'
        const text = g.kind === 'ohitus' ? 'Ohitettu' : (g.label ?? '')

        return (
          <div className={`guess ${g.kind}`} key={i}>
            <span className="guess-icon">{icon}</span>
            <span className="guess-text">{text}</span>
            {g.artistHit && g.kind === 'vaara' && <span className="guess-hint">oikea artisti</span>}
          </div>
        )
      })}
    </div>
  )
}
