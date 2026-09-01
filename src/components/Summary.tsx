import { useState } from 'react'
import type { RunState, Song } from '../types'
import { MAX_SCORE, STAGES, formatScore, formatSeconds, scoreFor, tierInfo } from '../game/rules'
import { buildShareText, copyToClipboard, runScore, solvedAtStage } from '../game/share'

interface Props {
  run: RunState
  songs: Song[]
  onPlayAgain: () => void
  onToast: (msg: string) => void
}

function verdictLine(score: number): string {
  const pct = score / MAX_SCORE
  if (pct >= 0.85) return 'Uskomatonta. Oletko sä Radio Suomipopin ohjelmapäällikkö?'
  if (pct >= 0.65) return 'Kova suoritus. Suomirock istuu selkäytimessä.'
  if (pct >= 0.45) return 'Hyvä kierros – mahdoton taso vei taas pisteitä.'
  if (pct >= 0.25) return 'Ihan kelpo. Helpot meni, syvä pää haastoi.'
  if (pct > 0) return 'Kaikkea ei voi tunnistaa 0,1 sekunnista. Huomenna uusiksi.'
  return 'Nollakierros. Näitä sattuu.'
}

export function Summary({ run, songs, onPlayAgain, onToast }: Props) {
  const [shared, setShared] = useState(false)
  const total = runScore(run, songs)
  const shareText = buildShareText(run, songs)

  async function share() {
    const ok = await copyToClipboard(shareText)
    setShared(ok)
    onToast(ok ? 'Tulos kopioitu leikepöydälle' : 'Kopiointi ei onnistunut')
  }

  return (
    <div className="card">
      <div className="summary-total">
        <div className="big">{formatScore(total)}</div>
        <div className="of">/ {formatScore(MAX_SCORE)} pistettä</div>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        {verdictLine(total)}
      </p>

      <div className="summary-list">
        {run.songIds.map((songId, i) => {
          const song = songs.find((s) => s.id === songId)
          if (!song) return null
          const stage = solvedAtStage(run, i)
          const pts = stage >= 0 ? scoreFor(song.tier, stage) : 0
          const info = tierInfo(song.tier)

          return (
            <div className="summary-row" key={songId + i}>
              {song.artwork && <img src={song.artwork} alt="" loading="lazy" />}
              <div className="meta">
                <b>{song.title}</b>
                <span>
                  {song.artist} · <span style={{ color: info.color }}>{info.short}</span>
                  {stage >= 0 ? ` · ${formatSeconds(STAGES[stage])}` : ' · ei ratkennut'}
                </span>
              </div>
              <div className={`pts${pts === 0 ? ' zero' : ''}`}>{pts > 0 ? formatScore(pts) : '–'}</div>
            </div>
          )
        })}
      </div>

      <div className="share-box">{shareText}</div>

      <div className="actions">
        <button className="btn" onClick={share}>
          {shared ? 'Kopioitu ✓' : 'Jaa tulos'}
        </button>
        <button className="btn primary" onClick={onPlayAgain}>
          Uusi kierros
        </button>
      </div>
    </div>
  )
}
