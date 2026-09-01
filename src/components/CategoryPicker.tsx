import { useEffect, useMemo } from 'react'
import type { Era, Genre, Song } from '../types'
import { availableEras, availableGenres, filterSongs, type Filter } from '../game/categories'

interface Props {
  filter: Filter
  songs: Song[]
  onChange: (filter: Filter) => void
}

/**
 * Genre- ja aikakausivalitsin.
 *
 * Toteutettu painikeriveinä, ei alasvetovalikkoina: vaihtoehtoja on niin vähän
 * että ne mahtuvat näkyviin kerralla eikä valintaa tarvitse kaivaa esiin.
 * Jokainen siru on oikea `<button>` ja sen tila kerrotaan `aria-pressed`illä.
 *
 * **Aikakausivalikoima riippuu genrestä.** Genret eivät jakaudu tasaisesti
 * vuosikymmenille – suomiräppiä ei juuri ole ennen 2000-lukua – joten
 * pelikelvottomia yhdistelmiä ei tarjota lainkaan.
 */
export function CategoryPicker({ filter, songs, onChange }: Props) {
  const genres = useMemo(() => availableGenres(songs, null), [songs])
  const eras = useMemo(() => availableEras(songs, filter.genre), [songs, filter.genre])

  // Jos genren vaihto teki valitusta aikakaudesta pelikelvottoman, palataan
  // kaikkiin aikakausiin sen sijaan että jäätäisiin tyhjään valintaan.
  useEffect(() => {
    if (filter.era && !eras.some((e) => e.id === filter.era)) {
      onChange({ ...filter, era: null })
    }
  }, [eras, filter, onChange])

  const total = filterSongs(songs, filter).length

  return (
    <div className="picker">
      <Row
        label="Genre"
        options={[{ id: null, name: 'Kaikki' }, ...genres.map((g) => ({ id: g.id as string, name: g.name }))]}
        value={filter.genre}
        onPick={(id) => onChange({ ...filter, genre: id as Genre | null })}
      />
      <Row
        label="Aikakausi"
        options={[{ id: null, name: 'Kaikki' }, ...eras.map((e) => ({ id: e.id as string, name: e.name }))]}
        value={filter.era}
        onPick={(id) => onChange({ ...filter, era: id as Era | null })}
      />
      <p className="picker-count">
        <strong>{total.toLocaleString('fi-FI')}</strong> biisiä valittuna
      </p>
    </div>
  )
}

interface RowProps {
  label: string
  options: { id: string | null; name: string }[]
  value: string | null
  onPick: (id: string | null) => void
}

function Row({ label, options, value, onPick }: RowProps) {
  return (
    <div className="picker-row" role="group" aria-label={label}>
      <span className="picker-label">{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.id ?? 'all'}
            type="button"
            className="chip"
            aria-pressed={value === o.id}
            onClick={() => onPick(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  )
}
