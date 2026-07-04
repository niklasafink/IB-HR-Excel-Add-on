# Auftragsverarbeitungsvertrag (AVV) – Gordon (Managed-Hosting / Modell B)

> ⚠️ **Muster – keine Rechtsberatung. Vor Verwendung anwaltlich prüfen lassen.**
> Dieser AVV gilt für das **Managed-Hosting-Modell**: Der Anbieter betreibt den
> Gordon-Proxy im Auftrag des Kunden. Damit ist der Anbieter **Auftragsverarbeiter**
> i. S. d. Art. 28 DSGVO. Platzhalter `[…]` ausfüllen.

Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO zwischen

- **[Kunde – Firma, Rechtsform, Anschrift]** – nachfolgend „**Verantwortlicher**" – und
- **Gordon – [Anbieter: Inhaber/Firma Niklas Fink, Rechtsform, Anschrift], E-Mail: niklas@gordonsregister.com** – nachfolgend „**Auftragsverarbeiter**".

---

## 1. Gegenstand und Dauer
(1) Gegenstand ist der Betrieb des **Gordon-Proxy** im Auftrag des Verantwortlichen:
Entgegennahme von Abfragen aus dem Excel-Add-in, authentifizierte Weiterleitung an
die Datenquelle handelsregister.ai, kurzzeitige Zwischenspeicherung (Cache) sowie
Verwaltung von Nutzerzugängen und Credit-Limits.
(2) Dauer: Laufzeit des Hauptvertrags (Software-/Hostingvertrag). Die Beendigung des
Hauptvertrags beendet auch diesen AVV. Das Recht zur außerordentlichen Kündigung
bleibt unberührt.

## 2. Art, Zweck, Datenarten, Kreis der Betroffenen
Siehe **Anlage 1**.

## 3. Weisungsgebundenheit
(1) Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich auf
dokumentierte Weisung des Verantwortlichen, es sei denn, er ist gesetzlich zur
Verarbeitung verpflichtet.
(2) Weisungen werden anfänglich durch diesen Vertrag festgelegt und können in
Textform (z. B. E-Mail) geändert werden.
(3) Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, informiert er den
Verantwortlichen unverzüglich (Remonstrationspflicht).

## 4. Technische und organisatorische Maßnahmen (Art. 32)
Der Auftragsverarbeiter setzt die in **Anlage 2 (TOM)** beschriebenen Maßnahmen um
und hält sie auf dem Stand der Technik. Wesentliche Änderungen werden dokumentiert;
das Sicherheitsniveau wird nicht unterschritten.

## 5. Vertraulichkeit
Alle zur Verarbeitung befugten Personen sind auf Vertraulichkeit verpflichtet; die
Verpflichtung besteht nach Auftragsende fort (siehe Anlage 2, organisatorische
Maßnahmen).

## 6. Unterstützungspflichten
Der Auftragsverarbeiter unterstützt den Verantwortlichen angemessen bei:
- Betroffenenrechten (Kapitel III DSGVO); wendet sich eine betroffene Person direkt
  an den Auftragsverarbeiter, leitet er das Ersuchen unverzüglich weiter,
- der Sicherheit der Verarbeitung (Art. 32),
- Meldung von Datenschutzverletzungen (Art. 33/34) – **unverzügliche** Meldung an
  den Verantwortlichen; Ablauf siehe [Datenschutzverletzung-Meldeprozess-Art33.md](Datenschutzverletzung-Meldeprozess-Art33.md),
- Datenschutz-Folgenabschätzungen (Art. 35) und vorherigen Konsultationen (Art. 36).

## 7. Unterauftragsverarbeiter
(1) Der Verantwortliche stimmt dem Einsatz der in **Anlage 3** genannten
Unterauftragsverarbeiter zu (allgemeine Genehmigung).
(2) Der Auftragsverarbeiter informiert den Verantwortlichen vorab über beabsichtigte
Änderungen; der Verantwortliche kann innerhalb von **14 Tagen** aus wichtigem
datenschutzrechtlichem Grund widersprechen.
(3) Der Auftragsverarbeiter erlegt jedem Unterauftragsverarbeiter dieselben
Datenschutzpflichten per Vertrag auf (Art. 28 Abs. 4).

