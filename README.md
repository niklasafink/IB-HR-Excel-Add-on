# OpenRegister Excel Add-in

Excel-Add-in, mit dem man in einem Tabellenblatt **Firmennamen markiert** und über
einen eigenen Ribbon-Reiter „OpenRegister" strukturierte Firmendaten (Bilanz,
GuV, Kennzahlen, Stammdaten) aus der [OpenRegister](https://openregister.de)-API
(Handelsregister/Bundesanzeiger) in ein **neues Tabellenblatt** lädt.

Der API-Key liegt **ausschließlich serverseitig** in einem schlanken Proxy – das
Add-in-Bundle enthält ihn nie.

```
addin/   Office.js Excel Add-in (TypeScript, webpack)
proxy/   Backend-Proxy (Node/Express) – hält OPENREGISTER_API_KEY
```

## Architektur & Datenfluss

```
Excel Add-in ──HTTPS /api/…──▶ Backend-Proxy ──Bearer Key──▶ OpenRegister API (v1)
 (kein Key)   ◀──── JSON ─────  (hält den Key)  ◀──── JSON ───
```

- Add-in liest die markierten Firmennamen, ruft den Proxy, schreibt ein neues Blatt.
- Proxy injiziert den `Authorization: Bearer`-Header, cached pro `company_id`
  (spart Credits) und normalisiert Fehler/Rate-Limits.

## Voraussetzungen

- Node.js ≥ 18 (globales `fetch` im Proxy)
- Microsoft Excel (Desktop Mac/Windows oder Web)
- Ein OpenRegister-API-Key ([Dashboard](https://openregister.de))

## 1 · Proxy starten

```bash
cd proxy
npm install
cp .env.example .env          # OPENREGISTER_API_KEY eintragen
npm run dev                    # startet über HTTPS auf https://localhost:3001
```

Beim ersten Start ggf. die Dev-Zertifikate installieren, damit das Add-in
(HTTPS) den Proxy erreicht:

```bash
npx office-addin-dev-certs install
```

Health-Check: <https://localhost:3001/api/health> → `{ "ok": true }`

## 2 · Add-in starten & sideloaden

```bash
cd addin
npm install
npm run dev-certs              # einmalig: HTTPS-Dev-Zertifikate
npm run start                  # webpack-dev-server auf https://localhost:3000
```

In einem zweiten Terminal sideloaden (öffnet Excel mit geladenem Add-in):

```bash
npm run sideload               # office-addin-debugging start manifest.xml
```

Alternativ das Add-in manuell sideloaden (Excel → Add-ins → Eigene Add-ins →
Manifest hochladen → `addin/manifest.xml`).

## 3 · Benutzung

1. In Excel Zellen mit **Firmennamen** markieren (eine pro Zelle).
2. Reiter **OpenRegister** → **Daten laden** → Task-Pane öffnet sich.
3. Datenblöcke (Aktiva/Passiva/GuV/Kennzahlen/Stammdaten) und Geschäftsjahre wählen.
4. **Laden** → es entsteht ein neues Blatt „OpenRegister-Daten":
   - 1. Spalte = hierarchische Positionsnamen (eingerückt),
   - je Unternehmen × Jahr eine Wertspalte (Firmen über ihre Jahre gemerged).

## Layout (Beispiel)

```
| Position                | Firma A 2024 | Firma A 2023 | Firma B 2024 | ...
| BILANZ – AKTIVA         |              |              |              |
|   A. Anlagevermögen     |   1.234.567  |   1.100.000  |     ...      |
|     I. Immaterielle …   |      ...     |     ...      |     ...      |
| GEWINN- UND VERLUST…    |              |              |              |
|   Umsatzerlöse          |      ...     |     ...      |     ...      |
| STAMMDATEN              |              |              |              |
```

## Verwendete OpenRegister-Endpunkte (v1)

| Zweck        | Endpoint                                   | Credits |
|--------------|--------------------------------------------|---------|
| Name → ID    | `GET /v1/autocomplete/company?query=`      | 1       |
| Finanzdaten  | `GET /v1/company/{id}/financials`          | 10      |
| Stammdaten   | `GET /v1/company/{id}`                      | 10      |

Free-Tier ≈ 50 Requests/Monat → der Proxy cached pro `company_id`
(`CACHE_TTL_SECONDS`), um Wiederholläufe nicht erneut zu berechnen.

## Chancen & Risiken

Lagebericht-Inhalte (Chancen & Risiken) sind **nicht** über die OpenRegister-API
verfügbar. Die UI zeigt die Option deaktiviert mit Hinweis; im Code ist
`buildKennzahlen`/der Sektions-Aufbau in [addin/src/lib/mapping.ts](addin/src/lib/mapping.ts)
so gekapselt, dass eine spätere Quelle ohne Umbau andocken kann.

## Sicherheit / Secrets

- `OPENREGISTER_API_KEY` lebt nur in `proxy/.env` (in `.gitignore`).
- **Niemals** im Add-in-Code oder Bundle. Im Production-Build (`addin/dist/`)
  kommt der Key nicht vor.
- **Wurde ein Live-Key je im Klartext geteilt, gilt er als kompromittiert →
  im OpenRegister-Dashboard rotieren.**

## Deployment

- **Proxy:** als Serverless Function (Vercel/Netlify/Azure Functions) deploybar.
  `OPENREGISTER_API_KEY` und `ALLOWED_ORIGIN` als Umgebungsvariablen setzen.
- **Add-in:** `npm run build` (`addin/dist/`) auf ein HTTPS-Hosting; im
  `manifest.xml` die `https://localhost:3000`-URLs auf die Produktions-URL
  umstellen, und `PROXY_BASE_URL` beim Build auf die Proxy-URL setzen:
  ```bash
  PROXY_BASE_URL="https://<proxy-host>/api" npm run build
  ```

## Skripte

| Ort     | Befehl              | Wirkung                                  |
|---------|---------------------|------------------------------------------|
| proxy   | `npm run dev`       | Proxy mit Auto-Reload (HTTPS)            |
| proxy   | `npm run build`     | TypeScript → `dist/`                     |
| addin   | `npm run start`     | Dev-Server (HTTPS) auf :3000             |
| addin   | `npm run build`     | Production-Bundle → `dist/`              |
| addin   | `npm run typecheck` | TypeScript prüfen                        |
| addin   | `npm run validate`  | Manifest validieren                      |
| addin   | `npm run sideload`  | In Excel laden                           |
