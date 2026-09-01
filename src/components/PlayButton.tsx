interface Props {
  playing: boolean
  loading: boolean
  /** Soiton eteneminen 0…1 nykyisestä klipistä. */
  progress: number
  onClick: () => void
}

const SIZE = 84
const STROKE = 3
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Soittonappi ja sen ympärillä kiertävä edistymisrengas.
 *
 * Rengas on olemassa siksi, että aikajanan soittopää ei voi näyttää lyhyen
 * vihjeen etenemistä: 0,2 sekuntia on 1,3 % viidentoista sekunnin janasta eli
 * pari pikseliä, jolloin näyttää siltä ettei mikään liiku. Rengas kiertää aina
 * täyden kierroksen klipin aikana, oli klippi 0,2 tai 15 sekuntia, joten
 * soitosta saa palautteen jokaisella vihjetasolla.
 *
 * Aikajana kertoo *kuinka pitkälle biisiin on avattu*, rengas *kuinka pitkällä
 * tämä toisto on*. Ne vastaavat eri kysymykseen eivätkä siksi kilpaile.
 */
export function PlayButton({ playing, loading, progress, onClick }: Props) {
  const p = Math.max(0, Math.min(1, progress))

  return (
    <div className="play-wrap">
      <svg className="play-ring" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          className="play-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
        />
        {playing && (
          <circle
            className="play-ring-value"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - p)}
            // Kierros alkaa kello 12:sta myötäpäivään.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
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
