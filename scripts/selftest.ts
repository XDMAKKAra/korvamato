/**
 * Pelilogiikan itsetesti. Aja: npm test
 *
 * Testaa oikealla biisidatalla että arvonta, pisteytys, haku ja jakoteksti
 * toimivat. Lopuksi tarkistaa otoksella että ääninäytteiden osoitteet vastaavat.
 */
import songsData from '../src/data/songs.json'
import type { RunState, Song } from '../src/types'
import { MAX_GUESSES, MAX_SCORE, STAGES, TIERS, nextStageSeconds, roundContinues, scoreFor } from '../src/game/rules'
import { dateKey, pickRun, puzzleNumber } from '../src/game/daily'
import { isSameSong, normalize, searchSongs, songLabel } from '../src/game/match'
import { buildShareText, runScore, solvedAtStage } from '../src/game/share'
import { AXIS_SECONDS, clipProgress, headPercent, secondsToPercent, ticks, unlockedPercent } from '../src/game/timeline'
import { ERAS, GENRES, filterKey, filterLabel, filterSongs } from '../src/game/categories'

const SONGS = songsData as unknown as Song[]

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(name: string) {
  console.log(`\n${name}`)
}

/* ---------- 1. datan eheys ---------- */

section('Biisidata')

check('kanta ei ole tyhjä', SONGS.length > 0, `${SONGS.length} biisiä`)

const badFields = SONGS.filter(
  (s) => !s.id || !s.artist || !s.title || !s.preview || !s.preview.startsWith('https://'),
)
check('kaikilla biiseillä on id, artisti, nimi ja https-näyte', badFields.length === 0,
  badFields.slice(0, 3).map((s) => `${s.artist} – ${s.title}`).join(', '))

const dupIds = SONGS.length - new Set(SONGS.map((s) => s.id)).size
check('ei duplikaatti-id:itä', dupIds === 0, `${dupIds} duplikaattia`)

for (const t of TIERS) {
  const n = SONGS.filter((s) => s.tier === t.tier).length
  check(`taso ${t.tier} (${t.name}) on pelattava`, n >= 5, `${n} biisiä`)
}

const noArt = SONGS.filter((s) => !s.artwork).length
check('kansikuvat löytyvät', noArt === 0, `${noArt} ilman kuvaa`)

/* ---------- 2. arvonta ---------- */

section('Päivän arvonta')

const today = dateKey()
const runA = pickRun(today, SONGS)
const runB = pickRun(today, SONGS)

check('arvonta on sama samalla päivällä',
  runA.map((s) => s.id).join() === runB.map((s) => s.id).join())

check('kierroksessa on viisi biisiä', runA.length === 5, `${runA.length}`)

check('yksi biisi jokaiselta tasolta',
  runA.map((s) => s.tier).join() === '1,2,3,4,5',
  runA.map((s) => s.tier).join())

check('sama artisti ei esiinny kahdesti',
  new Set(runA.map((s) => s.artist)).size === runA.length,
  runA.map((s) => s.artist).join(', '))

// Peräkkäisinä päivinä ei saa tulla samaa biisiä samalle tasolle.
const days: string[][] = []
for (let d = 0; d < 60; d++) {
  const date = new Date()
  date.setDate(date.getDate() + d)
  days.push(pickRun(dateKey(date), SONGS).map((s) => s.id))
}
let backToBack = 0
for (let d = 1; d < days.length; d++) {
  for (let t = 0; t < 5; t++) if (days[d][t] === days[d - 1][t]) backToBack++
}
check('peräkkäisinä päivinä ei toistoa', backToBack === 0, `${backToBack} toistoa`)

const distinctPerTier = [0, 1, 2, 3, 4].map((t) => new Set(days.map((d) => d[t])).size)
check('60 päivän aikana biisit vaihtelevat',
  distinctPerTier.every((n) => n >= 5),
  `eri biisejä tasoittain: ${distinctPerTier.join(', ')}`)

// Kierron pitää käydä pooli lähes kokonaan läpi. Yksittäinen biisi voi jäädä
// väliin, kun artistin toisto tai edellisen päivän välttäminen siirtää valintaa.
const poolSizes = TIERS.map((t) => SONGS.filter((s) => s.tier === t.tier).length)
const expectedCoverage = poolSizes.map((n) => Math.floor(Math.min(n, 60) * 0.9))
check('kierto käyttää poolin lähes kokonaan',
  distinctPerTier.every((n, i) => n >= expectedCoverage[i]),
  distinctPerTier.map((n, i) => `${n}/${Math.min(poolSizes[i], 60)}`).join(' '))

