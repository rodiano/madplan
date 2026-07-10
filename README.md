# Madplan

Et simpelt forslag til en ugeplan i React, Vite og TypeScript.

## Funktioner

- Visning af én uge ad gangen fra mandag til søndag
- Navigation til forrige og næste uge
- Hvert dagsfelt er låst som standard
- Felter kan åbnes og ændres via dropdown
- Retter hentes fra Supabase (med fallback til lokal JSON)

## Data

Retterne ligger i [src/data/dishes.json](src/data/dishes.json).

## Supabase setup (gratis)

1. Opret et projekt i Supabase.
2. Kør SQL i [supabase/setup.sql](supabase/setup.sql) i Supabase SQL Editor.
3. SQL-filen opretter tabellen, tænder RLS og opretter kun de policies appen skal bruge:
   - `select` for `anon`/`authenticated`
   - `insert` for `anon`/`authenticated`
4. Kopiér [.env.example](.env.example) til `.env` og sæt:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

5. Ved deploy på GitHub Pages: sæt samme værdier som repository secrets:
	 - `VITE_SUPABASE_URL`
	 - `VITE_SUPABASE_ANON_KEY`

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
