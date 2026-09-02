# Korvamato — uudistus

## Tavoite
Biisipiste -> **Korvamato**. Songspot-tyylinen yksinkertaisempi UI, aikakausi- ja
genrekategoriat, automaattisesti kasvava biisikanta, korjattu aikajana.

## Tehtävät

### 1. Nimi ja perusta
- [x] Selvitä koodin nykytila
- [x] Varmista että Applen rajapinnat toimivat (RSS-listat, haku, artistikatalogi)
- [x] Nimi Korvamato: package.json, index.html, README, UI

### 2. Datasopimus (jaettu molemmille agenteille)
- [x] `Song` saa kentät `genre` ja `era`
- [x] Olemassa oleva 204 biisin kanta rikastetaan genre+era (iTunes lookup)

### 3. Biisikanta (data-agentti — käynnissä)
- [ ] Automaattinen haku: FI-suosituimmat + genrelistaukset + artistikatalogien laajennus
- [ ] Ei kovakoodattuja biisilistoja — siemeninä vain artistit, kappaleet haetaan
- [ ] Genreluokitus: rokki / rappi / pop / iskelmä (iTunes primaryGenreName)
- [ ] Aikakausiluokitus: 2020-luku / 2010-luku / 1970–2010
- [ ] Vaikeustaso johdetaan datasta (suosio), ei käsin

### 4. UI (valmis)
- [x] Songspot-tyylinen pelinäkymä: yksi kortti, aikajana, iso soittonappi
- [x] Kategorianvalinta: aikakausi + genre
- [x] **Aikajanan korjaus** — lohkot ovat nyt tasalevyisiä vaikka sekunnit eivät ole;
      soittopää ja sekuntimerkit eivät täsmää

### 4b. Omat korjaukseni agentin työhön
- [x] Akseli lineaarinen -> logaritminen: lineaarisella 0,1/0,5/2 s kasautuivat
      päällekkäin (0,7 % / 3,3 % / 13,3 %) ja avattu alue oli 2,5 px siivu
- [x] Poistettu jakotekstistä keksitty osoite korvamato.fi

### 5. Verifiointi
- [ ] `npm run build` läpi
- [ ] `npm test` läpi
- [ ] Aikajanan täsmäys todistettu

---

## Review

**Nimi:** Biisipiste → **Korvamato**. Kuvaa täsmälleen pelin ideaa (pätkä jää soimaan
päähän), lyhyt ja suomalainen. Vaihdettu index.html, App.tsx, share.ts, storage.ts:n
avaimet, daily.ts:n hash-suola, package.json ja README.

**Aikajana — kolme juurisyytä, kaikki korjattu.** Uusi `src/game/timeline.ts` antaa yhden
sekunti→prosentti-kuvauksen jota sekä merkit että soittopää käyttävät, joten ne eivät voi
olla eri mieltä. Soittopään paikka tulee kuluneista sekunneista, ei klipin sisäisestä
osuudesta kerrottuna vääristyneellä akselilla. Kello luetaan `AudioContext.currentTime`:sta
eikä `performance.now()`:sta, joten kuva ei lähde ennen ääntä.

Akseli on **logaritminen**. Agentti toteutti sen lineaarisena, mikä on teknisesti oikein
mutta käytännössä rikki: 0,1/0,5/2 s osuisivat kohtiin 0,7 % / 3,3 % / 13,3 % eli
päällekkäin, ja ensimmäisen vihjeen avattu alue olisi 2,5 px. Logaritmisella akselilla
merkit ovat 3,4 % / 14,6 % / 39,6 % / 79,2 % / 100 %.

**Biisikanta:** 204 → **3 174** biisiä, haettu automaattisesti (`scripts/build-library.mjs`).
Käsin ylläpidetään enää artistien *nimiä*, ei kappaleita. Kaikki 20 kategoriayhdistelmää
tuottavat täyden viiden biisin kierroksen.