// Rajattomassa tilassa peräkkäiset kierrokset eivät saa olla samoja.
const randomRuns = Array.from({ length: 20 }, () =>
  pickRun('satunnainen', SONGS, Math.floor(Math.random() * 1e9)).map((s) => s.id).join(),
)
check('rajaton tila arpoo eri kierroksia', new Set(randomRuns).size >= 15,
  `${new Set(randomRuns).size}/20 erilaista`)

check('pelin numero kasvaa päivittäin',
  puzzleNumber('2026-01-02') - puzzleNumber('2026-01-01') === 1)

/* ---------- 3. pisteytys ---------- */

section('Pisteytys')

check('0,1 sekunnin helppo on 1000 pistettä', scoreFor(1, 0) === 1000, `${scoreFor(1, 0)}`)
check('mahdoton kertoo pisteet kolmella', scoreFor(5, 0) === 3000, `${scoreFor(5, 0)}`)
check('viimeinen vihje antaa vähiten', scoreFor(1, 4) < scoreFor(1, 0))
check('maksimi on 8750', MAX_SCORE === 8750, `${MAX_SCORE}`)
check('vihjeitä on kuusi', STAGES.length === 6 && MAX_GUESSES === 6, `${STAGES.length}`)

for (const t of TIERS) {
  let prev = Infinity
  let monotonic = true
  for (let i = 0; i < STAGES.length; i++) {
    const p = scoreFor(t.tier, i)
    if (p >= prev) monotonic = false
    prev = p
  }
  check(`taso ${t.tier}: pisteet laskevat vihje vihjeeltä`, monotonic)
}

/* ---------- 3b. aikajana ---------- */

section('Aikajana')

function approx(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) <= eps
}

check('akseli on 15 sekuntia', AXIS_SECONDS === 15, `${AXIS_SECONDS}`)
check('vihjeitä on kuusi', STAGES.length === 6, `${STAGES.length}`)
check('vihjepituudet ovat 0,2 / 0,5 / 2 / 5 / 8 / 15 s',
  JSON.stringify([...STAGES]) === JSON.stringify([0.2, 0.5, 2, 5, 8, 15]),
  [...STAGES].join(' / '))

// Yhtenäinen akseli: palkki ei vaihda mittakaavaa vihjeiden välillä, vaan
// avattu alue kasvaa samalla janalla.
check('0 s on akselin alussa', secondsToPercent(0) === 0, `${secondsToPercent(0)}%`)
check('15 s on akselin lopussa', secondsToPercent(15) === 100, `${secondsToPercent(15)}%`)
check('sekunnit kuvautuvat lineaarisesti',
  approx(secondsToPercent(7.5), 50) && approx(secondsToPercent(3.75), 25),
  `7,5s=${secondsToPercent(7.5).toFixed(1)}% 3,75s=${secondsToPercent(3.75).toFixed(1)}%`)

check('avattu alue vastaa vihjetason sekunteja',
  STAGES.every((s, i) => unlockedPercent(i) === secondsToPercent(s)),
  STAGES.map((s, i) => `${s}s:${unlockedPercent(i).toFixed(1)}%`).join(' '))

check('avattu alue kasvaa joka vihjeellä',
  STAGES.every((_s, i) => i === 0 || unlockedPercent(i) > unlockedPercent(i - 1)), 'kaikki tasot')

// Soittopään pitää osua täsmälleen sen vihjeen merkkiin, jonka loppuun asti
// klippi on soinut – juuri tämä oli rikki alkuperäisessä bugiraportissa.
check('soittopää osuu merkkiin täsmälleen klipin lopussa jokaisella vihjeellä',
  STAGES.every((s, i) => headPercent(s) === unlockedPercent(i)),
  STAGES.map((s, i) => `${s}s: ${headPercent(s).toFixed(1)}=${unlockedPercent(i).toFixed(1)}`).join(' '))

check('soittopää alkaa 0 %:sta', headPercent(0) === 0, `${headPercent(0)}`)
check('soittopää ei koskaan ylitä 100 %:a', headPercent(999) === 100, `${headPercent(999)}`)

// Merkit: viiva jokaisessa vihjepituudessa, sekuntiluku vain kun se mahtuu.
const t0 = ticks(0)
check('merkkejä on yksi jokaista vihjettä kohden', t0.length === STAGES.length, `${t0.length}`)
check('merkit ovat nousevassa järjestyksessä',
  t0.every((t, i) => i === 0 || t.percent > t0[i - 1].percent),
  t0.map((t) => t.percent.toFixed(1)).join(' '))

