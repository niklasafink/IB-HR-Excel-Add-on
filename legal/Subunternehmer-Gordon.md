# Genehmigte Unterauftragsverarbeiter – Gordon

> Anlage 3 zum [AVV-Gordon.md](AVV-Gordon.md) · ⚠️ Muster, anwaltlich prüfen.
> Stand: [Datum]. Platzhalter `[…]` ausfüllen/prüfen.

Für den Betrieb des Gordon-Proxy setzt der Auftragsverarbeiter folgende
Unterauftragsverarbeiter ein. Alle sind mit AV-Vertrag/DPA gebunden.

| Nr. | Unternehmen | Zweck / Leistung | Standort Verarbeitung | Drittland? | Garantie / DPA |
|-----|-------------|------------------|-----------------------|------------|----------------|
| 1 | **Hetzner Online GmbH**, Industriestraße 25, 91710 Gunzenhausen, DE | Server-/Infrastruktur-Hosting des Proxy-Containers | Deutschland (EU) – Serverstandort **DE/EU** gewählt | Nein | AV-Vertrag Art. 28 (liegt vor: `DPA_de.pdf`); TOM unter hetzner.com/de/AV/TOM.pdf |
| 2 | **Cloudflare** (Cloudflare Germany GmbH / Cloudflare, Inc.) | Auslieferung des **statischen** Add-in-Bundles (Cloudflare Pages), TLS, CDN | EU-Edge; Muttergesellschaft USA | Ja (USA) | Cloudflare DPA inkl. **EU-Standardvertragsklauseln**; Data Localization Suite optional. **Kein Personendaten-Inhalt**, lediglich Auslieferung statischer Dateien + Verbindungs-/IP-Daten |
| 3 | **handelsregister.ai** – [Betreiber, Rechtsform, Anschrift, Land ausfüllen] | Datenquelle: Abruf der Register-/Unternehmens-/Personendaten | [Land prüfen] | [prüfen] | [AV-Vertrag/DPA mit handelsregister.ai einholen und hier referenzieren] |

## Weitere Unterauftragsverarbeiter von Hetzner (Sub-Subunternehmer)

Hetzner setzt seinerseits Subunternehmer ein (Hetzner-AVV, Anlage 3, Stand
06.08.2024). Für Gordon relevant ist **nur die EU-Verarbeitung**; die
Nicht-EU-Einträge greifen ausschließlich bei Wahl eines Nicht-EU-Serverstandorts.

| Serverstandort | Subunternehmer | Anschrift | Leistung |
|---|---|---|---|
| Finnland (EU) | Hetzner Finland Oy | Huurrekuja 10, 04360 Tuusula, FI | Gebäudevermietung, technischer Support |
| USA | Hetzner US LLC | 1500 Broadway, 19th Fl, New York, NY 10036, USA | Serververmietung (Standort USA) |
| USA | NTT Global Data Centers Americas, Inc. | 1625 National Drive, Sacramento, CA 95834, USA | Colocation (USA) |
| USA | QTS Investment Properties Hillsboro, LLC | 12851 Foster Street, Overland Park, KS 66213, USA | Colocation (USA) |
| Singapur | Hetzner Singapore Pte. Ltd. | 1 Scotts Road, #21-10 Shaw Centre, 228208, SG | Serververmietung (Singapur) |
| Singapur | NTT Global Data Centers SG1 Pte Ltd | 8 Kallang Avenue #15-01/09, Aperia, 339509, SG | Colocation (Singapur) |

> **Hetzner-Hinweis (Anlage 3):** „Soweit Sie sich für einen Serverstandort in der EU
> entschieden haben, werden Ihre Serverdaten ausschließlich innerhalb der EU
> verarbeitet. Supportdienstleistungen erfolgen für alle Serverstandorte innerhalb
> der EU."
>
> **Konsequenz für Gordon:** Da der Gordon-Proxy auf einem **EU-Standort (Deutschland)**
> betrieben wird, werden **keine** Daten in die USA oder nach Singapur verarbeitet. Die
> obigen Nicht-EU-Einträge sind für Gordon damit **nicht einschlägig** – es entsteht
> **kein Drittlandtransfer** über die Hosting-Kette.

## Hinweise
- **Serverstandort Hetzner:** Es ist zwingend ein **EU-Standort** (Deutschland,
  z. B. Nürnberg/Falkenstein) zu wählen. Bei EU-Standort verarbeitet Hetzner die
  Serverdaten ausschließlich innerhalb der EU (siehe Hetzner-AVV Anlage 3, Zitat oben).
- **Cloudflare:** Das Add-in-Bundle enthält nur HTML/JS/CSS ohne Personendaten der
  Abfragen. Personenbezug entsteht dort allenfalls über technische Verbindungsdaten
  (IP). DPA + SCC von Cloudflare beilegen.
- **handelsregister.ai:** Rechtsträger, Standort und DPA **verbindlich klären** –
  das ist der einzige noch offene Baustein in dieser Liste. Da an diesen Dienst
  Suchbegriffe (ggf. Personennamen) übermittelt werden, ist ein AV-Vertrag bzw. eine
  saubere rechtliche Einordnung (Auftragsverarbeiter vs. eigener Verantwortlicher)
  erforderlich.

## Änderungen
Neue oder ersetzte Unterauftragsverarbeiter werden dem Verantwortlichen **vorab**
mitgeteilt; Widerspruchsfrist 14 Tage (siehe AVV § 7).
