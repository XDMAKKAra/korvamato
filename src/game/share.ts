import type { RunState, Song } from '../types'
import { MAX_GUESSES, MAX_SCORE, formatScore, scoreFor, tierInfo } from './rules'

/**
 * Jaettavan tuloksen loppuun liitettävä osoite. Tyhjänä sitä ei liitetä
 * lainkaan – täytä tähän pelin oma osoite kun se on julkaistu.
 */
export const SITE_URL = ''

/** Monennellako vihjeellä biisi ratkesi, tai -1 jos ei ratkennut. */
export function solvedAtStage(run: RunState, roundIndex: number): number {
  const round = run.rounds[roundIndex]
  if (!round || round.status !== 'oikein') return -1
  return round.guesses.filter((g) => g.kind !== 'oikein').length
}

export function runScore(run: RunState, songs: Song[]): number {
  return run.rounds.reduce((sum, _round, i) => {
    const stage = solvedAtStage(run, i)
    if (stage < 0) return sum
    const song = songs.find((s) => s.id === run.songIds[i])
    return sum + scoreFor(song?.tier ?? 1, stage)
  }, 0)
}

export function perfectCount(run: RunState): number {
  return run.rounds.reduce((n, _r, i) => n + (solvedAtStage(run, i) === 0 ? 1 : 0), 0)
}

export function buildShareText(run: RunState, songs: Song[]): string {
  const score = runScore(run, songs)
  const header = 'Korvamato'

  const rows = run.rounds.map((_round, i) => {
    const song = songs.find((s) => s.id === run.songIds[i])
    const label = tierInfo(song?.tier ?? 1).short
    const stage = solvedAtStage(run, i)

    let cells = ''
    for (let c = 0; c < MAX_GUESSES; c++) {
      if (stage < 0) cells += '🟥'
      else if (c < stage) cells += '🟥'
      else if (c === stage) cells += '🟩'
      else cells += '⬜'
    }
    return `${cells} ${label}`
  })

  const lines = [header, `${formatScore(score)} / ${formatScore(MAX_SCORE)} pistettä`, '', ...rows]
  if (SITE_URL) lines.push('', SITE_URL)
  return lines.join('\n')
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
