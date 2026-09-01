import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../types'
import { searchSongs } from '../game/match'

interface Props {
  songs: Song[]
  disabled: boolean
  onPick: (song: Song) => void
  /** Ilmoittaa parentille parhaiten täsmäävän ehdotuksen – "Arvaa"-nappia varten. */
  onTopMatchChange?: (song: Song | null) => void
}

export function SearchInput({ songs, disabled, onPick, onTopMatchChange }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchSongs(query, songs), [query, songs])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    onTopMatchChange?.(results[0] ?? null)
  }, [results, onTopMatchChange])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(song: Song) {
    onPick(song)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[cursor])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="search" ref={boxRef}>
      {open && results.length > 0 && (
        <div className="suggestions" role="listbox">
          {results.map((song, i) => (
            <button
              key={song.id}
              type="button"
              className={`suggestion${i === cursor ? ' cursor' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(song)}
              role="option"
              aria-selected={i === cursor}
            >
              <span className="s-title">{song.title}</span>
              <span className="s-artist">{song.artist}</span>
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Tunnistatko biisin? Kirjoita nimi tai artisti…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Hae biisiä"
      />

      {query && (
        <button className="search-clear" onClick={() => setQuery('')} aria-label="Tyhjennä">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
