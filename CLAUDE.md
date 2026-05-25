# CLAUDE.md – Timeliste-app

## Prosjektoversikt

**Appnavn: Timebok**

En moderne, profesjonell timeliste-nettside for registrering av arbeidstimer, reisegodtgjørelse og kvitteringer. Bygget som en PWA (Progressive Web App) med støtte for norsk og engelsk.

---

## Tech-stack og miljø

- Ren HTML/CSS/JavaScript (ingen rammeverk med mindre vi avtaler noe annet)
- PWA-støtte: `manifest.json` + service worker for Chrome-installasjon
- Responsiv design optimalisert for mobil, nettbrett og PC
- Språkstøtte: Norsk (standard) og Engelsk (valgbar)
- Backend: Firebase (autentisering + database)
- Hosting: GitHub Pages (statisk site)

---

## Brukerroller

### Admin (kun én – eieren av appen)
- Administrerer prosjektlisten (legge til, redigere, fjerne)
- Setter og oppdaterer alle globale satser:
  - Km-godtgjørelse (kr per km)
  - Reisegodtgjørelsestabellen (avstandssatser)
  - Faste tilleggskode-satser (f.eks. Bastillegg = kr 10,00)
- Kan i fremtiden invitere andre brukere

### Vanlig bruker
- Kan ikke redigere globale satser eller prosjektlisten
- Har sin egen profil med fast timesats (settes ved opprettelse av admin)
- Ser og redigerer kun sine egne registreringer

> Appen er i første omgang kun for én bruker (admin), men arkitekturen skal støtte flere brukere fra starten.

---

## Kjernefunksjonalitet

### Prosjektvalg
- Prosjektnavn velges fra en admin-administrert liste (ikke fritekst)
- **Årsak:** Prosjekter er knyttet til reisegodtgjørelsessatser og tilleggskoder
- Det kan registreres **flere prosjekter på samme dag**

### Timeregistrering per dag
Hvert dagsskort registrerer:
- Dato, ukedag, ukenummer, år (autofylles)
- Startklokkeslett og sluttklokkeslett
- Lunsjpause: ubetalt (ja/nei) + varighet i minutter

### Tilleggskoder
Brukeren velger én eller flere fra listen. Kodene er delt i fire typer:

**Type A – Automatisk kalkulert (basert på brukerens timesats):**
- Overtid 50%, Overtid 50% (Org.) → timesats × 1,5
- Overtid 100%, Overtid 100% (Org.) → timesats × 2
- Reisetid
- Andre koder identifiseres underveis

**Type B – Fast sats satt av admin:**
- Km-godtgjørelse: bruker oppgir antall km → system beregner `km × sats`
- Oppm. tillegg: bruker velger transporttype (Firmabil / Privat bil) + avstandssone → system slår opp sats automatisk

**Type C – Variabelt beløp (brukeren skriver inn per registrering):**
- Reiseutgifter/bompasseringer
- Restakkord beløp
- Andre koder der beløpet varierer fra gang til gang

**Type D – Kun markering (ingen beløp):**
- Ferie, Sykemelding, Egenmelding, Barns sykdom, Permisjon uten lønn,
  Offentlig fridag, og lignende koder kun for oversiktens skyld

> Full kategorisering av alle koder avklares underveis i utviklingen.

**Komplett kodeliste:**
```
Akkordtimer, Barns sykdom, Bastillegg, Egenmelding, Ferie,
Fri ihht arb.avtale, Km-godtgjørelse, Kurs/oppl./møte,
Offentlig fridag, Opplæringstillegg K&S Variabel,
Oppm. tillegg FS bil 15-30, Oppm. tillegg FS bil 30-45,
Oppm. tillegg FS bil 45-60, Oppm. tillegg FS bil 60-75,
Oppm. tillegg FS bil 7,5-15, Oppm. tillegg privat bil 15-30,
Oppm. tillegg privat bil 30-45, Oppm. tillegg privat bil 45-60,
Oppm. tillegg privat bil 60-75, Oppm. tillegg privat bil 7,5-15,
Ordinære timer (BTB), Overtid 100%, Overtid 100% (Org.),
Overtid 50%, Overtid 50% (Org.), Overtidsmat<12 T, Overtidsmat>12 T,
Passasjertillegg, Permisjon lønnet (Org.), Permisjon lønnet (Uorg.),
Permisjon uten lønn, Reisetid, Reiseutgifter/bompasseringer,
Restakkord beløp, Smusstillegg 1 – ElogIT, Sykemelding,
Tarifftillegg - prosjekt A121, Tilhengertillegg,
Timer Tillitsvalgt/Verneombud, Utenbystillegg fagarb.ElogIT,
Utenbystillegg u/fagbrev ElogIT, Vedlikehold ikke prosjekt
```

---

## Reisegodtgjørelse

Satsene administreres av admin og kan oppdateres via admin-panelet.

### Beregningslogikk

Brukerprofilen er knyttet til én bedriftsstil som bestemmer hvordan reisegodtgjørelse beregnes. To stiler støttes:

---

#### Firesafe-stil

Reisegodtgjørelse representerer reisen **til og fra jobb**. Reise mellom prosjekter er jobbtid og teller ikke.

**1 prosjekt på dagen:** full sats (× 1)
- Firmabil 15–30 km → 118,40 × 1 = **118,40 kr**

