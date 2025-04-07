# TGD Visualizer SPA

Tämä on yhden sivun verkkosovellus (SPA), joka visualisoi Topologisen Geometrodynamiikan (TGD) keskeisiä käsitteitä interaktiivisten 3D-mallien avulla käyttäen Reactia, TypeScriptiä, Viteä ja Three.js:ää.

## Projektin Rakenne

```
tgd-visualizer/
├── public/              # Staattiset tiedostot
├── src/                 # Lähdekoodi
│   ├── assets/          # Kuvat, fontit yms.
│   ├── components/      # Uudelleenkäytettävät komponentit (Layout, UI)
│   ├── contexts/        # React Contextit (tilan hallintaan)
│   ├── hooks/           # Custom Hookit
│   ├── modules/         # Sovelluksen päämoduulit (TGD-käsitteet)
│   ├── services/        # API-kutsut (jos tarpeen)
│   ├── styles/          # Globaalit tyylit
│   ├── types/           # TypeScript-tyypit
│   ├── utils/           # Aputyökalut
│   ├── App.tsx          # Pääsovelluskomponentti (reititys)
│   └── main.tsx         # Sovelluksen käynnistyspiste
├── .gitignore           # Gitille ohitettavat tiedostot
├── index.html           # Pää HTML-sivu
├── LICENSE              # Lisenssi (lisää oma lisenssi, esim. MIT)
├── package.json         # Projektin metadata ja riippuvuudet
├── README.md            # Tämä tiedosto
├── setup.sh             # Tämä asennusskripti
├── tsconfig.json        # TypeScript-konfiguraatio
├── tsconfig.node.json   # TypeScript-konfiguraatio Node-ympäristöön (Vite)
└── vite.config.ts       # Vite-konfiguraatio
```

## Asennus

1.  Varmista, että sinulla on [Node.js](https://nodejs.org/) (joka sisältää npm) asennettuna.
2.  Kloonaa tämä repository (jos se on jo olemassa) TAI aja `setup.sh`-skripti luodaksesi projektin tyhjästä.
    *   Jos ajat skriptin: `./setup.sh` (varmista, että sillä on ajo-oikeudet: `chmod +x setup.sh`)
3.  Siirry projektihakemistoon: `cd tgd-visualizer`
4.  Asenna riippuvuudet (jos et ajanut skriptiä tai haluat varmistaa): `npm install`

## Käynnistäminen Kehitystilassa

Käynnistä kehityspalvelin:
```bash
npm run dev
```
Sovellus aukeaa oletuksena osoitteeseen `http://localhost:3000`.

## Rakentaminen Tuotantoversiota Varten

Luo optimoitu tuotantoversio `dist/`-hakemistoon:
```bash
npm run build
```

## Esikatselu Tuotantoversiosta

Voit esikatsella luotua tuotantoversiota paikallisesti:
```bash
npm run preview
```

## Seuraavat Askeleet

*   Toteuta varsinaiset 3D-visualisoinnit Three.js:llä kunkin moduulin sisällä.
*   Lisää interaktiiviset kontrollit (esim. `dat.gui` tai oma UI).
*   Hienosäädä UI/UX ja tyylit.
*   Toteuta tilan hallinta tarvittaessa (esim. Zustand tai React Context).
*   Optimoi suorituskykyä.
*   Lisää selittävät tekstit ja mahdolliset ääniselostukset.
