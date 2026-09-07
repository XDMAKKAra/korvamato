# Korvamato

A Finnish music guessing game. Five songs, easy to impossible, and the first clip you
hear is **0.1 seconds long**. Every wrong guess or skip buys you a longer one.

```
0.1s  →  0.5s  →  2s  →  8s  →  15s
```

Five attempts per song. The shorter the clip you name it from, the more points you
score, multiplied by difficulty (easy ×1 … impossible ×3). A perfect round is 8,750.

There is a daily challenge — the same five songs for everyone, rotating at midnight —
and an unlimited mode where you can filter by era (2020s / 2010s / classics 1970–2010)
and genre (rock, rap, pop, iskelmä). Results share as a grid of emoji squares.
Spacebar plays the clip.

The library holds **3,174 Finnish songs**, and there is no hand-maintained song list
anywhere in the repo.

> Interface and content are in Finnish. This README is in English.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static dist/, deployable anywhere, no server needed
npm test         # logic, audio and render suites
```

Song data is committed to `src/data/songs.json`, so it works immediately after install.

**Stack:** React 19 + TypeScript + Vite. Two runtime dependencies, no framework, no
backend, no database.

---

## Three problems worth reading about

### 1. Building a song library without a song list

The pipeline in `scripts/build-library.mjs` never reads a list of tracks. It finds them:

1. **Artist seed** — the only hand-maintained data is artist *names*, never songs. They
   come from a 141-artist seed file, Apple's Finnish top-charts (re-fetched on every run,
   so new Finnish artists appear on their own), plus supplementary seeds for iskelmä,
   rap and 2020s rock.
2. **Catalogue expansion** — each artist's full Apple Music catalogue is pulled
   (`lookup?entity=song&limit=200`). This is the multiplier that turns ~200 artists into
   3,000+ tracks.
3. **Filtering** — karaoke, tribute, cover, instrumental, live, remix and demo versions,
   intros, skits, medleys (several songs in one track, unguessable by construction),
   duplicates and anything missing a preview clip.
4. **Difficulty is scored from data, not assigned by hand** — chart position, single
   release, membership in the original curated set, and catalogue size, bucketed into
   five levels by quantile.

**Limits I could not engineer around, documented honestly:**

- **Era is sometimes wrong.** Apple gives a *release* date, not the original recording
  year. Compilations are detected and the year is read from a range in the album title
  (`"Kaikki levytykset (1972-1992)"` → 1972) or left unknown, which sorts the song into
  classics. Individual reissues still slip into the wrong decade. This data source cannot
  fix that.
- **Iskelmä does not exist in Apple's genre data.** Verified at artist level (Jari
  Sillanpää is filed under "Pop") and across the whole genre tree (526 subgenres, no
  Iskelmä or Schlager node; the closest is a catch-all "Worldwide" that puts Piirpauke,
  Fredi and Fintelligens side by side, which is not iskelmä). So iskelmä is the one genre
  resolved through the artist seed instead.
- **Nationality is not in the API**, so international artists are dropped from the FI
  chart with a small blocklist matched against name fragments — which also catches
  collaborations like "LE SSERAFIM, ILLIT & KATSEYE".

### 2. Playing a 0.1-second clip accurately

`src/game/audio.ts` fetches the 30-second preview, decodes it with the Web Audio API and
plays an exact slice with fades. An `<audio>` element's timer is not precise enough at
100 milliseconds. Leading silence in the preview is detected and skipped so the first
clip never lands on nothing, and the next song preloads in the background. Browsers that
cannot decode AAC through Web Audio fall back to plain `<audio>` playback.

The playhead reads `AudioContext.currentTime` directly rather than a separate
`performance.now()` timer, so the animation cannot start before the sound or drift away
from it.

Timeline positions come from **one shared second→percent mapping** used by both the tick
marks and the playhead, so they cannot disagree. The mapping is logarithmic because the
clips span 0.1s to 15s, a 150× range: on a linear axis the first three marks would sit at
0.7%, 3.3% and 13.3%, effectively on top of each other. Logarithmically they land at
3.4% / 14.6% / 39.6% / 79.2% / 100%.

### 3. A daily puzzle that does not repeat

`src/game/daily.ts` picks one song per difficulty level from the date. Each level's pool
is walked in a fixed cycle whose step is coprime with the pool size, so the entire pool is
exhausted before anything repeats. On top of that, no artist appears twice in one round
and no song appears on two consecutive days.

The selection is built as a chain from day 1 so that "avoid yesterday" is self-consistent,
and the chain is cached so it is computed once.

The daily challenge always draws from the full library so it is identical for everyone.
Era and genre filters only affect unlimited mode.

---

## Notes

`npm run songs` rebuilds the library. Apple throttles at roughly 20 requests per minute;
responses cache to `data/.itunes-cache.json` (~53 MB, derived data, not in version
control), so a re-run is near-instant. Useful flags:

```bash
node scripts/build-library.mjs --dry              # report only, write nothing
node scripts/build-library.mjs --limit=20         # 20 artists, quick check
node scripts/build-library.mjs --delay=2500       # slower pace if throttled
node scripts/build-library.mjs --max-per-artist=8 # smaller library
```

The library is bundled into the JS payload: `dist` is about 1.8 MB, ~400 KB compressed.
Tolerable, but not nothing. If the library grows much further the data should move to a
separate file fetched at runtime.

**Copyright:** audio comes from the 30-second previews in Apple's public search API, and
the game plays at most 15 seconds of any one. Nothing is stored or redistributed. Check
the terms yourself before publishing this to a wide audience.
