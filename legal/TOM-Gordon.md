# Technische und organisatorische Maßnahmen (TOM) – Gordon-Proxy

> Anlage 2 zum [AVV-Gordon.md](AVV-Gordon.md) · nach Art. 32 DSGVO ·
> ⚠️ Muster, anwaltlich/fachlich prüfen. Stand: [Datum].

Beschreibt die Maßnahmen des Auftragsverarbeiters für den Betrieb des Gordon-Proxy.
Der Proxy läuft als **Docker-Container auf Hetzner Cloud (Standort Deutschland/EU)**
hinter dem Reverse-Proxy **Caddy** (TLS via Let's Encrypt). Das statische Add-in-
Bundle wird über **Cloudflare Pages** ausgeliefert und verarbeitet **keine**
Personendaten der abgefragten Unternehmen.

## 1. Vertraulichkeit

**Zutrittskontrolle (physisch)** – übernommen durch den Unterauftragsverarbeiter
Hetzner (Rechenzentrum DE/EU): Zutrittskontrollsystem, Videoüberwachung,
Sicherheitszaun. Nachweis: Hetzner TOM (Anlage 2 zum Hetzner-AVV).

**Zugangskontrolle (System)**
- Zugriff auf den Server ausschließlich durch den Anbieter per **SSH-Key** (keine
  Passwort-Logins); Hetzner-Kundenkonto mit **2FA**.
- Admin-API des Proxy nur mit **ADMIN_TOKEN** (Umgebungsvariable, nicht im Code).
- Nutzer-Abfragen nur mit gültigem, personengebundenem **Bearer-Token**.

**Zugriffskontrolle (Berechtigungen)**
- Trennung Admin- vs. Nutzerrechte im Proxy.
- **Secrets** (handelsregister.ai-API-Key, ADMIN_TOKEN) ausschließlich als
  Umgebungsvariablen/Docker-Secrets – **niemals** im Add-in-Bundle oder im Code.
- Zugangs-Tokens der Nutzer werden **nur als SHA-256-Hash** gespeichert.

**Trennungskontrolle (Mandantentrennung)**
- **Ein eigener Proxy-Container pro Kunde** (Single-Tenant): eigener API-Key,
  eigener Port, eigenes Docker-Volume. Kundendaten sind dadurch getrennt.

**Datensparsamkeit / Pseudonymisierung**
- Das Add-in enthält **kein Tracking/Analytics**.
- Server-Logs enthalten **keine** Personendaten der Abfragen (Query-Strings werden
  aus den Zugriffslogs entfernt – siehe [docs/DSGVO-technische-Umsetzung.md](../docs/DSGVO-technische-Umsetzung.md)).
- Verbrauchsstatistik (`usage.json`) speichert **nur aggregierte Zähler** je
  Endpunkt-Kategorie – keine Namen, keine Query-Strings.

## 2. Integrität
- **Transportverschlüsselung (TLS)** für alle Verbindungen (Add-in → Proxy →
  handelsregister.ai); HTTPS erzwungen, HSTS.
- Eingabevalidierung und **Rate-Limiting** am Proxy (Schutz vor Missbrauch).
- Sicherheits-Header (helmet).
- CORS auf den festen Add-in-Origin (`https://app.gordonsregister.com`) beschränkt.

## 3. Verfügbarkeit und Belastbarkeit
- Redundante Rechenzentrumsinfrastruktur (Strom, Kühlung, Netzwerk, DDoS-Schutz)
  durch Hetzner.
- Container mit automatischer Neustart-Policy (`restart=always`).
- **Backup** des Kunden-Volumes (`users.json`) – siehe [Loeschkonzept.md](Loeschkonzept.md)
  (Aufbewahrung, Verschlüsselung, Wiederherstellung).
- Cache liegt **nur im Arbeitsspeicher** und geht bei Neustart verloren
  (keine dauerhafte Speicherung der Abfrageergebnisse).

## 4. Belastbarkeit / rasche Wiederherstellbarkeit
- Reproduzierbares Deployment über Dockerfile (Wiederaufsetzen < [X] h).
- Konfiguration/Secrets dokumentiert und sicher hinterlegt.

## 5. Verfahren zur regelmäßigen Überprüfung
- **Regelmäßige Updates** von Betriebssystem, Container-Basisimage und
  Abhängigkeiten (npm) – mind. [monatlich] bzw. bei kritischen CVEs sofort.
- Überprüfung dieser TOM mind. **jährlich** und anlassbezogen.

## 6. Organisatorische Maßnahmen
- **Vertraulichkeitsverpflichtung** aller mit der Verarbeitung befassten Personen
  (Art. 28 Abs. 3 lit. b / Art. 29 / Art. 32 Abs. 4).
- **AV-Verträge** mit allen Unterauftragsverarbeitern (Anlage 3).
- **Meldeprozess** für Datenschutzverletzungen (Art. 33) – dokumentiert.
- **Löschkonzept** mit definierten Aufbewahrungs-/Löschfristen.
- Datenschutzfreundliche Voreinstellungen (Privacy by Design/Default, Art. 25).

## 7. Datenschutzrelevante Speicherorte & Fristen (Kurzüberblick)
| Datum | Ort | Aufbewahrung |
|---|---|---|
| Abfrageergebnisse (inkl. Personendaten) | Cache im RAM des Proxy | max. `CACHE_TTL_SECONDS` (Standard 24 h), nicht persistent |
| Nutzerkonto (Name, Token-Hash, Verbrauch) | `users.json` im Docker-Volume | bis Löschung des Nutzers / Vertragsende |
| Aggregierte Nutzung | `usage.json` im Docker-Volume | ohne Personenbezug |
| Reverse-Proxy-Logs | Caddy (Server) | ohne Query-Strings; Rotation nach [X] Tagen |
