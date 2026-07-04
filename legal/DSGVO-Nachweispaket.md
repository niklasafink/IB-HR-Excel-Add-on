# DSGVO-Nachweispaket – Gordon (für Kunden)

> Übersicht der Datenschutz-Nachweise für **Gordon** im Managed-Hosting (Modell B).
> ⚠️ Muster – vor Weitergabe an Kunden anwaltlich prüfen. Stand: [Datum].

Dieses Paket belegt gegenüber dem Kunden (Verantwortlicher) die datenschutzkonforme
Verarbeitung durch den Anbieter (Auftragsverarbeiter). Es ersetzt kein Zertifikat –
für ein Tool dieser Größe ist ein solches Paket der branchenübliche Nachweis.

## 1. Rollen
- **Verantwortlicher (Art. 4 Nr. 7):** der Kunde – bestimmt Zwecke/Mittel der Abfragen,
  braucht eine Rechtsgrundlage (i. d. R. Art. 6 Abs. 1 lit. f – KYC/Compliance/Bonität,
  inkl. Interessenabwägung).
- **Auftragsverarbeiter (Art. 28):** Gordon – betreibt den Proxy im Auftrag.

## 2. Enthaltene Dokumente
| # | Dokument | Zweck |
|---|----------|-------|
| 1 | [AVV-Gordon.md](AVV-Gordon.md) | Auftragsverarbeitungsvertrag (Art. 28) – **zu unterzeichnen** |
| 2 | [TOM-Gordon.md](TOM-Gordon.md) | Technische & organisatorische Maßnahmen (Art. 32) |
| 3 | [Subunternehmer-Gordon.md](Subunternehmer-Gordon.md) | Liste der Unterauftragsverarbeiter + Garantien |
| 4 | [Verzeichnis-Verarbeitungstaetigkeiten-Art30.md](Verzeichnis-Verarbeitungstaetigkeiten-Art30.md) | Verzeichnis (Art. 30 Abs. 2) |
| 5 | [Loeschkonzept.md](Loeschkonzept.md) | Aufbewahrung & Löschung |
| 6 | [Datenschutzverletzung-Meldeprozess-Art33.md](Datenschutzverletzung-Meldeprozess-Art33.md) | Meldeprozess (Art. 33) |
| 7 | [Datenschutzerklaerung.md](Datenschutzerklaerung.md) | Datenschutzhinweise Add-in |
| – | `DPA_de.pdf` (Hetzner) | AV-Vertrag des Hosting-Subunternehmers |

## 3. Datenflussdiagramm

```
 ┌──────────────────┐   markierte Firma/Person
 │  Excel + Add-in   │──────────────┐
 │ (Nutzer:in Kunde) │              │  HTTPS/TLS, Bearer-Token
 └──────────────────┘              ▼
        ▲                 ┌───────────────────────────┐
 statische Dateien        │   Gordon-Proxy (pro Kunde) │
 (kein Personenbezug)     │   Hetzner Cloud, DE/EU     │
        │                 │  • Auth (Token-Hash)       │
 ┌──────────────┐         │  • Rate-Limit, Validierung │
 │ Cloudflare   │         │  • Cache im RAM (≤24 h)    │
 │ Pages (CDN)  │         │  • users.json (Volume)     │
 └──────────────┘         └─────────────┬─────────────┘
                                        │ HTTPS/TLS, API-Key (serverseitig)
                                        ▼
                              ┌──────────────────────┐
                              │   handelsregister.ai  │
                              │   (Datenquelle)       │
                              └──────────────────────┘
```
- **Personenbezogene Daten** (Organe, UBOs, Geburtsdaten) fließen nur:
  Add-in ↔ Proxy ↔ handelsregister.ai. Beim Proxy nur **flüchtig im RAM** (≤ 24 h).
- **Cloudflare** liefert ausschließlich statische Add-in-Dateien aus (kein Inhalt der Abfragen).

## 4. Zusammenfassung der Maßnahmen (Kurz)
- Hosting **EU/Deutschland** (Hetzner, AV-Vertrag); TLS überall; HTTPS erzwungen.
- **Ein Proxy pro Kunde** (Mandantentrennung); Secrets nur serverseitig.
- Zugangs-Tokens nur **gehasht** (SHA-256); Admin per separatem Token; 2FA am Hosting-Konto.
- **Kein Tracking/Analytics**; Logs **ohne** Personendaten; Statistik nur aggregiert.
- Abfrageergebnisse **nur im RAM**, TTL ≤ 24 h; Nutzerkonten löschbar.
- Meldeprozess, Löschkonzept und Verzeichnis vorhanden.

## 5. Kunden-Checkliste (was der Kunde selbst tun muss)
- [ ] AVV mit Gordon unterzeichnen
- [ ] Eigene **Rechtsgrundlage** + Interessenabwägung dokumentieren (Art. 6 Abs. 1 lit. f)
- [ ] Prüfen, ob eine **DSFA** (Art. 35) nötig ist (Massenabfrage von Personendaten)
- [ ] Eigenes **Verzeichnis** (Art. 30 Abs. 1) ergänzen
- [ ] Mitarbeitende über die Nutzung informieren; Betroffenenrechte-Prozess sicherstellen

## 6. Noch offen beim Anbieter (vor Weitergabe schließen)
- [ ] Alle `[…]`-Platzhalter ausfüllen (Firmierung/Anschrift, Datum, Kontakte)
- [ ] **handelsregister.ai**: Rechtsträger/Standort/DPA verbindlich klären (Anlage 3)
- [ ] Technische Punkte umsetzen: [../docs/DSGVO-technische-Umsetzung.md](../docs/DSGVO-technische-Umsetzung.md)
- [ ] **Anwaltliche Kurzprüfung** des Pakets (empfohlen – überzeugendster Nachweis)
