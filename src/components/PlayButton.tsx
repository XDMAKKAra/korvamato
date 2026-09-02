interface Props {
  playing: boolean
  loading: boolean
  onClick: () => void
}

/**
 * Soittonappi.
 *
 * Napin ympärillä oli aiemmin edistymisrengas, koska aikajana ei näyttänyt
 * lyhyen vihjeen etenemistä: suoralla sekuntimittakaavalla 0,2 s oli 1,3 %
 * janasta eli pari pikseliä. Aikajana on nyt jaettu tasalevyisiin lohkoihin
 * (ks. timeline.ts), joten soittopää kulkee täyden lohkon jokaisella vihjeellä.
 * Rengas kertoi siis saman asian toiseen kertaan ja jäi vain kehäksi napin
 * ympärille — nappi on nappi, eteneminen luetaan janalta.
 */
export function PlayButton({ playing, loading, onClick }: Props) {
  return (
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
  )
}
