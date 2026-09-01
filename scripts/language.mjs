/**
 * Ratkaisee tekeekö artisti suomenkielistä musiikkia.
 *
 * Peli on suomenkielinen musiikkivisa, joten suomalaisenkin artistin ulkomaille
 * tai toisella kielellä tekemä tuotanto (Redrama, Nightwish, Blind Channel) ei
 * kuulu kantaan.
 *
 * **Päätös tehdään artistitasolla, ei kappaleen nimestä.** Moni suomenkielinen
 * biisi on englanninkielisellä nimellä, joten "nimessä on englantia -> pois"
 * olisi väärä sääntö. Nimeä käytetään vain MYÖNTEISENÄ todisteena: selvästi
 * suomenkielinen nimi todistaa artistin laulavan suomeksi, mutta
 * englanninkielinen nimi ei todista päinvastaista.
 *
 * Kolme signaalia, järjestyksessä:
 *
 *   1. MusicBrainzin julkaisukieli (`text-representation.language`). Tämä on
 *      oikea kielimerkintä, ei arvaus: Redrama eng 21 / fin 2, Nightwish eng 25.
 *      Kattavuus on kuitenkin vajaa — esim. Cheekin julkaisuilla ei ole
 *      kielitietoa lainkaan — joten se ei yksin riitä.
 *   2. Selvästi suomenkieliset kappaleiden nimet (ääkköset ja suomen taivutus).
 *      Vain myönteisenä todisteena, ks. yllä.
 *   3. Last.fm:n tagit `suomirap`, `suomipop`, `suomirock`, `iskelma` — nämä
 *      viittaavat nimenomaan suomenkieliseen tuotantoon, toisin kuin
 *      pelkkä `finnish`, joka kertoo vain kansallisuuden.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MB_UA = { 'User-Agent': 'korvamato-buildlib/1.0 ( https://github.com/ )' }

/** MusicBrainz sallii yhden pyynnön sekunnissa. Tahdistin on globaali. */
const MB_MIN_INTERVAL_MS = 1100
let mbNextSlot = 0

async function mbThrottle() {
  const now = Date.now()
  const slot = Math.max(now, mbNextSlot)
  mbNextSlot = slot + MB_MIN_INTERVAL_MS
  if (slot > now) await sleep(slot - now)
}

/**
 * Hakee artistin julkaisujen kielijakauman MusicBrainzista.
 *
 * Ohimenevää virhettä (503, verkkokatko) EI talleteta välimuistiin – vain
 * varsinainen tulos. Deezer-putkessa juuri sen sekoittaminen myrkytti 88 %
 * välimuistista.
 *
 * @returns { fin, other, total } tai null jos tietoa ei saatu
 */
export async function mbLanguages(artistName, cache) {
  const key = `mb:${artistName.toLowerCase()}`
  if (cache && cache[key] !== undefined) return cache[key]

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await mbThrottle()
      const q = encodeURIComponent(`artist:"${artistName}"`)
      const sr = await fetch(`https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=1`, { headers: MB_UA })
      if (!sr.ok) { await sleep(1500 * 2 ** attempt); continue }
      const sj = await sr.json()
      const artist = sj.artists?.[0]
      // Vain suomalaiset artistit kiinnostavat; muu maa tarkoittaa nimitörmäystä.
      if (!artist || (artist.country && artist.country !== 'FI')) {
        const miss = { fin: 0, other: 0, total: 0 }
        if (cache) cache[key] = miss
        return miss
      }

      await mbThrottle()
      const rr = await fetch(
        `https://musicbrainz.org/ws/2/release?artist=${artist.id}&fmt=json&limit=50`,
        { headers: MB_UA },
      )
      if (!rr.ok) { await sleep(1500 * 2 ** attempt); continue }
      const rj = await rr.json()

      let fin = 0
      let other = 0
      for (const rel of rj.releases || []) {
        const lang = rel['text-representation']?.language
        if (!lang) continue
        if (lang === 'fin') fin++
        else other++
      }
      const out = { fin, other, total: fin + other }
      if (cache) cache[key] = out
      return out
    } catch {
      await sleep(1500 * 2 ** attempt)
    }
  }
  return null
}

/**
 * Onko kappaleen nimi selvästi suomenkielinen?
 *
 * Käytetään VAIN myönteisenä todisteena. Ääkkönen tai suomen taivutuspääte on
 * vahva merkki; niiden puuttuminen ei ole merkki mistään.
 */
export function titleIsClearlyFinnish(title) {
  const t = String(title || '').toLowerCase()
  if (!t.trim()) return false
  if (/[äö]/.test(t)) return true
  // Suomen taivutus- ja johdinpäätteitä, jotka eivät ole englannin sanoja.
  if (/\w{3}(ssa|ssä|sta|stä|lla|llä|lle|ltä|ksi|kin|han|hän|mme|nne|nsa|nsä|ään|iin|ton|tön|inen|uus|yys|maan|mään|isin|ivat)\b/.test(t)) return true
  // Yleisiä suomen sanoja, jotka eivät törmää englantiin.
  if (/\b(mun|sun|mua|sua|meidän|teidän|kaikki|rakkaus|elämä|sydän|vielä|enää|aina|niin|vaan|että|kun|joka|ilman|yksin|kotiin|rakkautta|unelma)\b/.test(t)) return true
  return false
}

/** Viittaako Last.fm-tagi nimenomaan suomenkieliseen tuotantoon? */
export function tagsImplyFinnishLyrics(tags) {
  return (tags || []).some((t) => /suomi\s?rap|suomirap|suomipop|suomirock|suomi\s?pop|suomi\s?rock|iskelm|suomirauta|rautalanka|humppa|suomimetalli/.test(String(t).toLowerCase()))
}

/**
 * Lopullinen päätös: tekeekö artisti suomenkielistä musiikkia?
 *
 * @param mb      mbLanguages()-tulos tai null
 * @param titles  artistin kappaleiden nimet
 * @param tags    Last.fm-tagit
 * @returns { finnish: boolean, reason: string }
 */
export function decideFinnishLyrics({ mb, titles = [], tags = [] }) {
  const clearlyFinnish = titles.filter(titleIsClearlyFinnish).length
  const titleShare = titles.length ? clearlyFinnish / titles.length : 0

  // 1. Vahvin myönteinen todiste: artisti nimeää biisinsä suomeksi.
  if (clearlyFinnish >= 3 || titleShare >= 0.3) {
    return { finnish: true, reason: `suomenkielisiä nimiä ${clearlyFinnish}/${titles.length}` }
  }

  // 2. MusicBrainzin kielimerkintä, kun sitä on riittävästi.
  if (mb && mb.total >= 4) {
    const finShare = mb.fin / mb.total
    if (finShare >= 0.4) return { finnish: true, reason: `MusicBrainz fin ${mb.fin}/${mb.total}` }
    return { finnish: false, reason: `MusicBrainz muu kieli ${mb.other}/${mb.total}` }
  }

  // 3. Tagi joka viittaa suomenkieliseen tuotantoon.
  if (tagsImplyFinnishLyrics(tags)) {
    return { finnish: true, reason: 'suomenkieleen viittaava tagi' }
  }

  // Ei todisteita suomenkielisyydestä -> ei oteta mukaan. Peli on
  // suomenkielinen visa, joten epävarmassa tapauksessa jätetään pois.
  return { finnish: false, reason: 'ei todisteita suomenkielisestä tuotannosta' }
}
