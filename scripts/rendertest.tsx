/**
 * Renderöi sovelluksen palvelinpuolella oikealla biisidatalla ja tarkistaa
 * että näkymä syntyy ilman virheitä. Ei korvaa selaintestiä, mutta paljastaa
 * rikkinäiset propsit, puuttuvat kentät ja renderöinnin aikaiset poikkeukset.
 *
 * Aja: npm run test:render
 */
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import App from '../src/App'
import songsData from '../src/data/songs.json'
import type { Song } from '../src/types'
import { pickRun, dateKey } from '../src/game/daily'
import { MAX_GUESSES, tierInfo } from '../src/game/rules'

const SONGS = songsData as unknown as Song[]

let failed = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nSovelluksen renderöinti')

let html = ''
try {
  html = renderToString(createElement(App))
  check('App renderöityy ilman poikkeusta', true)
} catch (err) {
  check('App renderöityy ilman poikkeusta', false, (err as Error).message)
  process.exitCode = 1
  throw err
}

check('sivulla on pelin nimi', html.includes('Korvamato'))
check('hakukenttä näkyy', html.includes('Tunnistatko biisin'))
check('ohita-nappi näkyy', html.includes('Ohita'))
check('soita-nappi näkyy', html.includes('Soita vihje'))
check('ensimmäinen vihje on 0,2 s', html.includes('0,2 s'))
// React erottaa tekstinpätkät kommentilla, joten lasketaan pelkkä sana.
check('arvausrivejä on yksi per vihje', (html.match(/Arvaus/g) ?? []).length === MAX_GUESSES,
  `${(html.match(/Arvaus/g) ?? []).length} riviä, odotettu ${MAX_GUESSES}`)

// Ensimmäisen biisin pitää olla helpoin taso, eikä sen nimi saa vuotaa sivulle.
const someRun = pickRun('render-test', SONGS, 0)
const first = someRun[0]
check('kierros alkaa helpoimmasta', first.tier === 1, `taso ${first.tier}`)
check('vaikeustason nimi näkyy', html.includes(tierInfo(1).name))

check('vastausta ei paljasteta etukäteen',
  !html.includes(first.title) || first.title.length < 4,
  `"${first.title}" näkyi sivulla`)

check('artistia ei paljasteta etukäteen',
  !html.includes(`>${first.artist}<`),
  first.artist)

// Ääninäytteen osoite ei saa olla sivun lähdekoodissa ennen arvausta.
check('ääninäytteen osoite ei vuoda', !html.includes(first.preview))

console.log(failed === 0 ? '\nRenderöinti kunnossa.' : `\n${failed} tarkistusta hylätty.`)
if (failed > 0) process.exitCode = 1
