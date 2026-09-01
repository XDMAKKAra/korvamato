import { Modal } from './Modal'
import { loadStats } from '../game/storage'
import { STAGES, formatScore, formatSeconds } from '../game/rules'

export function StatsModal({ onClose }: { onClose: () => void }) {
  const s = loadStats()
  const avg = s.played > 0 ? Math.round(s.totalScore / s.played) : 0

  return (
    <Modal title="Tilastot" onClose={onClose}>
      <div className="stat-grid">
        <div className="stat">
          <b>{s.played}</b>
          <span>pelattua kierrosta</span>
        </div>
        <div className="stat">
          <b>{formatScore(s.bestScore)}</b>
          <span>paras tulos</span>
        </div>
        <div className="stat">
          <b>{formatScore(avg)}</b>
          <span>keskiarvo</span>
        </div>
        <div className="stat">
          <b>{s.perfectRounds}</b>
          <span>tunnistettu {formatSeconds(STAGES[0])}:sta</span>
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12.5 }}>
        Tilastot tallennetaan vain tämän selaimen muistiin.
      </p>
    </Modal>
  )
}
