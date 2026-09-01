# Opit

Näitä päivitetään aina kun käyttäjä korjaa. Tarkoitus on ettei sama virhe toistu.

## 1. Datan laatu pitää mitata, ei olettaa

**Mitä tapahtui:** Rakensin 3 175 biisin kannan laajentamalla artistien koko
Apple-katalogit ja poimimalla niistä 16 biisiä per artisti. Käyttäjä pelasi
rappi+2020-lukua ja sai tuntemattomia biisejä, osan englanniksi. Tarkistin
skeeman, ääninäytteiden toimivuuden ja duplikaatit — mutta en sitä ainoaa asiaa
jolla oli merkitystä: **onko biisi kuultu.**

**Sääntö:** Kun rakennat sisältökantaa, kysy ensin *mikä mittari erottaa hyvän
rivin huonosta* ja hanki se. Jos lähteessä ei ole suosiomittaria, se on väärä
lähde — älä korvaa sitä välillisillä signaaleilla (singlejulkaisu, katalogin
koko), koska ne eivät mittaa tunnettuutta.

**Miten sovellan:** Ennen kuin ajan hakuputken, poimin 20 riviä ja luen ne kuin
käyttäjä lukisi. Jos en tunnista niitä, putki on väärä.

## 2. Älä täydennä sisältöä omasta muistista

**Mitä tapahtui:** Täydensin ohuita genrejä käsin kirjoitetuilla artistilistoilla.

**Käyttäjän sanat:** *"Älä lisää niit sun tietämyksen mukaa, eti jotai
soittolistoi."*

**Sääntö:** Sisältö haetaan lähteestä. Käsin ylläpidettävä saa olla korkeintaan
*siemen* (artistinimiä, tageja, hakusanoja) — ei koskaan itse sisältö.

## 3. Älä koskaan tallenna kuristusvastausta välimuistiin

**Mitä tapahtui:** Deezer palauttaa kiintiön ylityksestä **HTTP 200** ja rungossa
`{"error":{"code":4}}`. Koodi tulkitsi sen tulokseksi "ei löytynyt" ja tallensi
sen. **8 688 välimuistimerkintää 9 868:sta myrkyttyi**, ja suosiotiedon kattavuus
jäi 25 prosenttiin. Vika oli näkymätön, koska ajo näytti onnistuvan.

**Sääntö:** Erottele *ohimenevä virhe* ja *aito negatiivinen tulos*. Vain
jälkimmäisen saa tallentaa. Tarkista rungon virhekoodi, älä pelkkää HTTP-statusta.
Lisää tahdistin ennen kuin nostat rinnakkaisuutta.

**Tarkistus:** Ajon jälkeen laske välimuistin null-osuus. Jos se on iso, ajo on
rikki riippumatta siitä miltä loki näyttää.

## 4. Tarkista mitä rajapinta oikeasti palauttaa ennen kuin suosittelet sitä

**Mitä tapahtui:** Suosittelin Spotifya parhaana lähteenä ja pyysin käyttäjää
luomaan sovelluksen. Vasta sen jälkeen selvisi että helmikuun 2026 Dev Mode
-muutos poisti `popularity`- ja `genres`-kentät ja esti soittolistojen sisällön —
eli täsmälleen se mitä tarvittiin. Käyttäjän aika meni hukkaan.

**Sääntö:** Testaa rajapinta ennen kuin pyydät käyttäjältä tunnuksia tai
lupaat lopputuloksen. Jos testaaminen vaatii tunnukset, sano se etukäteen
epävarmuutena — älä esitä sitä varmana suosituksena.

## 5. Subagenttien työ on tarkistettava, ei uskottava

**Mitä tapahtui:** Agentit (a) jättivät lopputiedoston kirjoittamatta ja
pysähtyivät odottamaan omaa taustaprosessiaan **kolmesti**, (b) toteuttivat
aikajanan teknisesti oikein mutta käytännössä rikki (lineaarinen akseli, jolla
kolme merkkiä viidestä kasautui päällekkäin), (c) keksivät jakotekstiin
verkko-osoitteen jota käyttäjä ei omista, (d) päästivät K-pop-yhtyeet
suomalaiseen visaan koska kieltolistaa verrattiin koko artistimerkkijonoon.

**Sääntö:** Aja agentin lopputulos itse läpi ennen kuin raportoit sen valmiiksi.
Kirjoita agentille nimenomaisesti: *aja synkronisesti loppuun, varmista tiedosto
kirjoitetuksi*. Ja kerro mihin tiedostoihin se EI saa koskea, jos rinnakkaisia
agentteja on käynnissä.

## 6. "Teknisesti oikein" ei riitä käyttöliittymässä

**Mitä tapahtui:** Kategoriavalitsin toteutettiin kahtena `<select>`-alasveto­
valikkona. Se toimi ja oli saavutettava, mutta käyttäjä sanoi sen näyttävän
*"suoraa jostai 2010 nettisivust"*. Sama koski aikajanaa: lineaarinen akseli oli
matemaattisesti oikein mutta luki kelvottomasti.

**Sääntö:** Kysy aina *miltä tämä näyttää käytössä*, ei vain *toimiiko tämä*.
Alasvetovalikko on väärä valinta kun vaihtoehtoja on alle kymmenen — ne mahtuvat
näkyviin sirunappeina, jolloin valintaa ei tarvitse kaivaa esiin.

## 7. Kysy pyydetyt mittaluvut, älä päätä niitä itse

**Mitä tapahtui:** Asetin tavoitteeksi "vähintään 80 biisiä per lokero" ja
"2 000–3 500 biisiä yhteensä" ilman että käyttäjä oli sanonut määrää. Hän halusi
**satoja per lokero**, ja pop/rap 2010–2020-luvuille useita satoja kumpaankin.

**Sääntö:** Kun tehtävässä on mittaluku jota ei ole annettu, kysy se tai esitä
ehdotus näkyvästi — älä hautaa omaa arvaustasi toteutukseen.