## Omat korjaukset agenttien työhön
- Aikajanan akseli lineaarinen → logaritminen (yllä)
- Poistettu jakotekstistä keksitty osoite `korvamato.fi`, jota käyttäjä ei omista
- Kieltolista vertaili koko artistimerkkijonoa täsmähaulla → `LE SSERAFIM, ILLIT &
  KATSEYE` ja `HUGEL, Imael Angel & Ultra Naté` pääsivät suomalaiseen visaan 16 biisillä.
  Nimi pilkotaan nyt osiin ennen vertailua.
- Hittikimarat (”Dirlanda / Kylähäät / Tumma nainen / …” yhtenä raitana, 13 kpl) eivät ole
  arvattavissa → suodatetaan pois
- Kokoelmalevyt kantoivat kokoelman julkaisupäivää, joten Kari Tapion 1970-luvun
  levytykset päätyivät 2010-luvulle → vuosi luetaan levyn nimen vuosiluvusta tai
  jätetään tuntemattomaksi (→ klassikot)
- Data-agentti ei koskaan kirjoittanut `songs.json`-tiedostoa (pysähtyi odottamaan omaa
  taustaprosessiaan) → ajoin putken itse loppuun

## Tiedossa olevat rajoitukset
- **Aikakausi ei ole aina oikein.** Apple kertoo julkaisun, ei alkuperäisen levytyksen
  päivämäärän. Kokoelmat tunnistetaan, mutta yksittäisiä uudelleenjulkaisuja luiskahtaa
  väärälle vuosikymmenelle. Ei korjattavissa täydellisesti tällä datalähteellä.
- **Iskelmä ei tule Applen datasta** (526 alagenreä, ei iskelmä-solmua) vaan
  artistisiemenestä. Uusi iskelmäartisti lisätään nimeltä `ISKELMA_SEED`-listaan.
- `dist` on 1,8 Mt / 400 kt pakattuna, koska biisikanta on nidottu JS-pakettiin.

## Verifiointi
- [x] `npx tsc -b` puhtaasti
- [x] `npm run build` läpi
- [x] `npm test` — 108 logiikkatarkistusta + 14 renderöintitarkistusta, 0 hylättyä
- [x] Aikajana: soittopää osuu merkkiin täsmälleen klipin lopussa jokaisella vihjetasolla
- [x] Skeema: 3 174 uniikkia id:tä, 0 virhettä, 0 duplikaattia, 0 hittikimaraa
- [x] Ääninäytteet: 20/20 satunnaisotoksesta vastasi 200/206
- [x] Kaikki 20 kategoriayhdistelmää tuottavat täyden kierroksen

### 5. Soittonapin ja aikajanan korjaus
- [x] **Soitin ei tunnistanut omaa ääntään.** `stop()` laukaisee edellisen
      lähteen `onended`-tapahtuman, joka saapuu vasta tapahtumasilmukassa —
      siis vasta kun seuraava klippi on jo käynnissä. Edellisen soiton
      lopetuskoodi nollasi `source`/`playingId`/`clipStartCtxTime` uuden klipin
      alta, jolloin Pysäytä ei pysäyttänyt mitään, aikajana jäi nollaan ja
      `extend()` kieltäytyi pidentämästä. Korjaus: juokseva `generation`-numero,
      purku vain jos soitto on yhä uusin.
- [x] **Latausindikaattori jäi päälle lopullisesti.** `handlePlay` poistui
      latauksen jälkeen hiljaa kun sen vuoro oli mitätöity (esim. Ohita
      latauksen aikana) eikä nollannut `loading`ia — nappi jäi pois käytöstä.
      Korjaus: `stopPlayback` nollaa myös latauksen.
- [x] **Aikajana ei näyttänyt etenevän.** Suoralla sekuntimittakaavalla
      0,2 / 0,5 / 2 s osuivat kohtiin 1,3 / 3,3 / 13 % — puolet pelistä janan
      ensimmäisessä kahdeksasosassa. Akseli on nyt paloittain lineaarinen:
      jokainen vihjepituus saa yhtä leveän lohkon (16,7 %), joten jokainen
      toisto vie soittopään täyden lohkon eteenpäin ja kaikki sekuntiluvut
      mahtuvat näkyviin.
