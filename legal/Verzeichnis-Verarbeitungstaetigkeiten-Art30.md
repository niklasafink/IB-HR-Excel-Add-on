# Verzeichnis von Verarbeitungstätigkeiten (Auftragsverarbeiter) – Gordon

> Nach **Art. 30 Abs. 2 DSGVO** (Verzeichnis des Auftragsverarbeiters).
> ⚠️ Muster, anwaltlich prüfen. Stand: [Datum]. Platzhalter `[…]` ausfüllen.
> Hinweis: Der **Verantwortliche (Kunde)** führt zusätzlich sein eigenes Verzeichnis
> nach Art. 30 Abs. 1.

## 1. Verantwortlicher (Auftragsverarbeiter)
- **Name:** Gordon – [Anbieter: Inhaber/Firma Niklas Fink, Rechtsform, Anschrift]
- **Kontakt Datenschutz:** niklas@gordonsregister.com
- **Datenschutzbeauftragter:** [erforderlich? i. d. R. bei Kleinunternehmen **nein**,
  Art. 37 prüfen – Eintrag: „nicht bestellt, da Voraussetzungen des Art. 37 nicht
  erfüllt" / oder Kontaktdaten]

## 2. Auftraggeber (Verantwortliche)
- Kategorien: Kunden des Gordon-Managed-Hostings. Namentliche Liste: [intern geführt].

## 3. Kategorien von Verarbeitungen (im Auftrag)
Betrieb des Gordon-Proxy: Entgegennahme von Abfragen, authentifizierte Weiterleitung
an handelsregister.ai, kurzzeitiges Caching, Nutzer-/Limitverwaltung.

## 4. Kategorien betroffener Personen
- Organe, Gesellschafter, wirtschaftlich Berechtigte in Registerdaten
- Nutzer:innen (Mitarbeitende) der Auftraggeber

## 5. Kategorien personenbezogener Daten
- Name, Funktion/Rolle, **Geburtsdatum**, Ort/Adresse (aus Registerdaten)
- Suchbegriffe (ggf. Personennamen)
- Nutzerkonto: Name, **gehashter** Token, Credit-Verbrauch/-Limit, Status

Besondere Kategorien (Art. 9): keine.

## 6. Empfänger
- **Hetzner Online GmbH** (Hosting, EU/DE)
- **Cloudflare** (statische Auslieferung; DPA + SCC)
- **handelsregister.ai** (Datenquelle; [Einordnung/DPA klären])

## 7. Drittlandübermittlungen
- Verarbeitung des Proxy in **EU/DE**.
- Cloudflare: möglicher US-Bezug → **EU-SCC/DPA**.
- handelsregister.ai: [Land + Garantie prüfen].

## 8. Löschfristen (Kurzfassung)
- Abfrageergebnisse/Cache: **max. 24 h** (RAM, nicht persistent)
- Nutzerkonto: bis Löschung/Vertragsende
- Aggregierte Nutzung: ohne Personenbezug
- Logs: ohne Query-Strings; Rotation nach [X] Tagen
- Details: [Loeschkonzept.md](Loeschkonzept.md)

## 9. Technische und organisatorische Maßnahmen
Allgemeine Beschreibung: siehe [TOM-Gordon.md](TOM-Gordon.md).
