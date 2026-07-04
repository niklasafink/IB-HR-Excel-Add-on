# Proxy auf Hetzner deployen (Schritt für Schritt)

Diese Anleitung deployt den **Gordon-Proxy** auf einem Hetzner-Cloud-Server
(Docker + Caddy als TLS-Reverse-Proxy). Das statische Add-in liegt getrennt auf
Cloudflare Pages (siehe [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md)).

> **DSGVO:** Immer einen **EU-Serverstandort** wählen (z. B. Nürnberg, Falkenstein,
> Helsinki). Nur dann verarbeitet Hetzner ausschließlich in der EU.

Aufbau: `Add-in → Caddy (TLS) → Docker-Container :3001 → handelsregister.ai`

---

## Teil 1 — Erstinstallation (einmalig)

### 1. Server anlegen
- Hetzner Cloud → Server erstellen, **EU-Standort**, Ubuntu 22.04/24.04, Typ z. B. CX22.
- Per SSH einloggen: `ssh root@<server-ip>`

### 2. Docker & Caddy installieren
```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

### 3. DNS setzen
Im DNS (z. B. Cloudflare) einen A-Record `api.gordonsregister.com` → Server-IP.
> **Wichtig für DSGVO:** In Cloudflare die Wolke auf **grau (DNS only)** stellen,
> nicht orange. Sonst liefe der API-Verkehr (mit Personendaten) durch Cloudflare.

### 4. Repo holen
```bash
git clone <repo-url> /opt/gordon
cd /opt/gordon
```

### 5. Secrets vorbereiten
Admin-Token erzeugen und notieren (wird nur einmal angezeigt):
```bash
openssl rand -hex 32     # -> als ADMIN_TOKEN verwenden
```

Wichtigste Umgebungsvariablen:

| Variable | Pflicht | Zweck |
|---|---|---|
| `HANDELSREGISTER_API_KEY` | ✅ | Upstream-Key (serverseitig, nie im Add-in) |
| `ADMIN_TOKEN` | ✅ (für Auth/Limits) | schützt Admin-API; aktiviert Nutzer-Token-Pflicht |
| `ALLOWED_ORIGIN` | ✅ | CORS, z. B. `https://app.gordonsregister.com` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | optional | Login fürs Admin-Panel |
| `CACHE_TTL_SECONDS` | optional | Cache-Dauer (Standard 86400 = 24 h; ggf. `3600`) |
| `PORT` | optional | Standard 3001 |

### 6. Image bauen & Container starten
```bash
docker build -t gordon-proxy ./proxy

docker run -d --name gordon-proxy \
  --restart always \
  -p 127.0.0.1:3001:3001 \
  -e HANDELSREGISTER_API_KEY="__dein_key__" \
  -e ADMIN_TOKEN="__openssl_hex_von_oben__" \
  -e ALLOWED_ORIGIN="https://app.gordonsregister.com" \
  -e ADMIN_USER="admin" \
  -e ADMIN_PASSWORD="__starkes_passwort__" \
  -e CACHE_TTL_SECONDS=3600 \
  -v gordon_data:/data \
  gordon-proxy
```
> `-p 127.0.0.1:3001:3001` bindet den Container nur an localhost — erreichbar
> ist er ausschließlich über Caddy (TLS). Das Volume `gordon_data` hält
> `users.json`, `usage.json`, `tenants.json` dauerhaft.

### 7. Caddy konfigurieren (TLS + Query-Stripping)
```bash
cp /opt/gordon/proxy/Caddyfile.example /etc/caddy/Caddyfile
# Domain in /etc/caddy/Caddyfile anpassen, dann:
systemctl reload caddy
```
Caddy holt automatisch ein Let's-Encrypt-Zertifikat und entfernt Query-Strings
aus den Access-Logs (keine Suchbegriffe/Namen auf der Platte).

### 8. Funktioniert es?
```bash
curl -s https://api.gordonsregister.com/api/health      # -> {"ok":true}
```
Admin-Panel: `https://api.gordonsregister.com/admin` (mit ADMIN_USER/PASSWORD).
Dort Nutzer anlegen → der Zugangs-Token wird **einmalig** angezeigt.

---

## Teil 2 — Update / Redeploy (immer wenn sich der Code ändert)

Das ist der Ablauf, den du künftig am häufigsten brauchst. Das Volume bleibt
erhalten, es gehen **keine** Nutzerdaten verloren.

```bash
cd /opt/gordon
git pull

docker build -t gordon-proxy ./proxy
docker stop gordon-proxy && docker rm gordon-proxy

docker run -d --name gordon-proxy \
  --restart always \
  -p 127.0.0.1:3001:3001 \
  -e HANDELSREGISTER_API_KEY="__dein_key__" \
  -e ADMIN_TOKEN="__dein_admin_token__" \
  -e ALLOWED_ORIGIN="https://app.gordonsregister.com" \
  -e ADMIN_USER="admin" \
  -e ADMIN_PASSWORD="__passwort__" \
  -e CACHE_TTL_SECONDS=3600 \
  -v gordon_data:/data \
  gordon-proxy
```

Nur wenn sich die Caddy-Config geändert hat:
```bash
cp /opt/gordon/proxy/Caddyfile.example /etc/caddy/Caddyfile   # Domain anpassen
systemctl reload caddy
```

> **Tipp:** Statt die langen `-e`-Flags jedes Mal zu tippen, kannst du sie in eine
> geschützte Datei `/opt/gordon/proxy.env` legen (chmod 600) und mit
> `--env-file /opt/gordon/proxy.env` starten.

---

## Teil 3 — Verifikation (Datenschutz)

```bash
# Kein Klartext-Token mehr in users.json (nur Hash):
docker exec gordon-proxy grep -o '"token"' /data/users.json || echo "OK: kein Klartext-Token"

# Keine Query-Strings/Namen in den Caddy-Logs:
grep '?' /var/log/caddy/gordon-api.log && echo "PROBLEM" || echo "OK: keine Query-Strings"

# Container läuft:
docker ps --filter name=gordon-proxy
docker logs --tail 20 gordon-proxy
```

---

## Teil 4 — Backup (users.json etc.)

```bash
# Volume-Inhalt verschlüsselt sichern (EU-Ziel!):
docker run --rm -v gordon_data:/data -v /opt/backups:/backup alpine \
  tar czf /backup/gordon-data-$(date +%F).tar.gz -C /data .
```
Aufbewahrung/Rotation gemäß [legal/Loeschkonzept.md](legal/Loeschkonzept.md) festlegen.

---

## Teil 5 — Troubleshooting

| Symptom | Ursache / Lösung |
|---|---|
| `health` antwortet nicht | Container down (`docker ps`, `docker logs gordon-proxy`); Caddy an (`systemctl status caddy`) |
| Add-in: „Proxy nicht erreichbar" | `ALLOWED_ORIGIN` prüfen (exakt die App-Domain); DNS/Caddy-TLS ok? |
| „Ungültiger oder fehlender Nutzer-Token" | Nutzer im Admin-Panel anlegen, Token an Nutzer geben |
| TLS-Zertifikat fehlt | DNS-A-Record korrekt? Port 80/443 offen? `journalctl -u caddy` |
| Nutzerdaten weg nach Update | Volume `-v gordon_data:/data` beim `docker run` vergessen |

---

## Kurzreferenz

```
Erstinstallation:  Teil 1 (einmal)
Update/Redeploy:   Teil 2 (git pull → build → stop/rm → run)
Prüfen:            Teil 3
Backup:            Teil 4
```
