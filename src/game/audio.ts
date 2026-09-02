import type { Song } from '../types'

interface Decoded {
  buffer: AudioBuffer
  /** Kohta josta klippi alkaa – ohitetaan näytteen alun hiljaisuus. */
  start: number
}

/** Etsii ensimmäisen kohdan jossa ääntä oikeasti on, ettei 0,1 s osu hiljaisuuteen. */
function findStart(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0)
  const win = 1024
  const threshold = 0.02
  const limit = Math.max(0, data.length - Math.floor(buffer.sampleRate * 16))

  for (let i = 0; i < Math.min(data.length - win, limit); i += win) {
    let peak = 0
    for (let j = i; j < i + win; j++) {
      const v = Math.abs(data[j])
      if (v > peak) peak = v
    }
    if (peak > threshold) {
      // Perutaan hitusen taaksepäin, ettei isku katkea keskeltä.
      return Math.max(0, i / buffer.sampleRate - 0.01)
    }
  }
  return 0
}

class ClipPlayer {
  private ctx: AudioContext | null = null
  private decoded = new Map<string, Promise<Decoded>>()
  private source: AudioBufferSourceNode | null = null
  private stopTimer: number | null = null

  /** Web Audio -polulla: ctx.currentTime jolloin nykyinen klippi todella alkaa. */
  private clipStartCtxTime: number | null = null
  /** Parhaillaan soivan biisin id, tai null jos mikään ei soi. */
  private playingId: string | null = null
  /** Nykyisen klipin pituus sekunteina – kasvaa kun klippiä pidennetään. */
  private clipDuration = 0
  /** Näytteestä käytettävissä oleva enimmäispituus (hiljaisuuden ohituksen jälkeen). */
  private maxDuration = 0
  private gain: GainNode | null = null
  /** Varatoteutuksen soittolupauksen ratkaisija, jotta ajastuksen voi uusia. */
  private fallbackResolve: (() => void) | null = null
  /**
   * Juokseva numero jokaiselle soittopyynnölle.
   *
   * `stop()` laukaisee edellisen lähteen `onended`-tapahtuman, mutta se saapuu
   * vasta tapahtumasilmukassa – siis mahdollisesti vasta kun seuraava klippi on
   * jo käynnissä. Ilman tätä numeroa edellisen soiton lopetuskoodi nollaisi
   * *uuden* klipin tilan, jolloin soitin ei enää tunne omaa ääntään: rengas ei
   * liiku, `stop()` ei pysäytä mitään ja `extend()` kieltäytyy pidentämästä.
   */
  private generation = 0

  /** Varajärjestelmä selaimille jotka eivät dekoodaa AAC:tä Web Audiolla. */
  private useFallback = false
  private audioEls = new Map<string, HTMLAudioElement>()
  private activeEl: HTMLAudioElement | null = null

