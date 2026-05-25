# Timebok

Moderne, profesjonell PWA-timeliste for registrering av arbeidstimer, reisegodtgjørelse og kvitteringer.

Bygget med ren HTML/CSS/JavaScript (ingen rammeverk) – fungerer rett ut av boksen i nettleseren, kan installeres som app i Chrome, og kan kobles til Firebase når du er klar.

---

## Komme i gang

### 1. Kjør lokalt (uten Firebase)

**Bare dobbeltklikk `index.html`** – appen åpnes i nettleseren og fungerer rett ut av boksen. All data lagres i nettleserens `localStorage`.

Logg inn med hvilken som helst e-post og passord. E-posten `kulasic.igor@gmail.com` får admin-rolle automatisk (endre i `firebase-config.js`).

> Service worker (offline-cache) er deaktivert i `file://`-modus. PDF- og Excel-eksport laster bibliotek fra CDN ved første bruk, så de krever nett første gang.

Hvis du vil ha en lokal webserver (kreves bare for Firebase eller service worker):
```bash
python3 -m http.server 8000
# eller: npx serve .
```

### 2. Koble til Firebase

1. Opprett et prosjekt på [Firebase Console](https://console.firebase.google.com)
2. Aktiver **Authentication → Sign-in method → Email/Password**
3. Aktiver **Firestore Database** (start i produksjonsmodus, sett regler senere)
4. Aktiver **Storage** (for kvitteringsvedlegg)
5. Hent web-konfigurasjonen fra **Project settings → Your apps → Web**
6. Lim inn verdiene i `firebase-config.js` og sett `ENABLED = true`

Første gang admin-e-posten logger inn opprettes brukerkontoen automatisk med admin-rolle.

#### Forslag til Firestore-regler

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return request.auth.uid == uid; }
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /users/{userId} {
      allow read: if isSignedIn() && (isOwner(userId) || isAdmin());
      allow write: if isSignedIn() && (isOwner(userId) || isAdmin());

      match /registrations/{regId} {
        allow read, write: if isSignedIn() && (isOwner(userId) || isAdmin());
      }
    }

    match /global/{doc} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && isAdmin();
    }
  }
}
```

#### Forslag til Storage-regler

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /receipts/{userId}/{file=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3. Hosting på GitHub Pages

1. Push hele prosjektmappen til et GitHub-repo
2. I repo-innstillingene: **Pages → Source → main / root**
3. Vent ~1 minutt – appen er nå tilgjengelig på `https://<bruker>.github.io/<repo>/`

---

## Bruk

### Vanlig bruker
- **Uke** – Se og redigere ukens registreringer. Bytt uke med pilene eller "Denne uken".
- **Dagsregistrering** – Trykk `+` for å legge inn timer for en dag. Du kan registrere flere prosjekter samme dag.
- **Periode** – Velg fritt datointervall (f.eks. lønnsperiode) og eksporter til PDF eller Excel.
- **Profil** – Endre navn og bedriftsstil (Firesafe / Damsgård).

### Admin (kun e-posten satt i `firebase-config.js`)
- **Admin → Prosjekter** – Legg til/endre/slett prosjekter
- **Admin → Satser** – Sett km-godtgjørelse
- **Admin → Reisegodtgjørelse** – Sett satser for firmabil/privatbil per avstandssone
- **Admin → Faste kode-satser** – Sett satser for Bastillegg, Smusstillegg osv.
- **Profil → Timesats** – Sett egen timesats (kun admin kan endre)

---

## Filstruktur

```
.
├── index.html              # App-skall
├── manifest.json           # PWA-manifest
├── sw.js                   # Service worker (offline)
├── firebase-config.js      # Firebase-credentials + ADMIN_EMAIL
├── css/styles.css          # Designsystem
├── js/
│   ├── app.js              # Bootstrap, router-wiring
│   ├── router.js           # Hash-router
│   ├── i18n.js             # Norsk/engelsk
│   ├── state.js            # Sesjonstilstand
│   ├── data.js             # Firebase + localStorage-fallback
│   ├── codes.js            # Tilleggskode-katalog (A/B/C/D)
│   ├── calc.js             # Lønn- og reiseberegning
│   ├── export-pdf.js       # PDF-eksport (jsPDF)
│   ├── export-excel.js     # Excel-eksport (SheetJS)
│   ├── utils/
│   │   ├── date.js         # ISO-uke + datohjelpere
│   │   └── dom.js          # el(), modal, toast
│   └── views/
│       ├── login.js
│       ├── week.js
│       ├── day.js
│       ├── period.js
│       ├── admin.js
│       └── profile.js
└── assets/icons/icon.svg
```

---

## Reisegodtgjørelse – beregningsregler

Begge stiler bruker tabellsatsene under `Admin → Reisegodtgjørelse`. Stilen settes per bruker i `Profil → Bedriftsstil`.

### Firesafe-stil
- **1 prosjekt på dagen:** høyeste reiselinje × 1
- **Flere prosjekter:** første og siste linje (kronologisk etter starttid) × 0,5 hver, midtre ignoreres
- Km-godtgjørelse legges til som vanlig (per km)

### Damsgård-stil
- **Uansett antall prosjekter:** høyeste reiselinje × 1

---

## Åpne avklaringer (fra CLAUDE.md)

- **Excel-eksportformat** – Eksakt layout/kolonner til arbeidsgivers behov må avklares. Nåværende eksport har tre ark (Dager, Koder, Info).
- **Tilleggskode-kategorisering** – Type A/B/C/D er satt etter beste skjønn i `js/codes.js`. Kan finjusteres når kodelisten er bekreftet.
- **Sortering av reiselinjer (Firesafe)** – Bruker starttidspunkt for «første» og «siste». Hvis listeposisjon er ønsket istedet, endres `sortKey` i `js/calc.js → calcDayTravel()`.

---

## Lisens

Privat prosjekt – alle rettigheter forbeholdt.
