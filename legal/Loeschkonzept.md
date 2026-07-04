# Löschkonzept – Gordon-Proxy

> ⚠️ Muster, anwaltlich prüfen. Stand: [Datum]. Ergänzt [TOM-Gordon.md](TOM-Gordon.md)
> und [AVV-Gordon.md](AVV-Gordon.md) § 10.

Grundsatz: Speicherbegrenzung (Art. 5 Abs. 1 lit. e) und Löschung/Rückgabe nach
Auftragsende (Art. 28 Abs. 3 lit. g).

## 1. Datenarten, Fristen und Löschmechanismus

| Datenart | Speicherort | Aufbewahrung | Löschung erfolgt durch |
|---|---|---|---|
| Abfrageergebnisse inkl. Personendaten | **Cache im RAM** des Proxy | ≤ `CACHE_TTL_SECONDS` (Standard **24 h**) | automatischer TTL-Ablauf + Verlust bei Neustart; nicht persistent |
| Nutzerkonto (Name, Token-Hash, Verbrauch/Limit, Status) | `users.json` im Docker-Volume | bis Löschung des Nutzers bzw. **Vertragsende** | Admin-Funktion „Nutzer löschen" (`DELETE /api/admin/users/:id`) |
| Aggregierte Nutzung | `usage.json` im Docker-Volume | laufend; **kein Personenbezug** | `POST /api/usage/reset` / Löschen der Datei |
| Reverse-Proxy-Logs (Caddy) | Server-Dateisystem | **ohne Query-Strings**; Rotation nach [X] Tagen | logrotate / Caddy-Konfiguration |
| Backups des Volumes | [Backup-Ziel, EU] | [z. B. 30 Tage rollierend] | automatische Rotation |

## 2. Löschung bei Vertragsende
Nach Wahl des Verantwortlichen:
1. **Rückgabe:** Export der `users.json` (bzw. Nutzerliste) an den Verantwortlichen, danach Löschung; **oder**
2. **Löschung:** Stoppen und Entfernen des Kunden-Containers **inkl. Docker-Volume**
   (`docker rm -v gordon-<kunde>` bzw. `docker volume rm …`) sowie Löschung der Backups
   nach Ablauf der Backup-Rotation.
Bestätigung der Löschung wird dem Verantwortlichen auf Wunsch in Textform erteilt.

## 3. Betroffenenrechte (Löschung einzelner Personen, Art. 17)
- **Nutzer:innen:** über die Admin-Funktion „Nutzer löschen".
- **Personen in Registerdaten:** werden **nicht dauerhaft gespeichert** (nur flüchtiger
  Cache ≤ 24 h). Ein Löschersuchen ist daher i. d. R. gegenstandslos, sobald der Cache
  abgelaufen ist; bei Bedarf Proxy-Neustart zur sofortigen Cache-Leerung. Ersuchen zur
  Quelle selbst sind an handelsregister.ai bzw. das Register zu richten.

## 4. Offene Punkte (auszufüllen)
- [ ] Backup-Ziel + Aufbewahrungsdauer festlegen (EU-Standort, verschlüsselt)
- [ ] Log-Rotationsfrist [X] Tage festlegen
- [ ] Ggf. `CACHE_TTL_SECONDS` reduzieren (z. B. auf 1–4 h), falls 24 h nicht nötig
