# Korvamato

Suomalainen musiikkivisa Songspotin tyyliin: **viisi biisiä helposta mahdottomaan**, ja
ensimmäinen vihje kestää **0,1 sekuntia**. Väärä arvaus tai ohitus avaa pidemmän pätkän.

- Vihjeiden pituudet: 0,1 s → 0,5 s → 2 s → 8 s → 15 s
- Viisi yritystä per biisi
- Pisteet: mitä lyhyemmästä pätkästä tunnistat, sitä enemmän — kerrottuna vaikeustasolla
  (helppo ×1 … mahdoton ×3). Täydellinen kierros on 8 750 pistettä.
- Päivän haaste on kaikille sama ja vaihtuu keskiyöllä; lisäksi rajaton tila
- Rajattomassa tilassa voi rajata **aikakauden** (2020-luku / 2010-luku / klassikot
  1970–2010) ja **genren** (rokki / rappi / pop / iskelmä)
- Tulos jaettavissa ruutugrafiikkana leikepöydälle
- Välilyönti soittaa vihjeen

Kannassa on **3 174 suomalaista biisiä**, jotka haetaan automaattisesti Applen julkisista
rajapinnoista — käsin ylläpidettyä biisilistaa ei ole.

## Käynnistys

```bash
npm install
npm run dev
```

Peli aukeaa osoitteeseen http://localhost:5173

Biisidata on jo haettu tiedostoon `src/data/songs.json`, joten peli toimii heti.

## Julkaisu

```bash
npm run build
```

Syntyy staattinen `dist/`-kansio, jonka voi julkaista sellaisenaan esimerkiksi Vercelissä,
Netlifyssä tai GitHub Pagesissa. Palvelinta ei tarvita.

Huomaa että biisikanta on osa nidottua JS-pakettia: `dist` on n. 1,8 Mt, pakattuna
n. 400 kt. Se on siedettävä mutta ei mitätön ensilataus. Jos kanta kasvaa merkittävästi,
data kannattaa siirtää erilliseen tiedostoon ja hakea ajonaikaisesti.

## Testit

```bash
npm test
```

Ajaa kaksi vaihetta:

- `npm run test:logic` — arvonta, pisteytys, haku, jakoteksti, **aikajanan sijaintilaskenta**
  ja kategoriasuodatus oikealla biisidatalla (108 tarkistusta)
- `npm run test:render` — renderöi sovelluksen Nodessa ja varmistaa muun muassa
  ettei vastaus tai ääninäytteen osoite vuoda sivun lähdekoodiin

## Biisikanta

Kanta rakennetaan komennolla

```bash
npm run songs        # = node scripts/build-library.mjs
```

Putki ei lue valmista biisilistaa vaan **etsii kappaleet itse**:

1. **Artistisiemen.** Ainoa käsin ylläpidetty asia on artistien *nimiä*, ei koskaan
   kappaleita. Nimet tulevat kolmesta lähteestä: `data/songlist.json`:n 141 artistia,
   Applen FI-suosituimmuuslista (haetaan automaattisesti joka ajolla, joten uudet
   suomalaiset artistit tulevat mukaan itsestään), sekä täydennyslistat iskelmälle,
   rapille ja 2020-luvun rokille.
2. **Katalogien laajennus.** Jokaiselle artistille haetaan koko Apple Music -katalogi
   (`lookup?entity=song&limit=200`). Tämä on se monikerroin, joka tekee runsaasta
   200 artistista yli 3 000 kappaletta.
3. **Suodatus.** Pois karsitaan karaoke-, tribuutti-, cover-, instrumentaali-, live-,
   remix- ja demoversiot, introt ja skitit, hittikimarat (monta biisiä yhtenä raitana —
   niitä ei voi arvata), duplikaatit ja kappaleet joilta puuttuu ääninäyte.
4. **Genre.** Rokki, rappi ja pop johdetaan Applen `primaryGenreName`-kentästä.
   Iskelmä ei tule Applelta — katso alla.
5. **Aikakausi** julkaisuvuodesta, samalla säännöllä kuin `src/game/categories.ts`.
6. **Vaikeustaso** pisteytetään datasta, ei käsin: sijoitus Applen FI-suosituimmuus­listalla,
   julkaistiinko kappale singlenä, kuuluiko se alkuperäiseen kuratoituun listaan, ja
   artistin katalogin koko. Pisteet jaetaan kvantiileittain tasoille 1–5.

Hyödyllisiä valitsimia:

```bash
node scripts/build-library.mjs --dry              # raportti, ei kirjoiteta
node scripts/build-library.mjs --limit=20         # vain 20 artistia, nopea kokeilu
node scripts/build-library.mjs --delay=2500       # hitaampi tahti jos tulee kuristusta
node scripts/build-library.mjs --max-per-artist=8 # pienempi kanta
```

Apple kuristaa noin 20 pyyntöä minuutissa. Vastaukset tallentuvat välimuistiin
`data/.itunes-cache.json` (n. 53 Mt, johdettua dataa eikä kuulu versionhallintaan),
joten uusinta-ajo on lähes välitön.

