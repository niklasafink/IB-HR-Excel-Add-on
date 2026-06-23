# Auftragsverarbeitungsvertrag (AVV) – Muster

> ⚠️ **Muster – keine Rechtsberatung. Vor Verwendung anwaltlich prüfen lassen.**
> Dieser AVV ist **nur erforderlich, wenn der Anbieter den Proxy im Auftrag des
> Kunden betreibt (Managed-Hosting).** Beim Standardmodell (Kunde hostet selbst)
> verarbeitet der Anbieter keine personenbezogenen Daten des Kunden – dann ist
> kein AVV mit dem Anbieter nötig. Platzhalter `[…]` ausfüllen.

Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO zwischen

- **[Kunde], [Anschrift]** – nachfolgend „Verantwortlicher" – und
- **[Anbieter], [Anschrift]** – nachfolgend „Auftragsverarbeiter".

## 1. Gegenstand und Dauer
Gegenstand ist der Betrieb des Gordon-Proxy im Auftrag des Verantwortlichen.
Dauer: Laufzeit des Hauptvertrages.

## 2. Art, Zweck, Art der Daten, Betroffene
- **Art/Zweck der Verarbeitung:** Abruf, Zwischenspeicherung (Cache) und
  Weiterleitung von Unternehmens- und Personendaten aus handelsregister.ai zur
  Darstellung in Excel; Verwaltung von Nutzer-Zugängen und Credit-Limits.
- **Datenarten:** Firmenstammdaten; personenbezogene Daten von Organen,
  Gesellschaftern, wirtschaftlich Berechtigten (z. B. Name, Geburtsdatum,
  Funktion, Ort); Nutzerkonten (Name, gehashter Token, Verbrauch).
- **Betroffene:** vorgenannte natürliche Personen; Nutzer des Kunden.

## 3. Pflichten des Auftragsverarbeiters
3.1 Verarbeitung nur auf dokumentierte Weisung des Verantwortlichen.
3.2 Vertraulichkeit der zur Verarbeitung befugten Personen.
3.3 Technische und organisatorische Maßnahmen nach Art. 32 DSGVO (siehe Anlage 1).
3.4 Unterstützung des Verantwortlichen bei Betroffenenrechten und Pflichten der
Art. 32–36 DSGVO.
3.5 Löschung oder Rückgabe der Daten nach Vertragsende nach Wahl des
Verantwortlichen.
3.6 Bereitstellung der zum Nachweis erforderlichen Informationen; Ermöglichung
von Überprüfungen.

## 4. Unterauftragsverarbeiter
Einsatz von Unterauftragsverarbeitern (z. B. Hosting-Provider [z. B. Hetzner,
Fly.io], Datenquelle handelsregister.ai) nur mit Genehmigung; Liste in Anlage 2.
Der Auftragsverarbeiter erlegt diesen dieselben Pflichten auf.

## 5. Drittlandtransfer
[Keiner / nur mit geeigneten Garantien gem. Art. 44 ff. DSGVO.]

## 6. Meldepflichten
Unverzügliche Meldung von Datenschutzverletzungen an den Verantwortlichen.

## Anlage 1 – Technische und organisatorische Maßnahmen (TOM)
- Transportverschlüsselung (TLS) für alle Verbindungen.
- API-Key und Admin-Token serverseitig, nicht im Add-in-Bundle; Secrets über
  Umgebungsvariablen/Secret-Manager.
- Zugangs-Tokens der Nutzer nur als SHA-256-Hash gespeichert.
- Rate-Limiting und Eingabevalidierung am Proxy.
- Zugriffsbeschränkung auf Admin-Funktionen (Admin-Token).
- Regelmäßige Updates der Server- und Abhängigkeitskomponenten.
- [Backup-, Lösch- und Protokollierungskonzept ergänzen.]

## Anlage 2 – Genehmigte Unterauftragsverarbeiter
| Name | Zweck | Standort |
|------|-------|----------|
| [Hosting-Provider] | Serverbetrieb | [EU/…] |
| handelsregister.ai | Datenquelle | [Land] |

---
[Ort, Datum], Unterschriften Verantwortlicher / Auftragsverarbeiter
