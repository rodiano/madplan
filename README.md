# Madplan

Et simpelt forslag til en ugeplan i React, Vite og TypeScript.

## Funktioner

- Visning af én uge ad gangen fra mandag til søndag
- Navigation til forrige og næste uge
- Hvert dagsfelt er låst som standard
- Felter kan åbnes og ændres via dropdown
- Retter hentes fra en lokal JSON-fil med `id` og `navn`

## Data

Retterne ligger i [src/data/dishes.json](src/data/dishes.json).

## Kør projektet

```bash
npm install
npm run dev
```

## Byg projektet

```bash
npm run build
```

## Videre idéer

- Gem valg i local storage eller et API
- Tilføj filter for vegetar, fisk eller hurtige retter
- Tilføj printvenlig ugevisning
