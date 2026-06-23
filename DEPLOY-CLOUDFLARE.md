# Add-in auf Cloudflare Pages deployen

Das Excel-Add-in-Bundle wird über **Cloudflare Pages** unter einer eigenen Domain
ausgeliefert (Beispiel: `https://app.gordon.de` – durch deine ersetzen). Der Proxy
wird **separat** gehostet (siehe `HOSTING.md`).

> Die Build-Variable **`ADDIN_BASE_URL`** steuert, welche Domain in `manifest.xml`
> und alle Asset-URLs geschrieben wird. Ohne sie nutzt der Build `localhost:3000`
> (lokale Entwicklung).

## Einmalig vorbereiten

1. **Domain zu Cloudflare hinzufügen** (Nameserver auf Cloudflare umstellen) –
   z. B. `gordon.de`.
2. **Neue App-GUID fürs Manifest** erzeugen (die aktuelle ist eine Dev-ID) und in
   `addin/manifest.xml` das `<Id>…</Id>` ersetzen:
   ```bash
   uuidgen   # erzeugt z. B. 3f2b1a9c-...
   ```
3. **Wrangler anmelden** (öffnet den Browser, einmalig):
   ```bash
   cd addin && npx wrangler login
   ```

## Erster Deploy (Direkt-Upload via wrangler)

```bash
cd addin
ADDIN_BASE_URL=https://app.gordon.de npm run build:prod
npx wrangler pages deploy dist        # legt beim ersten Mal das Projekt "gordon" an
```

Danach im Cloudflare-Dashboard unter **Pages → gordon → Custom domains** die Domain
`app.gordon.de` verbinden (Cloudflare legt den DNS-Eintrag und das HTTPS-Zertifikat
automatisch an).

Tipp: `npm run deploy` macht Build **und** Upload in einem Schritt:
```bash
ADDIN_BASE_URL=https://app.gordon.de npm run deploy
```

## Dauerbetrieb (Git-verbunden, Auto-Build)

> ⚠️ **Wichtig: ein „Pages"-Projekt anlegen, KEIN „Workers"-Projekt.** Cloudflare
> steuert beim Repo-Import gern in den Workers-Flow (`npx wrangler deploy`) – der
> baut das Add-in **nicht** und scheitert mit „Could not detect a directory
> containing static files". Dieses Projekt ist eine reine statische Seite → Pages.

1. Cloudflare-Dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   (ausdrücklich den **Pages**-Tab wählen).
2. Build-Einstellungen:
   - **Framework preset:** None
   - **Root directory:** `addin`  ← entscheidend, sonst findet Cloudflare keine
     `package.json`, installiert nichts und baut nicht
   - **Build command:** `npm run build:prod`
   - **Build output directory:** `dist`
   - **Environment variable:** `ADDIN_BASE_URL = https://app.gordon.de`
   - **Production branch:** `main`
3. Ab jetzt baut & deployt Cloudflare bei jedem Push automatisch (inkl. Preview-URLs
   pro Branch und Rollbacks).

### Wenn schon ein fehlgeschlagenes Projekt existiert
Falls bereits ein Projekt `npx wrangler deploy` ausgeführt hat (Workers-Flow):
**dieses Projekt löschen** und nach obiger Anleitung als **Pages**-Projekt neu
anlegen. Es gibt bewusst **keine `wrangler.toml`** im Repo – nur Dashboard-Settings.

## Add-in an die Kunden verteilen

Das produktive **`dist/manifest.xml`** (zeigt auf die Cloudflare-Domain) im
**Microsoft-365-Admin-Center → Integrierte Apps** hochladen und den Kunden-Tenants
zuweisen (privates/Enterprise-Deployment, kein AppSource-Review).

## Wichtig nach dem Deploy

- **Proxy-CORS:** In jeder Proxy-Instanz `ALLOWED_ORIGIN=https://app.gordon.de`
  setzen, sonst blockiert der Browser die Datenanfragen.
- **Cache:** `_headers` sorgt dafür, dass HTML/Manifest nie gecacht werden und die
  gehashten JS-Dateien dauerhaft – Updates kommen so zuverlässig im Office-WebView an.

## Verifikation

```bash
# nach dem Deploy
curl -sI https://app.gordon.de/taskpane.html | grep -i cache-control   # -> no-cache
curl -sI https://app.gordon.de/taskpane.<hash>.js | grep -i cache-control  # -> immutable
npx office-addin-manifest validate addin/dist/manifest.xml             # -> valid
```