`scripts/fetch-songs.mjs` ja `scripts/repair-songlist.mjs` ovat vanhan, käsin ylläpidetyn
biisilistan työkaluja. Ne on korvattu yllä kuvatulla putkella eikä niitä enää tarvita.

### Rajoitukset joista on syytä tietää

- **Aikakausi ei ole aina oikein.** Apple kertoo *julkaisun* päivämäärän, ei kappaleen
  alkuperäistä levytysvuotta. Kokoelmalevyt tunnistetaan ja niiltä vuosi luetaan
  ensisijaisesti levyn nimen vuosiluku­välistä (”Kaikki levytykset (1972-1992)” → 1972)
  tai jätetään tuntemattomaksi, jolloin kappale menee klassikoihin. Silti yksittäisiä
  uudelleenjulkaisuja luiskahtaa väärälle vuosikymmenelle — esimerkiksi vuoden 1996
  kappale vuoden 2020 kokoelmalta. Tätä ei voi korjata täydellisesti tällä datalähteellä.
- **Iskelmää ei ole Applen genretiedossa.** Tarkistettu sekä artistitason haulla (Jari
  Sillanpää on Applella ”Pop”) että koko genrepuusta (526 alagenreä, ei
  ”Iskelmä”/”Schlager”-solmua; lähin on sekalokero ”Worldwide”, jossa ovat rinnakkain
  mm. Piirpauke, Fredi ja Fintelligens — se ei ole iskelmä). Siksi iskelmä on ainoa genre,
  joka tunnistetaan artistisiemenen kautta. Uusi iskelmäartisti pitää lisätä
  `ISKELMA_SEED`-listaan nimeltä, minkä jälkeen hänen kappaleensa haetaan automaattisesti.
- **Kansainväliset artistit** suodatetaan FI-listalta pienellä kieltolistalla, koska
  Applen rajapinnassa ei ole artistin kansalaisuutta. Vertailu tehdään artistinimen osiin
  pilkottuna, jotta myös yhteistyökokoonpanot (”LE SSERAFIM, ILLIT & KATSEYE”) jäävät pois.

## Miten arvoitus valitaan

`src/game/daily.ts` valitsee päivämäärän perusteella yhden biisin jokaiselta
vaikeustasolta. Kunkin tason biisit käydään läpi kiinteässä kierrossa, jonka askel on
yhteistekijätön poolin koon kanssa, joten koko pooli tulee käytyä läpi ennen kuin mikään
toistuu. Lisäksi:

- sama artisti ei esiinny kahdesti samalla kierroksella
- sama biisi ei tule kahtena peräkkäisenä päivänä

Valinta rakennetaan ketjuna päivästä 1 alkaen, jotta edellisen päivän välttäminen on
itsensä kanssa yhtenevä. Ketju on välimuistissa, joten se lasketaan vain kerran.

Päivän haaste käyttää aina koko kantaa, jotta se on kaikille sama. Aikakausi- ja
genrerajaus vaikuttaa vain rajattomaan tilaan.

## Ääni ja aikajana

`src/game/audio.ts` lataa 30 sekunnin esikuuntelunäytteen, dekoodaa sen Web Audiolla ja
soittaa siitä täsmällisen mittaisen pätkän häivytyksineen — 0,1 sekunnin klippi vaatii
tarkkuutta, johon `<audio>`-elementin ajastin ei yksin riitä. Näytteen alun hiljaisuus
ohitetaan automaattisesti, ettei ensimmäinen vihje osu tyhjään. Seuraava biisi ladataan
taustalla valmiiksi. Jos selain ei osaa dekoodata AAC:tä Web Audiolla, peli putoaa
takaisin tavalliseen `<audio>`-soittoon.

Aikajanan sijainnit lasketaan `src/game/timeline.ts`:ssä **yhdestä ja samasta
sekunti→prosentti-kuvauksesta**, jota sekä sekuntimerkit että soittopää käyttävät — näin
ne eivät voi ajautua eri mieltä keskenään. Kuvaus on logaritminen, koska vihjeet kattavat
0,1 s – 15 s eli 150-kertaisen välin: lineaarisella akselilla kolme ensimmäistä merkkiä
osuisivat kohtiin 0,7 %, 3,3 % ja 13,3 % eli käytännössä päällekkäin. Logaritmisella
akselilla ne asettuvat kohtiin 3,4 % / 14,6 % / 39,6 % / 79,2 % / 100 %.

Soiton edistyminen luetaan suoraan äänimoottorin kellosta (`AudioContext.currentTime`),
ei erillisestä `performance.now()`-ajastimesta, joten animaatio ei voi lähteä ennen ääntä
eikä ajautua siitä erilleen.

## Huomio tekijänoikeuksista

Ääninäytteet ovat Applen julkisen hakurajapinnan 30 sekunnin esikuunteluita, ja peli
soittaa niistä enintään 15 sekuntia. Näytteitä ei tallenneta eikä jaeta edelleen.
Jos julkaiset pelin laajalle yleisölle, tarkista käyttöehdot itse.
