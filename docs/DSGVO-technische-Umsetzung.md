# DSGVO – technische Umsetzung & offene Punkte (für den Betrieb)

> Interne Betriebs-Checkliste für den Anbieter (Modell B). Ergänzt die Rechtsdokumente
> in [../legal/](../legal/). Stand: [Datum].

Diese Punkte machen die in [TOM-Gordon.md](../legal/TOM-Gordon.md) zugesicherten
Maßnahmen technisch wahr. Abhaken, sobald umgesetzt.

## 1. Hosting in der EU sicherstellen ✅ Pflicht
- [ ] Hetzner-Serverstandort **Deutschland/EU** (z. B. Nürnberg/Falkenstein) – **nicht** USA/Singapur.
- [ ] Hetzner-**AV-Vertrag abschließen** (liegt als `DPA_de.pdf` vor) und **EU-Standort** in Anlage 3 bestätigen lassen.
- [ ] Backup-Ziel in der EU wählen und verschlüsseln.

## 2. Reverse-Proxy-Logs ohne Personendaten (Caddy) — ✅ Vorlage vorhanden
Bei aktiviertem Access-Log loggt Caddy die volle URL inkl. `?q=<Suchbegriff>` – bei
Personensuche sind das Personennamen. Deployfertige Vorlage:
**[../proxy/Caddyfile.example](../proxy/Caddyfile.example)** (built-in `filter`-Encoder,
entfernt den kompletten Query-String; kein Plugin nötig).

- [ ] `proxy/Caddyfile.example` nach `/etc/caddy/Caddyfile` übernehmen, Domain anpassen, `caddy reload`.
- [ ] Nach Deployment einmal prüfen: `grep '?' /var/log/caddy/gordon-api.log` → **keine Treffer**.
- [x] Node-Proxy loggt selbst keine Query-Strings/Namen (nur Start-Logs; `usage.json` nur aggregiert).

## 3. Cache-Aufbewahrung bewusst festlegen
- Der Proxy hält Abfrageergebnisse (inkl. Personendaten) **nur im RAM**, TTL über
  `CACHE_TTL_SECONDS` (Standard **86400 s = 24 h**).
- [ ] Entscheiden: 24 h nötig? Sonst reduzieren, z. B. `CACHE_TTL_SECONDS=3600` (1 h)
      oder `14400` (4 h) als ENV setzen. In Löschkonzept eintragen.

## 4. Secrets & Zugänge
- [ ] `HANDELSREGISTER_API_KEY` und `ADMIN_TOKEN` nur als ENV/Docker-Secret (nie im Repo/Bundle).
- [ ] SSH-Key-Login am Server, Passwort-Login deaktiviert.
- [ ] Hetzner-Kundenkonto mit **2FA**.
- [ ] `ALLOWED_ORIGIN=https://app.gordonsregister.com` gesetzt (CORS).

## 5. Backup & Wiederherstellung
- [ ] Automatisches, **verschlüsseltes** Backup des Docker-Volumes (`users.json`).
- [ ] Aufbewahrung/Rotation festlegen (z. B. 30 Tage) → ins Löschkonzept.
- [ ] Restore einmal testen; benötigte Zeit in TOM (§4) eintragen.

## 6. Updates
- [ ] Regelmäßige OS-/Container-/npm-Updates (Turnus festlegen, z. B. monatlich; kritische CVEs sofort).

## 7. Löschung
- [ ] Ablauf „Kunde/Nutzer löschen" und „Vertragsende" gemäß [Loeschkonzept.md](../legal/Loeschkonzept.md) einmal durchspielen.

## 8. Organisatorisch
- [ ] Vertraulichkeitsverpflichtung unterschreiben (auch als Einzelunternehmer sinnvoll; für alle weiteren Mitwirkenden Pflicht).
- [ ] Meldeprozess [Datenschutzverletzung-Meldeprozess-Art33.md](../legal/Datenschutzverletzung-Meldeprozess-Art33.md) mit Kundenkontakt füllen.