check('nimetyt luvut eivät mene päällekkäin',
  (() => {
    const on = t0.filter((t) => t.labelled).map((t) => t.percent)
    return on.every((p, i) => i === 0 || p - on[i - 1] >= 7)
  })(),
  t0.filter((t) => t.labelled).map((t) => t.seconds + 's').join(' '))

check('nykyisen vihjeen luku näytetään aina, myös ahtaimmassa kohdassa',
  STAGES.every((_s, i) => ticks(i)[i].labelled),
  'kaikki tasot')

check('0,5 s jää nimeämättä kun se ei ole nykyinen vihje',
  ticks(0)[1].labelled === false, `labelled=${ticks(0)[1].labelled}`)

// Soittonapin rengas. Aikajanan soittopää ei voi näyttää lyhyen vihjeen
// etenemistä (0,2 s on 1,3 % janasta eli pari pikseliä), joten rengas kiertää
// aina täyden kierroksen klipin aikana. Ilman tätä lyhyt vihje näyttää siltä
// ettei mikään liiku – juuri se oli bugiraportti.
check('rengas on tyhjä klipin alussa jokaisella vihjeellä',
  STAGES.every((s) => clipProgress(0, s) === 0), 'kaikki vihjeet')

check('rengas on täysi klipin lopussa jokaisella vihjeellä',
  STAGES.every((s) => clipProgress(s, s) === 1),
  STAGES.map((s) => `${s}s:${clipProgress(s, s)}`).join(' '))

check('rengas on puolivälissä klipin puolivälissä jokaisella vihjeellä',
  STAGES.every((s) => approx(clipProgress(s / 2, s), 0.5, 0.001)),
  STAGES.map((s) => `${s}s:${clipProgress(s / 2, s).toFixed(2)}`).join(' '))

check('rengas etenee lineaarisesti myös lyhyimmällä 0,2 s vihjeellä',
  [0.25, 0.5, 0.75].every((f) => approx(clipProgress(STAGES[0] * f, STAGES[0]), f, 0.001)),
  [0.25, 0.5, 0.75].map((f) => `${(f * 100).toFixed(0)}%:${clipProgress(STAGES[0] * f, STAGES[0]).toFixed(2)}`).join(' '))

check('rengas ei ylitä täyttä eikä mene negatiiviseksi',
  clipProgress(99, 0.2) === 1 && clipProgress(-5, 0.2) === 0, 'rajattu 0..1')

check('rengas on tyhjä kun mikään ei soi', clipProgress(null, 0.2) === 0, 'null')
check('nollapituinen klippi ei kaada laskentaa', clipProgress(1, 0) === 0, '0 s')

/* ---------- 4. haku ---------- */

section('Biisihaku')

const sample = SONGS[Math.floor(SONGS.length / 2)]

check('tarkalla nimellä löytyy oikea biisi',
  searchSongs(sample.title, SONGS)[0]?.title === sample.title,
  `haettu "${sample.title}", sai "${searchSongs(sample.title, SONGS)[0]?.title}"`)

check('artistin nimellä löytyy sen biisejä',
  searchSongs(sample.artist, SONGS).some((s) => s.artist === sample.artist),
  sample.artist)

const aakkos = SONGS.find((s) => /[äöå]/i.test(s.artist))
if (aakkos) {
  const plain = normalize(aakkos.artist)
  check('haku toimii ilman ääkkösiä',
    searchSongs(plain, SONGS).some((s) => s.artist === aakkos.artist),
    `"${plain}" -> ${aakkos.artist}`)
} else {
  check('haku toimii ilman ääkkösiä', true, 'ei ääkkösartisteja kannassa')
}

check('osittainen nimi löytää biisin',
  searchSongs(sample.title.slice(0, Math.max(3, Math.ceil(sample.title.length / 2))), SONGS).length > 0)

check('tyhjä haku ei palauta mitään', searchSongs('', SONGS).length === 0)

check('haku ei palauta samaa biisiä kahdesti', (() => {
  const r = searchSongs('a', SONGS)
  return new Set(r.map((s) => `${normalize(s.artist)}|${normalize(s.title)}`)).size === r.length
})())

check('sama biisi tunnistetaan eri julkaisusta',
  isSameSong(sample, { ...sample, id: 'toinen-id', album: 'Kokoelma' }))

check('eri biisejä ei sekoiteta',
  !isSameSong(SONGS[0], SONGS[1]))

/* ---------- 5. kierroksen kulku ja jakoteksti ---------- */

section('Kierros ja jakoteksti')

