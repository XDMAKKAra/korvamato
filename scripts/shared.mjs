/** Skriptien yhteiset apufunktiot nimien vertailuun. */

/** Pienet kirjaimet, ei ääkkösiä eikä välimerkkejä. */
export function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pudottaa sulkeissa olevat lisäkkeet: "Biisi (feat. X)" -> "Biisi". */
export function stripParens(s) {
  return (s || '').replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s*-\s*(feat|ft)\..*$/i, ' ').trim()
}

/** Jakaa yhteistyöartistit osiin: "A & B feat. C" -> ["a", "b", "c"]. */
export function artistParts(s) {
  return (s || '')
    .split(/\s*(?:&|\+|,|\/|\bfeat\.?\b|\bft\.?\b|\bx\b|\bja\b|\band\b|\bvs\.?\b|\bwith\b)\s*/i)
    .map((p) => norm(p))
    .filter(Boolean)
}

/**
 * Kelpaako kappaleen nimi arvoitukseksi? Levyjen välisoitot, introt ja skitit
 * eivät kelpaa – niitä ei voi tunnistaa eikä kukaan osaa arvata niitä.
 */
export function isJunkTitle(title) {
  return /^(interlude|intro|introduction|outro|prologue|epilogue|skit|untitled)\b/i.test(
    (title || '').trim(),
  )
}

/**
 * Jakaa yhteistyöartistin nimen ERILLISIKSI, ALKUPERÄISEN KIRJOITUSASUN
 * säilyttäviksi nimiksi: "Jore & Zpoppa" -> ["Jore", "Zpoppa"],
 * "Elastinen feat. Sara Bee" -> ["Elastinen", "Sara Bee"].
 * Käytetään songs.json:n artists[]-kentän rakentamiseen (norm() sopisi
 * vain vertailuun, ei näytettävään nimeen).
 */
export function splitArtistNames(s) {
  return (s || '')
    .split(/\s*(?:&|\+|,|\/|\bfeat\.?\b|\bft\.?\b|\bx\b|\bja\b|\band\b|\bvs\.?\b|\bwith\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Poimii kappaleen nimestä feat-vieraat: "Uskomaton (feat. Sara Bee)" ->
 * ["Sara Bee"]. Tukee sekä sulkeissa että viivan jälkeen olevaa muotoa.
 */
export function extractFeatNames(title) {
  const m = (title || '').match(/[([]?\s*(?:feat\.?|ft\.?|with)\s+([^)\]]+)[)\]]?/i)
  if (!m) return []
  return splitArtistNames(m[1])
}

/**
 * Vastaako löytynyt artisti haettua?
 *
 * Hyväksyy yhteistyökappaleet ("Mikael Gabriel & Isac Elliot" kun haettiin
 * Mikael Gabrielia) mutta hylkää osittaiset nimiosumat, joissa haettu nimi on
 * vain osa toista nimeä ("Circle" ei ole "Inner Circle").
 *
 * @returns 'exact' | 'part' | null
 */
export function artistMatches(want, got) {
  const w = norm(want)
  const g = norm(got)
  if (!w || !g) return null
  if (w === g) return 'exact'

  const wp = artistParts(want)
  const gp = artistParts(got)

  if (gp.includes(w) || wp.includes(g)) return 'part'
  if (wp.some((p) => gp.includes(p))) return 'part'

  return null
}
