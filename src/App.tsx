import { useCallback, useEffect, useRef, useState } from 'react'
import songsData from './data/songs.json'
import type { RoundStatus, RunState, Song } from './types'
import { MAX_GUESSES, STAGES, formatSeconds, nextStageSeconds, roundContinues, scoreFor, tierInfo } from './game/rules'
import { pickRun, randomRunKey } from './game/daily'
import { player } from './game/audio'
import { isSameSong, normalize, songLabel } from './game/match'
import { loadFilter, loadRun, recordFinish, saveFilter, saveRun } from './game/storage'
import { perfectCount, runScore, solvedAtStage } from './game/share'
import { filterLabel, filterSongs, type Filter } from './game/categories'
import { TierRail } from './components/TierRail'
import { StageBar } from './components/StageBar'
import { SearchInput } from './components/SearchInput'
import { GuessList } from './components/GuessList'
import { Reveal } from './components/Reveal'
import { Summary } from './components/Summary'
import { HowTo } from './components/HowTo'
import { StatsModal } from './components/StatsModal'
import { CategoryPicker } from './components/CategoryPicker'

const SONGS = songsData as unknown as Song[]

/**
 * Rakentaa uuden kierroksen valitusta kategoriasta. Palauttaa null jos
 * kategoriassa ei ole tarpeeksi biisejä.
 */
function createRun(filter: Filter): RunState | null {
  const pool = filterSongs(SONGS, filter)
  if (pool.length === 0) return null

  const key = randomRunKey()
  const picks = pickRun(key, pool, Math.floor(Math.random() * 1e9))
  if (picks.length === 0) return null

  return {
    key,
    songIds: picks.map((s) => s.id),
    rounds: picks.map((s) => ({ songId: s.id, guesses: [], status: 'kesken' as const })),
    current: 0,
    finished: false,
  }
}

/** Tallennettu kierros kelpaa vain jos kaikki sen biisit ovat yhä kannassa. */
function isUsable(run: RunState | null): run is RunState {
  if (!run || !Array.isArray(run.songIds) || run.songIds.length === 0) return false
  return run.songIds.every((id) => SONGS.some((s) => s.id === id))
}