const picks = pickRun(today, SONGS)
const run: RunState = {
  mode: 'paiva',
  key: today,
  songIds: picks.map((s) => s.id),
  rounds: picks.map((s, i) => ({
    songId: s.id,
    // Biisi i ratkeaa i:nnellä vihjeellä; viimeinen jää ratkematta.
    guesses:
      i === 4
        ? Array.from({ length: 5 }, () => ({ kind: 'ohitus' as const }))
        : [
            ...Array.from({ length: i }, () => ({ kind: 'vaara' as const, label: 'x' })),
            { kind: 'oikein' as const, songId: s.id, label: 'oikein' },
          ],
    status: i === 4 ? ('ohi' as const) : ('oikein' as const),
  })),
  current: 4,
  finished: true,
}

check('ratkaisuvihje tunnistetaan oikein',
  [0, 1, 2, 3].every((i) => solvedAtStage(run, i) === i),
  [0, 1, 2, 3].map((i) => solvedAtStage(run, i)).join(','))

check('ratkematon biisi antaa -1', solvedAtStage(run, 4) === -1)

const expected = picks.slice(0, 4).reduce((sum, s, i) => sum + scoreFor(s.tier, i), 0)
check('kierroksen pisteet lasketaan oikein', runScore(run, SONGS) === expected,
  `sai ${runScore(run, SONGS)}, odotettiin ${expected}`)

check('pisteet eivät ylitä maksimia', runScore(run, SONGS) <= MAX_SCORE)

const share = buildShareText(run, SONGS)
const gridRows = share.split('\n').filter((l) => /^[🟩🟥⬜]/u.test(l))
check('jakoteksti sisältää rivin per biisi', gridRows.length === 5, `${gridRows.length}`)
check('jokaisella rivillä on ruutu per vihje',
  gridRows.every((r) => [...r].filter((c) => '🟩🟥⬜'.includes(c)).length === MAX_GUESSES),
  `${MAX_GUESSES}`)
check('jakotekstissä on pelin nimi', share.includes('Korvamato'))
check('ratkeamaton rivi on kokonaan punainen',
  [...gridRows[4]].filter((c) => c === '🟥').length === MAX_GUESSES)

/* ---------- 5b. kategoriat ---------- */

section('Kategoriat (genre × aikakausi)')

// Käydään läpi kaikki 12 genre×aikakausi-yhdistelmää. Jakauma on ohut
// (esim. rap/2020 tai iskelmä voi olla lähes tyhjä) ja kasvaa datan mukana,
// joten emme oleta kiinteitä lukumääriä – vain että suodatus ei kaadu ja
// palauttaa vain oikeaan kategoriaan kuuluvia biisejä.
let combosChecked = 0
let combosNonEmpty = 0
for (const era of ERAS) {
  for (const genre of GENRES) {
    combosChecked++
    const filter = { era: era.id, genre: genre.id }
    const filtered = filterSongs(SONGS, filter)
    if (filtered.length > 0) combosNonEmpty++

    check(`${filterLabel(filter)}: suodatus ei kaadu ja palauttaa oikeat biisit`,
      filtered.every((s) => s.era === era.id && s.genre === genre.id),
      `${filtered.length} biisiä`)

    // Kierroksen rakentaminen ohuesta tai tyhjästä poolista ei saa heittää
    // poikkeusta – UI:n pitää kestää sekä tyhjä että vajaa kierros siististi.
    let threw = false
    let picks: Song[] = []
    try {
      picks = pickRun('kategoriatesti', filtered)
    } catch {
      threw = true
    }
    check(`${filterLabel(filter)}: pickRun ei kaadu ohuella/tyhjällä poolilla`, !threw)
    check(`${filterLabel(filter)}: kierros käyttää vain suodatettuja biisejä`,
      picks.every((s) => s.era === era.id && s.genre === genre.id))
  }
}
check('kaikki 12 genre×aikakausi-yhdistelmää käytiin läpi', combosChecked === 12, `${combosChecked}`)
check('vähintään osa kategorioista on pelattavissa', combosNonEmpty > 0, `${combosNonEmpty}/12 ei-tyhjää`)

check('filterKey on vakaa ja erottelee yhdistelmät',
  filterKey({ era: '2020', genre: 'rock' }) !== filterKey({ era: '2010', genre: 'rock' }) &&
  filterKey({ era: null, genre: null }) === 'kaikki')

/* ---------- 6. ääninäytteiden saatavuus ---------- */

