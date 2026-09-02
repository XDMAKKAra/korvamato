/**
 * Soittimen tilakoneen testi valeäänimoottorilla. Aja: npm run test:audio
 *
 * Ääntä ei voi kuunnella komentoriviltä, mutta soittimen *tila* on puhdasta
 * logiikkaa: mikä soi, kuinka pitkään ja mistä hetkestä kello lasketaan. Juuri
 * siinä viat ovat olleet — soitto jatkui mutta rengas ei liikkunut, koska
 * edellisen klipin `onended` nollasi uuden klipin tilan.
 */

/* ---------- valeäänimoottori ---------- */

interface FakeSource {
  buffer: unknown
  onended: (() => void) | null
  started: boolean
  stopAt: number | null
  start(when: number, offset?: number): void
  stop(when?: number): void
  connect(node: unknown): unknown
}

const sources: FakeSource[] = []

class FakeCtx {
  currentTime = 0
  state = 'running'
  destination = {}
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
  decodeAudioData(): Promise<unknown> {
    const data = new Float32Array(44100 * 30).fill(0.5)
    return Promise.resolve({
      duration: 30,
      sampleRate: 44100,
      getChannelData: () => data,
    })
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {},
        cancelAndHoldAtTime() {},
      },
      connect: (n: unknown) => n,
    }
  }
  createBufferSource(): FakeSource {
    const src: FakeSource = {
      buffer: null,
      onended: null,
      started: false,
      stopAt: null,
      start(_when: number) {
        this.started = true
      },
      stop(when?: number) {
        // Oikea Web Audio kutsuu onendedin vasta tapahtumasilmukassa.
        if (when === undefined) {
          this.stopAt = 0
          setTimeout(() => this.onended?.(), 0)
        } else {
          this.stopAt = when
        }
      },
      connect: (n: unknown) => n,
    }
    sources.push(src)
    return src
  }
}

;(globalThis as Record<string, unknown>).window = { AudioContext: FakeCtx }
;(globalThis as Record<string, unknown>).fetch = () =>
  Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })

const { player } = await import('../src/game/audio')
import type { Song } from '../src/types'

const SONG: Song = {
  id: 'testi-1',
  artist: 'Testi',
  title: 'Biisi',
  preview: 'https://example.invalid/a.m4a',
  tier: 1,
} as Song

let failed = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const tick = () => new Promise((r) => setTimeout(r, 5))

console.log('\nSoittimen tilakone')

/* 1. Tavallinen soitto: kello käy ja kesto tiedetään. */
void player.play(SONG, 2)
await tick()
check('soitto alkaa', player.currentDuration() === 2, `${player.currentDuration()}`)
check('kello käy', player.elapsed() !== null)

/* 2. Pysäytys ja välitön uusi soitto.
   Edellisen lähteen onended saapuu vasta kun uusi klippi on jo käynnissä. */
player.stop()
void player.play(SONG, 5)
await tick()
check('uusi klippi tiedetään pysäytyksen jälkeen', player.currentDuration() === 5,
  `${player.currentDuration()}`)
check('kello käy pysäytyksen jälkeen', player.elapsed() !== null,
  'edellisen klipin onended nollasi tilan')

/* 3. Pidennys kesken soiton. */
const ok = player.extend(SONG, 8)
check('pidennys onnistuu', ok)
check('pidennetty kesto näkyy', player.currentDuration() === 8, `${player.currentDuration()}`)

/* 4. Pysäytys nollaa. */
player.stop()
await tick()
check('pysäytys nollaa keston', player.currentDuration() === 0, `${player.currentDuration()}`)
check('pysäytys nollaa kellon', player.elapsed() === null)

console.log(failed === 0 ? '\nSoitin kunnossa.' : `\n${failed} tarkistusta hylätty.`)
if (failed > 0) process.exitCode = 1