  private ensureCtx(): AudioContext | null {
    if (this.useFallback) return null
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        this.useFallback = true
        return null
      }
      this.ctx = new Ctor()
    }
    return this.ctx
  }

  /** Kutsutaan ensimmäisestä käyttäjän klikkauksesta – selain vaatii sen. */
  unlock(): void {
    const ctx = this.ensureCtx()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  /** Lataa ja dekoodaa näytteen valmiiksi. Turvallinen kutsua monta kertaa. */
  preload(song: Song): Promise<Decoded | null> {
    if (this.useFallback) {
      this.preloadFallback(song)
      return Promise.resolve(null)
    }

    let job = this.decoded.get(song.id)
    if (!job) {
      job = (async () => {
        const ctx = this.ensureCtx()
        if (!ctx) throw new Error('no-audio-context')
        const res = await fetch(song.preview)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const bytes = await res.arrayBuffer()
        const buffer = await ctx.decodeAudioData(bytes)
        return { buffer, start: findStart(buffer) }
      })()

      job.catch(() => {
        // Dekoodaus ei onnistunut – siirrytään koko pelin osalta varatoteutukseen.
        this.decoded.delete(song.id)
        this.useFallback = true
        this.preloadFallback(song)
      })

      this.decoded.set(song.id, job)
    }
    return job.catch(() => null)
  }

  private preloadFallback(song: Song): HTMLAudioElement {
    let el = this.audioEls.get(song.id)
    if (!el) {
      el = new Audio(song.preview)
      el.preload = 'auto'
      el.load()
      this.audioEls.set(song.id, el)
    }
    return el
  }

  isReady(songId: string): boolean {
    if (this.useFallback) {
      const el = this.audioEls.get(songId)
      return !!el && el.readyState >= 2
    }
    return this.decoded.has(songId)
  }

  /** Soittaa `seconds` sekuntia biisin alusta. Palautuu kun klippi loppuu. */
  async play(song: Song, seconds: number): Promise<void> {
    const gen = ++this.generation
    this.stop()

    if (!this.useFallback) {
      const d = await this.preload(song)
      if (d && !this.useFallback) {
        const ctx = this.ensureCtx()
        if (ctx) {
          if (ctx.state === 'suspended') await ctx.resume()

          const dur = Math.min(seconds, Math.max(0.05, d.buffer.duration - d.start))
          const fadeIn = Math.min(0.008, dur / 8)
          const fadeOut = Math.min(0.03, dur / 4)

          const src = ctx.createBufferSource()
          src.buffer = d.buffer
          const gain = ctx.createGain()
          const t0 = ctx.currentTime + 0.02

          gain.gain.setValueAtTime(0, t0)
          gain.gain.linearRampToValueAtTime(1, t0 + fadeIn)
          gain.gain.setValueAtTime(1, t0 + dur - fadeOut)
          gain.gain.linearRampToValueAtTime(0, t0 + dur)

          src.connect(gain).connect(ctx.destination)
          // Soitetaan koko loppunäyte ja katkaistaan ajastetusti: näin klippiä
          // voi pidentää kesken soiton (ks. extend()) ilman että ääni katkeaa.
          src.start(t0, d.start)
          src.stop(t0 + dur + 0.01)
          this.source = src
          this.gain = gain
          this.playingId = song.id
          this.clipDuration = dur
          this.maxDuration = Math.max(0.05, d.buffer.duration - d.start)
          // Klippi alkaa todellisuudessa vasta t0:ssa (ei heti) – tästä lasketaan
          // kulunut aika elapsed()-metodissa, jotta animaatio seuraa ääntä eikä
          // ajaudu siitä erilleen.
          this.clipStartCtxTime = t0

          await new Promise<void>((resolve) => {
            src.onended = () => resolve()
          })
          // Puretaan vain jos tämä soitto on yhä uusin. Muuten nollattaisiin
          // seuraavan klipin tila (ks. `generation`).
          if (this.generation === gen) {
            this.source = null
            this.gain = null
            this.playingId = null
            this.clipStartCtxTime = null
            this.clipDuration = 0
          }
          return
        }
      }
    }

    // Varatoteutus: tavallinen <audio> ja ajastin.
    const el = this.preloadFallback(song)
    this.activeEl = el
    this.playingId = song.id
    this.clipDuration = seconds
    try {
      el.currentTime = 0
      el.volume = 1
      await el.play()
    } catch {
      return
    }
    await new Promise<void>((resolve) => {
      this.fallbackResolve = resolve
      this.armFallbackStop(el, seconds)
    })
  }

  /** Ajastaa varatoteutuksen katkaisun niin, että se osuu klipin loppuun. */
  private armFallbackStop(el: HTMLAudioElement, totalSeconds: number): void {
    if (this.stopTimer !== null) clearTimeout(this.stopTimer)
    const remaining = Math.max(0, totalSeconds - el.currentTime)
    this.stopTimer = window.setTimeout(() => {
      el.pause()
      el.currentTime = 0
      this.stopTimer = null
      this.activeEl = null
      this.playingId = null
      const done = this.fallbackResolve
      this.fallbackResolve = null
      done?.()
    }, remaining * 1000)
  }

  /**
   * Pidentää parhaillaan soivan klipin uuteen pituuteen **katkaisematta ääntä**.
   *
   * Kun pelaaja ohittaa tai arvaa väärin kesken soiton, seuraava vihje on
   * pidempi pätkä samasta kohdasta biisiä. Uudelleenaloitus alusta tuntuisi
   * hyppäykseltä ja veisi jo kuullun kohdan pois; luontevampaa on että ääni
   * vain jatkaa uuteen rajaan asti.
   *
   * @returns tosi jos pidennys onnistui, epätosi jos mikään ei soi tai soiva
   *          biisi on eri – kutsujan pitää silloin aloittaa soitto normaalisti.
   */
  extend(song: Song, seconds: number): boolean {
    if (this.playingId !== song.id) return false
    if (seconds <= this.clipDuration) return false

    if (!this.useFallback && this.source && this.gain && this.ctx && this.clipStartCtxTime !== null) {
      const dur = Math.min(seconds, this.maxDuration)
      if (dur <= this.clipDuration) return false

      const t0 = this.clipStartCtxTime
      const now = this.ctx.currentTime
      const fadeOut = Math.min(0.03, dur / 4)

      // Peruutetaan aiempi häivytys ja siirretään se uuteen loppukohtaan.
      // cancelAndHoldAtTime jäädyttää voimakkuuden siihen arvoon jossa se juuri
      // nyt on – tavallinen cancelScheduledValues palauttaisi sen edellisen
      // tapahtuman arvoon, mikä naksahtaisi jos pidennys osuu kesken häivytyksen.
      const g = this.gain.gain as GainNode['gain'] & { cancelAndHoldAtTime?: (t: number) => void }
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now)
      else g.cancelScheduledValues(now)
      // Nostetaan takaisin täyteen ennen uutta loppuhäivytystä.
      g.linearRampToValueAtTime(1, Math.min(now + 0.02, t0 + dur - fadeOut))
      g.setValueAtTime(1, Math.max(now, t0 + dur - fadeOut))
      g.linearRampToValueAtTime(0, t0 + dur)

      try {
        this.source.stop(t0 + dur + 0.01)
      } catch {
        return false
      }
      this.clipDuration = dur
      return true
    }

    if (this.activeEl) {
      this.clipDuration = seconds
      this.armFallbackStop(this.activeEl, seconds)
      return true
    }

    return false
  }

  stop(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    if (this.source) {
      try {
        // onended jätetään paikalleen: stop() laukaisee sen ja soittoa
        // odottava lupaus ratkeaa sen sijaan että jäisi roikkumaan.
        this.source.stop()
      } catch {
        /* jo pysäytetty */
      }
      this.source = null
    }
    this.gain = null
    this.clipStartCtxTime = null
    this.playingId = null
    this.clipDuration = 0
    if (this.activeEl) {
      this.activeEl.pause()
      this.activeEl.currentTime = 0
      this.activeEl = null
    }
    const done = this.fallbackResolve
    this.fallbackResolve = null
    done?.()
  }

  /** Parhaillaan soivan klipin pituus sekunteina, tai 0 jos mikään ei soi. */
  currentDuration(): number {
    return this.playingId ? this.clipDuration : 0
  }

  /**
   * Nykyisen klipin todellinen kulunut aika sekunteina, tai null jos mikään
   * ei soi. Web Audio -polulla tämä on `AudioContext.currentTime`-pohjainen
   * (ei `performance.now()`), joten animaatio pysyy synkassa äänen kanssa
   * vaikka ääni alkaa hieman `play()`-kutsun jälkeen (ajastettu `t0`).
   * Varatoteutuksessa (`<audio>`) käytetään elementin omaa kulunutta aikaa.
   */
  elapsed(): number | null {
    if (this.ctx && this.clipStartCtxTime !== null) {
      return Math.max(0, this.ctx.currentTime - this.clipStartCtxTime)
    }
    if (this.activeEl) {
      return this.activeEl.currentTime
    }
    return null
  }
}

export const player = new ClipPlayer()
