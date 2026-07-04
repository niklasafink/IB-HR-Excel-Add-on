# Meldeprozess bei Datenschutzverletzungen (Art. 33 DSGVO) – Gordon

> ⚠️ Muster, anwaltlich prüfen. Stand: [Datum].
> Als **Auftragsverarbeiter** meldet Gordon Verletzungen **an den Verantwortlichen**
> (nicht direkt an die Aufsichtsbehörde). Die 72-h-Meldung an die Behörde obliegt dem
> Verantwortlichen (Art. 33 Abs. 1).

## 1. Was ist eine meldepflichtige Verletzung?
Jede Verletzung der Sicherheit, die zu Vernichtung, Verlust, Veränderung oder
unbefugter Offenlegung/Zugang zu personenbezogenen Daten führt – z. B. Kompromittierung
des Servers/Tokens, Datenabfluss aus `users.json`, unbefugter Admin-Zugriff.

## 2. Ablauf
1. **Erkennen & Eindämmen** – Vorfall feststellen (Monitoring/Meldung), sofort
   eindämmen (z. B. Token rotieren, Zugänge sperren, Container isolieren).
2. **Dokumentieren** – Zeitpunkt, Art, betroffene Datenarten, ungefähre Zahl
   Betroffener/Datensätze, mutmaßliche Ursache, ergriffene Maßnahmen.
3. **Melden an den Verantwortlichen – UNVERZÜGLICH** (Ziel: **< 24 h** nach Kenntnis),
   damit dieser seine 72-h-Frist wahren kann. Kanal: [E-Mail/Telefon des Kunden-
   Ansprechpartners eintragen].
4. **Inhalt der Meldung** (Art. 33 Abs. 3): Beschreibung der Verletzung; Kategorien und
   ungefähre Zahl der Betroffenen/Datensätze; Kontaktstelle (niklas@gordonsregister.com);
   wahrscheinliche Folgen; ergriffene/vorgeschlagene Gegenmaßnahmen.
5. **Nachbereitung** – Ursachenanalyse, TOM anpassen, Vorfall im Register dokumentieren.

## 3. Rollen & Kontakte
| Rolle | Person | Kontakt |
|---|---|---|
| Meldende Stelle (Auftragsverarbeiter) | Niklas Fink / Gordon | niklas@gordonsregister.com |
| Empfänger (Verantwortlicher) | [Ansprechpartner Kunde] | [E-Mail/Tel.] |

## 4. Vorfallregister (Vorlage)
| Datum/Uhrzeit Kenntnis | Beschreibung | Betroffene Datenarten | Ungef. Zahl | Maßnahmen | Meldung an Kunde am | Status |
|---|---|---|---|---|---|---|
| | | | | | | |

## 5. Unterauftragsverarbeiter
Meldet ein Unterauftragsverarbeiter (Hetzner/Cloudflare) eine Verletzung, wird diese
unverzüglich in obigen Prozess übernommen und an den Verantwortlichen weitergeleitet.
