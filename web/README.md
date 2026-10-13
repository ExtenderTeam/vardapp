# VárdApp – webes kliens

Statikus frontend ugyanarra az API-ra, mint a mobil app.

## Funkciók

- Kisvárda + Szabolcs (SZON) hírek
- Naptár + magyar névnapok
- Regisztráció / belépés + szinkron jegyzetek
- API URL mentése (localStorage)

## Helyi indítás

1. Indítsd az API-t (`server/`):
   ```bash
   cd server && npm install && npm run dev
   ```
2. Szolgáld ki a `web/` mappát, pl.:
   ```bash
   npx --yes serve web -p 8080
   ```
   vagy egyszerűen nyisd meg az `index.html`-t (CORS miatt jobb a helyi szerver).

3. Böngésző: http://localhost:8080  
   **Egyéb** fül → API URL: `http://localhost:3000`

## Render / Netlify

- **Publish directory:** `web`
- Az API külön Web Service (Render `server/`)
- Első megnyitáskor az **Egyéb** fülön add meg a Render API URL-t  
  (pl. `https://vardapp-api.onrender.com`)

A böngésző elmenti az API címet.

## Fájlok

| Fájl | Szerep |
|------|--------|
| `index.html` | UI |
| `styles.css` | Stílus |
| `app.js` | Logika |
| `nevnapok.json` | Névnap adatbázis |