export default function App() {
  const [filter, setFilter] = useState<Filter>(() => loadFilter())

  const [run, setRun] = useState<RunState | null>(() => {
    const saved = loadRun()
    return isUsable(saved) ? saved : createRun(loadFilter())
  })

  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  // Kuluneet sekunnit nykyisestä klipistä, tai null kun ei soiteta. Luetaan
  // suoraan äänen omasta kellosta (ks. player.elapsed()), ei erillisestä
  // performance.now()-ajastimesta – näin animaatio ei voi ajautua äänestä
  // erilleen.
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [modal, setModal] = useState<'ohjeet' | 'tilastot' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  /** Hakukentän parhaiten täsmäävä ehdotus – "Arvaa"-nappia varten. */
  const [topMatch, setTopMatch] = useState<Song | null>(null)

  const rafRef = useRef<number | null>(null)
  const playTokenRef = useRef(0)
  const recordedRef = useRef<string | null>(null)

  const byId = useCallback((id: string) => SONGS.find((s) => s.id === id), [])

  const round = run ? run.rounds[run.current] : undefined
  const song = round ? byId(round.songId) : undefined
  const revealed = !!round && round.status !== 'kesken'
  const stageIndex = round ? Math.min(round.guesses.length, MAX_GUESSES - 1) : 0

  /* ---------- tallennus ja esilataus ---------- */

  useEffect(() => {
    if (run) saveRun(run)
  }, [run])

  useEffect(() => {
    if (!song || !run) return
    void player.preload(song)
    // Ladataan seuraavakin valmiiksi, ettei odoteta kierroksen vaihtuessa.
    const next = run.songIds[run.current + 1]
    if (next) {
      const nextSong = byId(next)
      if (nextSong) void player.preload(nextSong)
    }
  }, [song, run, byId])

  useEffect(() => {
    if (!run || !run.finished) return
    if (recordedRef.current === run.key) return
    recordedRef.current = run.key
    recordFinish(runScore(run, SONGS), perfectCount(run))
  }, [run])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Kierroksen vaihtuessa ääni poikki.
  useEffect(() => {
    return () => {
      player.stop()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* ---------- soitto ---------- */

  const stopPlayback = useCallback(() => {
    playTokenRef.current++
    player.stop()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setPlaying(false)
    setElapsed(null)
  }, [])

  const handlePlay = useCallback(async () => {
    if (!song) return
    if (playing) {
      stopPlayback()
      return
    }

    player.unlock()
    const token = ++playTokenRef.current
    const duration = revealed ? STAGES[STAGES.length - 1] : STAGES[stageIndex]

    setLoading(true)
    await player.preload(song)
    if (token !== playTokenRef.current) return
    setLoading(false)
    setPlaying(true)
    setElapsed(0)

    // player.play() ajastaa äänen alkamaan hieman kutsuhetken jälkeen (Web
    // Audiolla tarkka t0). Kello luetaan siis suoraan äänimoottorista eikä
    // performance.now()-erosta, jotta animaatio ei lähde ennen ääntä.
    const tick = () => {
      if (token !== playTokenRef.current) return
      const e = player.elapsed()
      // Klippiä voidaan pidentää kesken soiton (ohitus/väärä arvaus), joten
      // yläraja luetaan soittimelta eikä kutsuhetken `duration`-arvosta.
      if (e !== null) setElapsed(Math.min(player.currentDuration() || duration, e))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    await player.play(song, duration)

    if (token !== playTokenRef.current) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setPlaying(false)
    setElapsed(null)
  }, [song, playing, revealed, stageIndex, stopPlayback])

  // Välilyönti soittaa vihjeen, kun kirjoituskenttä ei ole aktiivinen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || modal) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      e.preventDefault()
      void handlePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlay, modal])

  /* ---------- arvaukset ---------- */

  const applyGuess = useCallback(
    (guess: { kind: 'vaara' | 'ohitus' | 'oikein'; songId?: string; label?: string; artistHit?: boolean }) => {
      // Jos kierros jatkuu, seuraava vihje on pidempi pätkä samasta kohdasta.
      // Soivaa ääntä ei silloin katkaista vaan pidennetään: alusta aloittaminen
      // tuntuisi hyppäykseltä ja veisi jo kuullun kohdan pois. Vain kierroksen
      // päättyminen (oikein tai yritykset lopussa) pysäyttää soiton.
      const before = round ? round.guesses.length : MAX_GUESSES
      const extended =
        roundContinues(guess.kind, before) && song && playing
          ? player.extend(song, nextStageSeconds(before))
          : false
      if (!extended) stopPlayback()

      setRun((prev) => {
        if (!prev) return prev
        const rounds = prev.rounds.map((r, i) => {
          if (i !== prev.current || r.status !== 'kesken') return r
          const guesses = [...r.guesses, guess]
          const status: RoundStatus =
            guess.kind === 'oikein' ? 'oikein' : guesses.length >= MAX_GUESSES ? 'ohi' : 'kesken'
          return { ...r, guesses, status }
        })
        return { ...prev, rounds }
      })
    },
    [stopPlayback, round, song, playing],
  )

  const handlePick = useCallback(
    (picked: Song) => {
      if (!song || revealed) return
      if (isSameSong(picked, song)) {
        applyGuess({ kind: 'oikein', songId: picked.id, label: songLabel(picked) })
      } else {
        applyGuess({
          kind: 'vaara',
          songId: picked.id,
          label: songLabel(picked),
          artistHit: normalize(picked.artist) === normalize(song.artist),
        })
      }
    },
    [song, revealed, applyGuess],
  )

  const handleSkip = useCallback(() => {
    if (revealed) return
    applyGuess({ kind: 'ohitus' })
  }, [revealed, applyGuess])

  const advance = useCallback(() => {
    stopPlayback()
    setRun((prev) => {
      if (!prev) return prev
      const next = prev.current + 1
      if (next >= prev.rounds.length) return { ...prev, finished: true }
      return { ...prev, current: next }
    })
  }, [stopPlayback])

  const playAgain = useCallback(() => {
    stopPlayback()
    setRun(createRun(filter))
  }, [stopPlayback, filter])

  const changeFilter = useCallback(
    (next: Filter) => {
      setFilter(next)
      saveFilter(next)
      // Kategorian vaihtuessa arvotaan heti uusi kierros uudesta joukosta.
      stopPlayback()
      setRun(createRun(next))
    },
    [stopPlayback],
  )

  /* ---------- renderöinti ---------- */

  if (SONGS.length === 0) {
    return (
      <div className="app">
        <div className="notice">
          Biisikanta on tyhjä.
          <br />
          Aja <code>npm run songs</code> hakeaksesi ääninäytteet.
        </div>
      </div>
    )
  }

  const info = song ? tierInfo(song.tier) : null
  const solvedStage = run ? solvedAtStage(run, run.current) : -1
  const roundPoints = song && solvedStage >= 0 ? scoreFor(song.tier, solvedStage) : 0

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Korvamato</h1>
          <span className="sub">Arvaa suomibiisi</span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setModal('tilastot')} aria-label="Tilastot">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setModal('ohjeet')} aria-label="Ohjeet">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.2a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.8-.9 1.4v.6" />
              <circle cx="12" cy="17" r="0.6" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>

      {/*
        Asetuspuoli ja pelipuoli erikseen, jotta leveällä näytöllä ne voi
        asetella vierekkäin (ks. .side / .main index.css:ssä). Kapealla
        näytöllä molemmat ovat `display: contents`, jolloin lapset pysyvät
        saman pystypinon osina eikä ylimääräistä väliä synny.
      */}
      <aside className="side">
        <div className="category-row">
          <CategoryPicker filter={filter} songs={SONGS} onChange={changeFilter} />
          <span className="category-hint">{filterLabel(filter)}</span>
        </div>
      </aside>

      <main className="main">
      {run && <TierRail run={run} songs={SONGS} />}

      {!run ? (
        <div className="notice">
          Tässä kategoriassa ei ole vielä tarpeeksi biisejä.
          <br />
          Valitse toinen genre tai aikakausi.
        </div>
      ) : run.finished || !round || !song ? (
        <Summary run={run} songs={SONGS} onPlayAgain={playAgain} onToast={setToast} />
      ) : (
        <div className="card">
          {info && (
            <div className="tier-chip" style={{ color: info.color }}>
              <span className="bullet" />
              {info.name}
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                · biisi {run.current + 1}/{run.songIds.length}
              </span>
            </div>
          )}

          {revealed ? (
            <Reveal
              song={song}
              solved={round.status === 'oikein'}
              stage={solvedStage >= 0 ? solvedStage : MAX_GUESSES - 1}
              points={roundPoints}
              isLast={run.current === run.songIds.length - 1}
              playing={playing}
              loading={loading}
              onPlay={handlePlay}
              onNext={advance}
            />
          ) : (
            <>
              <StageBar stageIndex={stageIndex} elapsed={elapsed} />

              <div className="play-row">
                <button
                  className={`play-btn${playing ? ' playing' : ''}`}
                  onClick={handlePlay}
                  disabled={loading}
                  aria-label={playing ? 'Pysäytä' : 'Soita vihje'}
                >
                  {loading ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 3a9 9 0 1 0 9 9" opacity="0.9">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                      </path>
                    </svg>
                  ) : playing ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1.2" />
                      <rect x="14" y="5" width="4" height="14" rx="1.2" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.6c0-.9 1-1.5 1.8-1L18 11c.7.5.7 1.5 0 2l-8.2 5.4c-.8.5-1.8-.1-1.8-1V5.6z" />
                    </svg>
                  )}
                </button>

                <div className="play-meta">
                  <strong>
                    Vihje {stageIndex + 1}/{MAX_GUESSES} · {formatSeconds(STAGES[stageIndex])}
                  </strong>
                  <span>
                    {loading
                      ? 'Ladataan ääntä…'
                      : `${MAX_GUESSES - round.guesses.length} yritystä jäljellä`}
                  </span>
                </div>
              </div>

              <GuessList guesses={round.guesses} />

              <SearchInput
                key={round.guesses.length}
                songs={SONGS}
                disabled={revealed}
                onPick={handlePick}
                onTopMatchChange={setTopMatch}
              />

              <div className="actions">
                <button className="btn skip" onClick={handleSkip}>
                  Ohita
                </button>
                <button
                  className="btn primary"
                  onClick={() => topMatch && handlePick(topMatch)}
                  disabled={!topMatch}
                >
                  Arvaa
                </button>
              </div>
            </>
          )}
        </div>
      )}
      </main>

      {modal === 'ohjeet' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'tilastot' && <StatsModal onClose={() => setModal(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
