import { useRef } from 'react'
import { useClipProgress } from '../game/useClipProgress'

interface Props {
  playing: boolean
  loading: boolean
  onClick: () => void
}

/** Renkaan säde ja ympärysmitta SVG:n omassa 80×80-koordinaatistossa. */
const RING_R = 34
const RING_C = 2 * Math.PI * RING_R

/**
 * Soittonappi ja sen ympärillä kiertävä edistymisrengas.
 *
 * Työnjako: **jana** kertoo kuinka paljon biisistä on auki, **rengas** kuinka
 * pitkällä tämä toisto on. Rengas kiertää aina täyden kierroksen klipin
 * pituudesta riippumatta, joten 0,2 sekunnin isku näkyy yhtä selvästi kuin
 * 15 sekunnin pätkä. Ilman sitä lyhimmät vihjeet liikuttaisivat aikajanan
 * soittopäätä 1,3 % eli pari pikseliä, eikä mikään näyttäisi tapahtuvan.
 *
 * Rengas päivitetään suoraan DOM:iin refin kautta (ks. useClipProgress) – se
 * ei ole React-tilaa, joten toisto ei renderöi sovellusta kertaakaan.
 */
export function PlayButton({ playing, loading, onClick }: Props) {
  const ringRef = useRef<SVGCircleElement>(null)

  useClipProgress(playing, ({ fraction, active }) => {
    const ring = ringRef.current
    if (!ring) return
    ring.style.strokeDashoffset = String(RING_C * (1 - (active ? fraction : 0)))
  })

  return (
    <div className={`play-wrap${playing ? ' playing' : ''}`}>
      <svg className="play-ring" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <circle className="play-ring-track" cx="40" cy="40" r={RING_R} />
        <circle
          ref={ringRef}
          className="play-ring-fill"
          cx="40"
          cy="40"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C}
          transform="rotate(-90 40 40)"
        />
      </svg>

      <button
        className={`play-btn${playing ? ' playing' : ''}`}
        onClick={onClick}
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
    </div>
  )
}
