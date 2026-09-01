import { Modal } from './Modal'
import { MAX_SCORE, STAGES, STAGE_POINTS, TIERS, formatScore, formatSeconds } from '../game/rules'

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Näin peliä pelataan" onClose={onClose}>
      <p>
        Yksi kierros on <strong>viisi suomalaista biisiä</strong> helpoimmasta mahdottomaan.
        Jokaisesta kuulet ensin vain <strong>0,1 sekuntia</strong> – yhden rummuniskun tai tavun.
      </p>

      <ol>
        <li>Paina soittonappia ja kuuntele pätkä.</li>
        <li>Kirjoita hakukenttään biisin nimi tai artisti ja valitse ehdotuksista.</li>
        <li>Väärä arvaus tai ohitus avaa pidemmän pätkän. Yrityksiä on viisi.</li>
      </ol>

      <p style={{ marginBottom: 4 }}>
        <strong>Vihjeiden pituudet ja pisteet</strong>
      </p>
      <table className="howto-table">
        <thead>
          <tr>
            <th>Vihje</th>
            <th>Pituus</th>
            <th>Peruspisteet</th>
          </tr>
        </thead>
        <tbody>
          {STAGES.map((s, i) => (
            <tr key={s}>
              <td>{i + 1}.</td>
              <td>{formatSeconds(s)}</td>
              <td>{formatScore(STAGE_POINTS[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginBottom: 4, marginTop: 18 }}>
        <strong>Vaikeustason kerroin</strong>
      </p>
      <table className="howto-table">
        <tbody>
          {TIERS.map((t) => (
            <tr key={t.tier}>
              <td style={{ color: t.color, fontWeight: 700 }}>{t.name}</td>
              <td>×{t.mult.toString().replace('.', ',')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 18 }}>
        Täydellinen kierros – kaikki viisi 0,1 sekunnista – on{' '}
        <strong>{formatScore(MAX_SCORE)} pistettä</strong>. Päivän haaste on kaikille sama ja
        vaihtuu keskiyöllä. Rajattomassa tilassa voit pelata niin monta kierrosta kuin haluat.
      </p>

      <p style={{ fontSize: 12.5, opacity: 0.75 }}>
        Ääninäytteet tulevat Applen julkisesta hakurajapinnasta ja ovat 30 sekunnin esikuunteluita.
      </p>
    </Modal>
  )
}