- [x] Soitettu osuus omana kerroksenaan: avattu alue himmeänä, tämä toisto
      täytenä, soittopää kärkenä. Soittopää siirrettiin radan ulkopuolelle,
      koska rata leikkaa sisältönsä eikä pää näkynyt janan lopussa.
- [x] **Edistymisrengas pois soittonapin ympäriltä.** Se oli lisätty vain
      korvaamaan liikkumaton aikajana. Kun jana liikkuu, rengas kertoi saman
      asian toiseen kertaan ja näytti irralliselta kehältä.
- [x] Uusi testi `npm run test:audio`: soittimen tilakone valeäänimoottorilla.
      Todisti vian ennen korjausta (4/8 hylättyä) ja vartioi sitä nyt.

## Katselmus
Kolme erillistä vikaa, yksi juurisyy kussakin — ei kiertoteitä. Testit:
127 logiikkatarkistusta, 8 soitintarkistusta, 12 renderöintitarkistusta, 0
hylättyä. `npm run build` menee läpi ilman tyyppivirheitä.

---

# Soittoanimaatio, biisikanta ja hakuvuoto

## Tehty

- [x] **Soittopää pois React-tilasta.** `useClipProgress` (src/game/useClipProgress.ts)
      ajaa rAF-silmukkaa ja kirjoittaa arvot suoraan DOM:iin refin kautta.
      Toisto ei renderöi sovellusta kertaakaan.
- [x] **Aikajana takaisin lineaariseksi.** Paloittainen akseli poistettu:
      sekuntiluvut osoittavat oikeisiin kohtiin ja soittopää liikkuu tasaisella
      nopeudella koko janan matkan.
- [x] **Edistymisrengas soittonapin ympärille.** Kiertää täyden kierroksen
      klipin pituudesta riippumatta, joten 0,2 s näkyy yhtä hyvin kuin 15 s.
- [x] **Kanta 3 908 → 6 770 biisiä** (`scripts/expand-library.mjs`, lokerokatto
      400 → 800). Ei uutta verkkohakua: lisäbiisit ovat samoilta jo
      hyväksytyiltä artisteilta ja ylittävät saman tunnettuuskynnyksen.
- [x] Rappi kokeiltiin poistaa genrenapeista ja palautettiin: kaikki kannan
      genret ovat valittavissa. Suodatin on ainoa tapa välttää genre, koska
      biisit ovat sekoituksessa mukana.
- [x] **Hakuluettelo erilleen pelattavasta kannasta** (`scripts/build-catalog.mjs`,
      31 253 riviä, 4,6× kanta). Ehdotukset lajitellaan aakkosittain, ei
      toistomäärän mukaan — muuten kärki olisi yhä pelkkiä mahdollisia
      vastauksia.
- [x] **Introt, skitit ja versiomerkinnät pois** sekä kannasta että luettelosta.
- [x] **Sama biisi eri välilyönnein yhdistetty** ("Hei Neidit" / "Heineidit").
- [x] **Hakuluettelo omaksi paketikseen** (dynaaminen import): ensilataus
      1,31 MB → 0,89 MB pakattuna.

## Todennus

`npm test` — 128 logiikkatarkistusta, soittimen tilakone ja renderöinti läpi.
Uudet testit: soittopään tasainen nopeus jokaisella vihjepituudella oikealla
soittimella, ja mittaus siitä kuinka suuri osa hakuehdotuksista on oikeasti
pelattavia.

## Auki

- Ohuet lokerot vaativat uuden Last.fm-haun: rokki 2020-luku 45 biisiä,
  iskelmä 2020-luku 120, rokki 2010-luku 239, iskelmä 2010-luku 304. Muut
  yhdeksän lokeroa ovat täydet (800).
