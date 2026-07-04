# Rechtsunterlagen – Gordon

> ⚠️ **Wichtiger Hinweis:** Diese Dokumente sind **Muster/Vorlagen** und **keine
> Rechtsberatung**. Sie müssen vor dem produktiven Einsatz und vor dem Verkauf von
> einer auf IT-Recht und Datenschutz spezialisierten Anwältin / einem Anwalt
> geprüft und an deine konkrete Situation angepasst werden. Alle Platzhalter in
> eckigen Klammern (`[…]`) sind auszufüllen.

## Übersicht

| Dokument | Zweck |
|----------|-------|
| [EULA.md](EULA.md) | Endnutzer-Lizenzvereinbarung (Softwarelizenz Gordon) |
| [Nutzungsbedingungen.md](Nutzungsbedingungen.md) | Vertragliche Nutzungsbedingungen / AGB für Kunden |
| [Datenschutzerklaerung.md](Datenschutzerklaerung.md) | Datenschutzhinweise zum Add-in |
| [AVV.md](AVV.md) | AVV-Kurzmuster (allgemein) |

### Managed-Hosting (Modell B) – vollständiges DSGVO-Nachweispaket
Für den Fall, dass **der Anbieter den Proxy betreibt** (aktueller Betrieb:
`api.gordonsregister.com` auf Hetzner Cloud, EU/DE):

| Dokument | Zweck |
|----------|-------|
| [DSGVO-Nachweispaket.md](DSGVO-Nachweispaket.md) | **Start hier** – Übersicht, Datenflussdiagramm, Kunden-Checkliste |
| [AVV-Gordon.md](AVV-Gordon.md) | Auftragsverarbeitungsvertrag (Art. 28), Gordon als Auftragsverarbeiter |
| [TOM-Gordon.md](TOM-Gordon.md) | Technische & organisatorische Maßnahmen (Art. 32) |
| [Subunternehmer-Gordon.md](Subunternehmer-Gordon.md) | Unterauftragsverarbeiter (Hetzner, Cloudflare, handelsregister.ai) |
| [Verzeichnis-Verarbeitungstaetigkeiten-Art30.md](Verzeichnis-Verarbeitungstaetigkeiten-Art30.md) | Verzeichnis (Art. 30 Abs. 2) |
| [Loeschkonzept.md](Loeschkonzept.md) | Aufbewahrung & Löschung |
| [Datenschutzverletzung-Meldeprozess-Art33.md](Datenschutzverletzung-Meldeprozess-Art33.md) | Meldeprozess (Art. 33) |
| [../docs/DSGVO-technische-Umsetzung.md](../docs/DSGVO-technische-Umsetzung.md) | Technische Umsetzung / Betriebs-Checkliste (intern) |

> **Achtung Modell-B:** Die untenstehende Einordnung („Daten erreichen den Anbieter
> nicht") gilt nur für **Modell A (Kunde hostet selbst)**. Im Managed-Hosting ist der
> Anbieter **Auftragsverarbeiter** – dann gilt das Nachweispaket oben.

## DSGVO-Einordnung (Architektur-bedingt)

Gordon ist so gebaut, dass **personenbezogene Daten den Anbieter nicht erreichen**:

- Der **Kunde betreibt den Proxy selbst** (eigener Server, eigener
  handelsregister.ai-Key). Firmen- und Personendaten (z. B. wirtschaftlich
  Berechtigte, Geschäftsführer, Geburtsdaten) fließen ausschließlich zwischen
  **Kunde ↔ handelsregister.ai**.
- Der **Anbieter (Gordon)** liefert nur die Software und hostet das statische
  Add-in-Bundle (HTML/JS). Dieses enthält **kein Tracking/Analytics** und
  verarbeitet selbst keine personenbezogenen Daten der abgefragten Unternehmen.

Daraus folgt typischerweise:

- **Verantwortlicher** i. S. d. Art. 4 Nr. 7 DSGVO ist der **Kunde** für alle von
  ihm abgefragten Daten. Er benötigt eine **Rechtsgrundlage** (i. d. R. Art. 6
  Abs. 1 lit. f DSGVO – berechtigtes Interesse, z. B. KYC/Compliance/Bonität).
- handelsregister.ai ist Datenquelle bzw. Auftragsverarbeiter des Kunden; der
  Kunde schließt den entsprechenden Vertrag direkt mit handelsregister.ai.
- Eine **Auftragsverarbeitung (AVV) mit dem Anbieter** ist nur erforderlich, wenn
  der Anbieter den Proxy **im Auftrag des Kunden hostet** (optionales
  Managed-Hosting-Modell). Siehe [AVV.md](AVV.md).

Diese Einordnung ist anwaltlich zu bestätigen.