## 8. Drittlandtransfer
Die Verarbeitung findet grundsätzlich in der **EU/EWR** statt (Proxy: Hetzner,
Deutschland). Soweit einzelne Unterauftragsverarbeiter Bezug zu Drittländern haben
(z. B. Cloudflare als Betreiber der statischen Auslieferung), erfolgt dies nur mit
geeigneten Garantien nach Art. 44 ff. DSGVO (Standardvertragsklauseln/DPA). Details
in **Anlage 3**.

## 9. Kontrollrechte
Der Auftragsverarbeiter weist die Einhaltung auf Anfrage nach – durch Auskünfte,
die TOM-Dokumentation (Anlage 2) und die DPAs/Testate der Unterauftragsverarbeiter.
Vor-Ort-Prüfungen mit angemessener Vorankündigung, max. einmal jährlich, zzgl.
anlassbezogener Kontrollen.

## 10. Löschung und Rückgabe
Nach Auftragsende werden die personenbezogenen Daten nach Wahl des Verantwortlichen
gelöscht oder zurückgegeben, soweit keine gesetzliche Aufbewahrungspflicht besteht.
Umsetzung siehe [Loeschkonzept.md](Loeschkonzept.md).

## 11. Sonstiges
Es gilt deutsches Recht. Bei Widersprüchen gehen die Datenschutzregelungen dieses
AVV dem Hauptvertrag vor. Salvatorische Klausel.

[Ort, Datum] — Unterschriften Verantwortlicher / Auftragsverarbeiter

---

## Anlage 1 – Umfang, Art, Zweck, Datenarten, Betroffene

**Zweck der Verarbeitung:** Bereitstellung von Handelsregister-/Unternehmensdaten in
Excel; Abruf über handelsregister.ai; Nutzer- und Limitverwaltung.

**Art der Verarbeitung:** Erheben (Entgegennahme der Abfrage), Übermitteln
(Weiterleitung an die Datenquelle), kurzzeitiges Zwischenspeichern (Cache),
Löschen; Verwaltung von Zugangs-Tokens und Verbrauchszählern.

**Datenarten:**
- *Abfrageergebnisse:* Firmenstammdaten sowie **personenbezogene Daten natürlicher
  Personen** aus dem Handelsregister/aus öffentlichen Quellen – insbesondere Namen,
  Funktion/Rolle, **Geburtsdatum**, Wohn-/Geschäftsort von Organen (Geschäftsführer,
  Vorstände), Gesellschaftern und wirtschaftlich Berechtigten (UBOs).
- *Suchanfragen:* an handelsregister.ai übergebene Suchbegriffe (können bei
  Personensuche Namen enthalten).
- *Nutzerkonten:* Bezeichnung/Name des Nutzers, **gehashter** Zugangs-Token
  (SHA-256), Credit-Verbrauch/-Limit, Aktiv-/Sperrstatus.

**Kreis der Betroffenen:**
- natürliche Personen in den abgefragten Registerdaten (Organe, Gesellschafter,
  wirtschaftlich Berechtigte),
- Nutzer:innen (Mitarbeitende) des Verantwortlichen.

**Keine besonderen Kategorien** (Art. 9 DSGVO) werden bewusst verarbeitet.

---

## Anlage 2 – Technische und organisatorische Maßnahmen
Siehe eigenständiges Dokument [TOM-Gordon.md](TOM-Gordon.md) (Bestandteil dieses AVV).

## Anlage 3 – Genehmigte Unterauftragsverarbeiter
Siehe eigenständiges Dokument [Subunternehmer-Gordon.md](Subunternehmer-Gordon.md)
(Bestandteil dieses AVV).
