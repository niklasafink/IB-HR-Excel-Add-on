# Hosting – Gordon

Gordon besteht aus zwei Teilen mit unterschiedlichen Anforderungen:

| Teil | Was | Anforderung |
|------|-----|-------------|
| **Add-in-Bundle** | statisches HTML/JS/CSS (`addin/dist`) | nur statisches Hosting, HTTPS Pflicht |
| **Proxy** | Node-Server (hält API-Key, Limits, Cache) | dauerhaft laufender Prozess + kleiner Speicher für `users.json`/`usage.json` |

## Empfehlung (günstig/kostenlos)

### Add-in-Bundle → **Cloudflare Pages** (kostenlos) ✅
- Kostenlos, automatisches HTTPS, eigene Domain, schnelles CDN, unbegrenzter Traffic.
- Deploy: `addin` mit produktiver `PROXY_BASE_URL` bauen (`npm run build`) und
  den `dist`-Ordner zu Cloudflare Pages pushen (oder GitHub-Repo verbinden).
- Gleichwertige kostenlose Alternativen: **GitHub Pages**, **Netlify**, **Vercel**.
- Diese eine HTTPS-URL ist danach die feste Quelle im `manifest.xml` und der
  erlaubte CORS-Origin (`ALLOWED_ORIGIN`) des Proxy.

### Proxy → je nach Modell

Der Proxy braucht einen **dauerhaft laufenden Prozess** und etwas **persistenten
Speicher** (für `users.json`/`usage.json`). Reines „Serverless" (Cloudflare
Workers, Vercel Functions) passt wegen der Dateipersistenz und des
In-Memory-Cache **nicht** ohne Umbau (dann Datenbank nötig).

**A) Kunde hostet selbst (Standardmodell):**
Du lieferst das `Dockerfile`. Der Kunde startet den Container in seiner Infra.
Empfehlung für den Kunden: kleiner VPS oder Container-Dienst.

**B) Du hostest pro Kunde (Managed):**
- **Hetzner Cloud CX22 (~4 €/Monat)** + Docker → bestes Preis-Leistungs-Verhältnis.
  Auf einer VM kannst du via Docker **viele** Single-Tenant-Proxys (ein Container
  pro Kunde, eigener Key/Port) betreiben. TLS via **Caddy** (automatisches
  Let's-Encrypt) davorschalten.
- **Fly.io** – kleine VM mit kostenlosem Kontingent + Volume; eine App pro Kunde.
- **Wirklich kostenlos:** **Oracle Cloud „Always Free"** (Arm-Ampere-VM) – dauerhaft
  gratis, aber Einrichtung aufwändiger.
- **Vermeiden für eine API:** Render Free (schläft ein → Kaltstarts, kein Volume).

**Kurz:** Add-in auf **Cloudflare Pages (gratis)**, Proxy auf **Hetzner-VPS + Docker
+ Caddy** (günstigster zuverlässiger Weg) bzw. **Fly.io/Oracle Always Free**, wenn
es gratis sein muss.

## Proxy per Docker starten

```bash
# Image bauen
docker build -t gordon-proxy ./proxy

# Starten (TLS terminiert der Reverse-Proxy davor; Container läuft intern HTTP)
docker run -d --name gordon-kunde1 \
  -p 3001:3001 \
  -e HANDELSREGISTER_API_KEY=__kunden_key__ \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e ALLOWED_ORIGIN=https://app.deine-domain.de \
  -v gordon_kunde1_data:/data \
  gordon-proxy
```

- `ADMIN_TOKEN` setzen ⇒ **Nutzer-Token-Pflicht + Credit-Limits aktiv**.
- `-v …:/data` ⇒ `users.json`/`usage.json` bleiben über Neustarts erhalten.
- Davor einen Reverse-Proxy (Caddy/nginx/Traefik) mit gültigem TLS-Zertifikat;
  dieser leitet HTTPS extern auf den Container-Port 3001 (HTTP) intern.

## TLS-Hinweis
Im Container ist `office-addin-dev-certs` (nur Dev) **nicht** installiert, daher
läuft der Server intern bewusst über HTTP – die TLS-Terminierung übernimmt die
Plattform bzw. der Reverse-Proxy. Den Proxy **niemals** ohne vorgelagertes HTTPS
öffentlich erreichbar machen.

## Nach dem Deploy
1. `manifest.xml`-URLs auf die Add-in-Domain setzen, neue App-GUID vergeben.
2. Add-in zentral über das **Microsoft-365-Admin-Center** an die Kunden-Tenants
   ausrollen (privat/Enterprise, kein Store-Review).
3. Im Proxy je Nutzer über die **Admin-Oberfläche** `https://<proxy>/admin`
   (Login mit `ADMIN_TOKEN`) Zugänge anlegen und Credit-Limits setzen.