async function checkPreviews() {
  section('Ääninäytteiden saatavuus (otos)')

  const step = Math.max(1, Math.floor(SONGS.length / 12))
  const picked = SONGS.filter((_, i) => i % step === 0).slice(0, 12)

  const results = await Promise.all(
    picked.map(async (s) => {
      try {
        const res = await fetch(s.preview, { method: 'GET', headers: { Range: 'bytes=0-1023' } })
        return { s, ok: res.ok, status: res.status }
      } catch (err) {
        return { s, ok: false, status: (err as Error).message }
      }
    }),
  )

  for (const r of results) {
    check(`${r.s.artist} – ${r.s.title}`, r.ok, `HTTP ${r.status}`)
  }
}

await checkPreviews()

/* ---------- yhteenveto ---------- */

section('Soiton jatkuminen ohituksessa')

// Ohitus ja väärä arvaus jatkavat kierrosta, joten soiva klippi pidennetään
// sen sijaan että se aloitettaisiin alusta.
check('ohitus jatkaa kierrosta kun yrityksiä on jäljellä',
  [0, 1, 2, 3].every((n) => roundContinues('ohitus', n)), 'arvaukset 0-3')
check('viides arvaus päättää kierroksen',
  !roundContinues('ohitus', MAX_GUESSES - 1) && !roundContinues('vaara', MAX_GUESSES - 1),
  `arvaus ${MAX_GUESSES}`)
check('oikea vastaus päättää kierroksen aina',
  [0, 1, 2, 3, 4].every((n) => !roundContinues('oikein', n)), 'kaikki arvausmäärät')

check('ohitus pidentää klippiä seuraavaan vihjepituuteen',
  [0, 1, 2, 3].every((n) => nextStageSeconds(n) === STAGES[n + 1]),
  [0, 1, 2, 3].map((n) => `${STAGES[n]}s -> ${nextStageSeconds(n)}s`).join(', '))

check('pidennys on aina kasvava – klippi ei koskaan lyhene',
  [0, 1, 2, 3].every((n) => nextStageSeconds(n) > STAGES[n]), 'kaikki vihjetasot')

check('viimeisellä vihjeellä pituus ei enää kasva',
  nextStageSeconds(MAX_GUESSES - 1) === STAGES[STAGES.length - 1],
  `${nextStageSeconds(MAX_GUESSES - 1)} s`)

section('Haku osuu feat-vieraisiin')

const featSongs = SONGS.filter((s) => s.artists && s.artists.length > 1)
check('kannassa on feat-kappaleita', featSongs.length > 0, `${featSongs.length} kpl`)

// Käyttäjän raportoima tapaus: "Uskomaton" on Elastisen biisi jossa on Sara
// Bee, ja sen pitää löytyä myös vieraan nimellä.
//
// Pelkkä vieraan nimi ei riitä kriteeriksi: suosituilla vierailla (Käärijä,
// Sexmane, Cledos) on itsellään yli 20 omaa biisiä, jotka täyttävät
// tuloslistan ennen yhteistyökappaletta – ja niin kuuluukin. Testataan siis
// niin kuin pelaaja oikeasti hakee: vieraan nimi ja sana kappaleen nimestä.
const guestHits = featSongs.filter((s) => {
  const guest = s.artists[s.artists.length - 1]
  const word = s.title.split(/\s+/)[0]
  return searchSongs(`${guest} ${word}`, SONGS, 20).some((r) => r.id === s.id)
})
check('feat-vieraan nimellä ja biisin sanalla löytyy oikea kappale',
  featSongs.length > 0 && guestHits.length / featSongs.length > 0.9,
  `${guestHits.length}/${featSongs.length}`)

// Pelkällä vieraan nimellä pitää löytyä ainakin silloin kun vieraalla ei ole
// omaa laajaa tuotantoa täyttämässä tuloslistaa.
const rareGuests = featSongs.filter((s) => {
  const guest = normalize(s.artists[s.artists.length - 1])
  return SONGS.filter((x) => x.artists?.some((a) => normalize(a) === guest)).length <= 15
})
const rareHits = rareGuests.filter((s) => {
  const guest = s.artists[s.artists.length - 1]
  return searchSongs(guest, SONGS, 20).some((r) => r.id === s.id)
})
check('harvinaisen feat-vieraan pelkkä nimi riittää',
  rareGuests.length > 0 && rareHits.length / rareGuests.length > 0.9,
  `${rareHits.length}/${rareGuests.length}`)

check('näytettävä nimi paljastaa feat-vieraan',
  featSongs.every((s) => !/feat/i.test(s.fullTitle) || /feat/i.test(songLabel(s))),
  'songLabel käyttää fullTitleä')



console.log(`\n${'─'.repeat(40)}`)
console.log(`Läpi: ${passed}   Hylätty: ${failed}`)
if (failed > 0) process.exitCode = 1