**Flere prosjekter på dagen:** første og siste linje × 0,5 – alt imellom ignoreres
- Firmabil 7,5–15 km + 45–60 km + 15–30 km
  - Første: 70,70 × 0,5 = 35,35 kr
  - Midtre: ignoreres
  - Siste: 118,40 × 0,5 = 59,20 kr
  - **Total: 94,55 kr**

> Hva som definerer "første" og "siste" (listeposisjon eller klokkeslett) avklares når design for dagsregistrering er bestemt.

---

#### Damsgård-stil

Uansett antall prosjekter på dagen gjelder kun **den høyeste reiselinjen**, full sats (× 1).

**1 prosjekt på dagen:**
- Firmabil 15–30 km → 118,40 × 1 = **118,40 kr**

**Flere prosjekter på dagen:**
- Firmabil 7,5–15 km + 45–60 km + 15–30 km
  - Høyeste: 165,20 × 1 = **165,20 kr**

Brukeren velger **transporttype** og **avstandssone** separat. Systemet slår opp riktig sats automatisk.

**Transporttype:** Firmabil / Privat bil

| Avstand     | Firmabil   | Privat bil |
|-------------|------------|------------|
| 7,5 – 15 km | kr 70,70   | kr 114,60  |
| 15 – 30 km  | kr 118,40  | kr 189,90  |
| 30 – 45 km  | kr 141,50  | kr 223,20  |
| 45 – 60 km  | kr 165,20  | kr 255,70  |
| 60 – 75 km  | kr 189,70  | kr 290,40  |

---

## Kvitteringer

Per dag kan det legges til én eller flere kvitteringer:
- Beløp (kr)
- Beskrivelse
- Vedlegg (bilde/fil) – lastes opp til Firebase Storage

---

## Navigasjon og visning

### Ukevisning
- Standard visning er én uke om gangen
- Pil frem/tilbake for å bytte uke
- Hurtigvalg: "Denne uken"

### Ukesoppsummering
Vises nederst i ukevisningen:
- Totale timer fordelt på type
- Total reisegodtgjørelse (kr)
- Total kvitteringssum (kr)

### Periodevisning / Lønnsperioderapport
- Brukeren velger valgfri datoperiode (f.eks. 26.01.2026 – 25.02.2026)
- Formål: kontrollere egne registreringer mot lønnsslippen
- Viser fullstendig oversikt: timer, reise, kvitteringer, totalsummer

---

## Eksport

| Format | Bruksområde |
|--------|-------------|
| **PDF** | Fullstendig periodevisning / lønnskontroll for bruker |
| **Excel (.xlsx)** | Timeliste i format tilpasset arbeidsgivers behov |

> Eksakt utforming av Excel-filen avtales på et senere tidspunkt.

---

## Firebase-arkitektur

- **Authentication:** E-post/passord
- **Firestore:** Brukerdata, timeregistreringer, prosjektliste, globale satser
- **Storage:** Kvitteringsvedlegg

Datastruktur (grov skisse):
```
/users/{userId}/
  profile: { name, email, timesats, role, companyStyle }  // companyStyle: "firesafe" | "damsgard"
  registrations/{registrationId}: { date, project, hours, codes, receipts, ... }

/global/
  projects: [ { id, name } ]
  rates: {
    kmRate,
    travelRates: { privatBil: {...}, firmaBil: {...} },
    fixedCodes: { bastillegg: 10.00, ... }
  }
```

---

## Design

### Generelt uttrykk
- Moderne, profesjonelt og gjennomført design – ikke generisk
- Konsistent fargepalett, typografi og spacing gjennom hele appen
- Lyst tema (light mode) – ren, profesjonell jobbapp-estetikk

### Responsivt design
Appen skal fungere sømløst på alle skjermstørrelser:

| Enhet     | Tilpasning |
|-----------|------------|
| Mobil     | Kompakt layout, store trykkeflater, enkel navigasjon med én hånd |
| Nettbrett | Utvidet layout, flere elementer synlig samtidig |
| PC        | Full bredde, oversiktlig visning av uke/periode |

- Breakpoints følger moderne standarder (≥768px nettbrett, ≥1024px PC)
- Ingen horisontal scrolling på noen skjermstørrelse
- Touch-vennlig: alle knapper og inputfelt minimum 44×44px trykkeflate
- Testeenheter: OnePlus Nord 4 (mobil), standard nettbrett, desktop Chrome

### PWA-krav
- Installerbar via Chrome på Android og desktop
- App-ikon og splash screen
- Fungerer offline eller med dårlig nett (data synkroniseres når tilkobling er tilbake)

---

## Generelle utviklingsregler

- Norsk er standardspråk i UI. Engelsk aktiveres via språkvelger.
- Variabler, funksjoner og kommentarer i kode skrives på **engelsk**
- Spør alltid om avklaring ved usikkerhet – ikke gjett
- Ikke legg til funksjonalitet som ikke er spesifisert uten å spørre først

---

## Åpne avklaringer

- [ ] Excel-eksportformat: eksakt layout/kolonner avklares senere
- [ ] Full kategorisering av tilleggskoder (A/B/C/D) avklares underveis
- [ ] Sortering av reiselinjer (listeposisjon vs. klokkeslett) avklares under design
