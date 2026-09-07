# Korvamato

A Finnish music guessing game. Five songs, easy to impossible, and the first clip you
hear is two tenths of a second. Every wrong guess or skip buys you a longer one.

```
0.2s  →  0.5s  →  2s  →  5s  →  8s  →  15s
```

Six attempts per song. The shorter the clip you name it from, the more points you get
(1000, 750, 550, 400, 250, 100), multiplied by the song's difficulty tier (×1 for easy up
to ×3 for impossible). A perfect round is 8,750.

There is a daily challenge, the same five songs for everyone, rotating at midnight, and
an unlimited mode filtered by era (2020s, 2010s, or classics) and genre (rock, rap, pop,
iskelmä). Results share as a grid of emoji squares. Spacebar plays the clip.

The library holds **6,701 Finnish songs** and there is no hand-maintained song list
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

`scripts/build-library.mjs` never reads a list of tracks. It finds them, using Last.fm
for discovery and iTunes for playable audio:

1. **Discovery by tag.** Last.fm tag queries return top tracks and artists. This replaced
   hand-picked playlists, which needed maintaining and kept going stale.
2. **Artist expansion.** For each Finnish artist found, the pipeline pulls their most
   listened tracks rather than their entire catalogue. This is the bulk of the library.
3. **Nationality and genre both come from tags,** not from a blocklist and not from a
   genre field. This is what finally made iskelmä work as a category: it has no node in
   iTunes' genre tree, but it is well tagged on Last.fm. The library now holds 1,224
   iskelmä tracks alongside 2,346 pop, 2,048 rap and 1,083 rock.
4. **Popularity filter with per-bucket quotas.** A flat play-count floor of one million
   would have emptied the classics buckets, since a well known 1980s song streams far
   less than a mediocre new one. So each genre and era bucket has its own minimum and
   ceiling.
5. **iTunes resolution** supplies the thing Last.fm cannot: a stable preview URL, artwork
   and a release year. An artist's whole iTunes catalogue is fetched in one or two
   requests and matched against the Last.fm titles by name, which is much cheaper than
   searching per track. Whatever fails to match is resolved individually.

The run is split into resumable stages, because Apple throttles hard enough that the
whole pipeline does not fit in one sitting:

```bash
node scripts/build-library.mjs --stage=discover
node scripts/build-library.mjs --stage=tracks
node scripts/build-library.mjs --stage=catalog [--time-budget=520000]
node scripts/build-library.mjs --stage=match
node scripts/build-library.mjs --stage=resolve-missing [--time-budget=520000]
node scripts/build-library.mjs --stage=finalize [--dry]
```

Each stage writes its own intermediate file under `data/` and skips work already done, so
an interrupted run picks up where it stopped instead of starting over.

### 2. Playing a two-tenths-of-a-second clip accurately

`src/game/audio.ts` fetches the 30-second preview, decodes it with the Web Audio API and
plays an exact slice with fades. An `<audio>` element's timer is not precise enough at
this length. Leading silence in the preview is detected and skipped so the first clip
never lands on nothing, and the next song preloads in the background. Browsers that
cannot decode the preview through Web Audio fall back to plain `<audio>` playback.

The playhead reads `AudioContext.currentTime` directly rather than a separate
`performance.now()` timer, so the animation cannot start before the sound or drift away
from it.

Tick marks and the playhead share one `secondsToPercent` mapping, so they cannot disagree
about where a given second sits. The axis is linear, and the crowding that causes at the
short end is handled where it actually shows: a label is only drawn if it clears the
already-placed ones by a minimum gap, so the early marks thin out instead of overlapping.

### 3. A daily puzzle that does not repeat

`src/game/daily.ts` picks one song per difficulty tier from the date. Each tier's pool is
walked with a stride chosen to be coprime with the pool size, so the whole pool is
exhausted before anything repeats. On top of that, no artist appears twice in one round
and no song appears on two consecutive days.

The selection is built as a chain from day 1 so that "avoid yesterday" is self-consistent,
and the chain is cached so it is computed once.

The daily challenge always draws from the full library so it is identical for everyone.
Era and genre filters only affect unlimited mode.

---

## Notes

Rebuilding the library needs Spotify credentials in `.env` (see `.env.example`) alongside
the Last.fm and iTunes calls. Responses cache under `data/`, so a re-run is fast.

The library is bundled into the JS payload rather than fetched at runtime. That keeps the
game a single static deploy with no server, at the cost of a first load large enough that
the data should move to a separate fetched file if the library grows much further.

**Copyright:** audio comes from the 30-second previews in Apple's public API, and the game
plays at most 15 seconds of any one. Nothing is stored or redistributed. Check the terms
yourself before publishing this to a wide audience.
