# Claude-Code-Prompt: OpenRegister Excel Add-in

> **Hinweis an Claude Code:** Dies ist ein vollständiger Bau-Auftrag. Baue das
> beschriebene Projekt vollständig. Triff dort, wo unten Spielraum bleibt,
> pragmatische Standard-Entscheidungen im Sinne der genannten Architektur, ohne
> Rückfragen. Verwende den OpenRegister-API-Key **niemals** im Klartext im Code
> oder im Client-Bundle — er lebt ausschließlich serverseitig als Umgebungsvariable
> `OPENREGISTER_API_KEY`.

---

## 1. Ziel & Kurzbeschreibung

Baue ein **Microsoft-Excel-Add-in** (Office.js, TypeScript), mit dem ein Nutzer in
einem Tabellenblatt eine Liste von **Firmennamen** markiert und über einen eigenen
Ribbon-Reiter „OpenRegister" ein Task-Pane öffnet. Im Task-Pane wählt er per
Checkboxen aus, **welche Datenblöcke** (Bilanz/Aktiva, Bilanz/Passiva, GuV,
Kennzahlen, Stammdaten) und **welche Geschäftsjahre** geladen werden sollen.
Auf Knopfdruck löst das Add-in jeden Firmennamen über die
[OpenRegister](https://openregister.de)-API zu einer `company_id` auf, lädt
Finanz- und Stammdaten und schreibt sie **strukturiert in ein neues
Tabellenblatt** — mit hierarchischen Positionsnamen in der ersten Spalte und je
Unternehmen × Geschäftsjahr einer Wertspalte. Der API-Key wird durch einen
**schlanken Backend-Proxy** geschützt, den das Add-in aufruft.

---

## 2. Tech-Stack & Scaffold

**Add-in (`addin/`)**
- Office.js **Excel Task Pane Add-in**, **TypeScript**.
- Scaffold mit dem Office-Yeoman-Generator:
  ```bash
  npx --yes yo office --projectType taskpane --name "OpenRegister" --host excel --ts true
  # interaktiv äquivalent:  yo office
  #   ? Choose a project type:        Office Add-in Task Pane project
  #   ? Choose a script type:         TypeScript
  #   ? What do you want to name...:  OpenRegister
  #   ? Which Office client app:      Excel
  ```
- Dev-Server + Sideload via die generierten Skripte (`npm run start`, webpack-dev-server).
- HTTPS-Dev-Zertifikate über `office-addin-dev-certs` (kommt mit dem Scaffold).
- UI bewusst **framework-arm** (reines TypeScript + HTML/CSS oder leichtes
  Fluent-UI); kein schweres SPA-Framework nötig.

**Backend-Proxy (`proxy/`)**
- **Node.js + Express** (TypeScript), lokal über **HTTPS** (gleiche Dev-Certs via
  `office-addin-dev-certs`, da Office.js nur HTTPS-Origins erlaubt).
- Nutzt das **offizielle TypeScript-SDK**: `npm i openregister`.
- Liest `OPENREGISTER_API_KEY` aus `.env` (via `dotenv`).
- Deploybar als **Serverless Function** (Vercel/Netlify/Azure Functions) — Code so
  strukturieren, dass die Express-Handler auch serverless laufen.
- **CORS** auf den Add-in-Origin beschränken.

---

## 3. Repo-Struktur

```
.
├── addin/                      # Office.js Excel Add-in (yo office Scaffold)
│   ├── manifest.xml            # Ribbon-Reiter, Button, Task-Pane-URL, Permissions
│   ├── package.json
│   ├── webpack.config.js
│   └── src/
│       ├── taskpane/
│       │   ├── taskpane.html   # Checkboxen, Jahres-Auswahl, Laden-Button, Status
│       │   ├── taskpane.css
│       │   └── taskpane.ts     # UI-Logik + Excel.run-Workflow
│       ├── commands/
│       │   └── commands.ts     # Ribbon-Button-Handler (öffnet Task-Pane)
│       └── lib/
│           ├── api.ts          # fetch-Wrapper gegen den Proxy
│           ├── excel.ts        # Range lesen + neues Worksheet schreiben
│           ├── mapping.ts      # merged.*-Bäume → tabellarische Zeilen
│           └── types.ts        # API-Response-Typen
│
├── proxy/                      # Backend-Proxy (Key-Schutz)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example            # OPENREGISTER_API_KEY=...
│   └── src/
│       ├── server.ts           # Express-App, HTTPS, CORS
│       ├── routes.ts           # /autocomplete, /financials, /company
│       └── openregister.ts     # SDK-Init + dünne Service-Funktionen + Cache
│
└── README.md                   # Setup, Start, Sideload, Deploy, Key-Rotation
```

---

## 4. Architektur & Datenfluss

```
┌────────────────────┐      HTTPS        ┌──────────────────┐   Bearer Key   ┌────────────────┐
│  Excel Add-in      │  ───────────────▶ │  Backend-Proxy   │ ─────────────▶ │ OpenRegister   │
│  (Task-Pane, TS)   │   /api/...        │  Express + SDK   │  Authorization │ API (v1)       │
│  KEIN API-Key      │ ◀───────────────  │  hält den Key    │ ◀───────────── │                │
└────────────────────┘   JSON            └──────────────────┘   JSON         └────────────────┘
        │
        │ Excel.run: Selektion lesen → neues Worksheet schreiben
        ▼
   Excel-Arbeitsmappe
```

- Das Add-in kennt **nur die Proxy-URL**, niemals den OpenRegister-Key.
- Der Proxy ist eine **dünne Weiterleitung** mit Auth-Header-Injection, optionalem
  **Caching** (gleiche `company_id` nicht mehrfach abrufen) und **Rate-Limit-/
  Fehler-Normalisierung**.

---

## 5. Ribbon + Task-Pane Spezifikation

**Ribbon (`manifest.xml`)**
- Eigener Reiter (Custom Tab) **„OpenRegister"**.
- Eine Gruppe mit Button **„Daten laden"** (Icon + Label), Aktion =
  `ShowTaskpane` → öffnet das Task-Pane.

> **Designhinweis (im Prompt bewusst festgehalten):** Ribbon-Dropdowns eignen sich
> **nicht** für dynamische Jahreslisten (die Jahre hängen pro Firma von den
> veröffentlichten Berichten ab). Die gesamte Auswahl (Datenblöcke + Jahre) gehört
> deshalb ins **Task-Pane**; der Ribbon-Button dient nur als Einstieg.

**Task-Pane (`taskpane.html` / `taskpane.ts`)**
- **Datenblöcke** (Checkboxen, Mehrfachauswahl):
  - ☐ Bilanz — Aktiva
  - ☐ Bilanz — Passiva
  - ☐ Gewinn- und Verlustrechnung (GuV)
  - ☐ Kennzahlen
  - ☐ Stammdaten
  - ☐ Chancen & Risiken *(deaktiviert, mit Hinweis „derzeit nicht über die API
    verfügbar" — siehe Abschnitt 10)*
- **Jahres-Auswahl** (Mehrfachauswahl): Liste der Geschäftsjahre als Checkboxen.
  Strategie: Nach dem ersten Auflösen einer Firma die verfügbaren Jahre aus den
  `values`-Keys (Berichtsenddaten) anbieten; alternativ eine feste Jahresspanne
  (z. B. 2019–2024) vorgeben, die beim Schreiben gegen die tatsächlich
  vorhandenen Jahre gefiltert wird. Implementiere die feste Spanne als Default
  und biete „nur verfügbare Jahre" als Option.
- **Button „Laden"** → startet den Workflow (Abschnitt 6).
- **Status-/Fortschrittsanzeige:** pro Firma Status (gefunden / mehrdeutig /
  nicht gefunden / geladen / Fehler), Gesamtfortschritt, Fehlertexte.
- Optional: Auflösung mehrdeutiger Firmennamen über eine Auswahlliste der
  `/autocomplete`-Treffer.

---

## 6. Workflow-Schritte (im Add-in)

1. **Selektion lesen:** über `Excel.run` + `context.workbook.getSelectedRange()`
   die markierten Zellen laden (`range.load("values")`), Firmennamen extrahieren
   (leere Zellen überspringen, trimmen, deduplizieren).
2. **Pro Firmenname auflösen:** Proxy-Aufruf
   `GET /api/autocomplete?query=<NAME>` → `results[]`.
   - Besten Treffer wählen (erstes Ergebnis bzw. höchster Score).
   - Bei Mehrdeutigkeit: im Task-Pane Auswahl anbieten oder markieren.
   - Ergebnis: `company_id` (z. B. `DE-HRB-F1103-267645`).
3. **Daten laden** (nur die ausgewählten Blöcke, Caching pro `company_id`):
   - Finanzdaten: `GET /api/financials?company_id=<ID>` → `reports[]` + `merged`.
   - Stammdaten/Kennzahlen: `GET /api/company?company_id=<ID>`.
4. **Mappen & Schreiben:** Antworten gemäß Abschnitt 8 in Zeilen/Spalten umsetzen
   und in ein **neues Worksheet** schreiben (Abschnitt 8).
5. **Statusbericht:** je Firma Erfolg/Fehler im Task-Pane anzeigen.

---

## 7. API-Referenz (OpenRegister v1 — verifizierter Stand)

**Basis-URL:** `https://api.openregister.de`
**Auth (nur im Proxy!):** Header `Authorization: Bearer <OPENREGISTER_API_KEY>`

### 7.1 Autocomplete (Name → company_id)
```
GET /v1/autocomplete/company?query=<FIRMENNAME>
→ { "results": [ { "company_id": "DE-HRB-F1103-267645", "name": "...", ... } ] }
```

### 7.2 Finanzdaten
```
GET /v1/company/{company_id}/financials
→ {
    "reports": [ { "report_end_date": "2023-12-31", ... }, ... ],
    "merged": {
      "aktiva":  [ ZeilenKnoten ],
      "passiva": [ ZeilenKnoten ],
      "guv":     [ ZeilenKnoten ]
    }
  }
```
**ZeilenKnoten (hierarchisch):**
```jsonc
{
  "name": "Anlagevermögen",
  "formatted_name": "A. Anlagevermögen",
  "values": { "2023-12-31": 1234567.0, "2022-12-31": 1100000.0 },
  "children": [ /* weitere ZeilenKnoten */ ]
}
```
- `values` ist je **`report_end_date`** gekeyt → das ist die Basis fürs
  Jahres-Layout (Jahr = Jahresanteil des Berichtsenddatums).

### 7.3 Stammdaten & Kennzahlen
```
GET /v1/company/{company_id}
→ Rechtsform, Adresse, Stammkapital, Geschäftsführung,
  vorberechnete Kennzahlen, ...
```

### 7.4 Credits, Rate-Limits, Caching
- **Financials = 10 Credits/Call**; Free-Tier ≈ **50 Calls**. → sparsam abrufen.
- **Caching im Proxy:** Antworten pro `company_id` zwischenspeichern (In-Memory
  oder kurzlebiger Cache), damit wiederholte Läufe/Blöcke keine neuen Credits
  kosten.
- **Rate-Limit-Handling:** HTTP 429 abfangen, mit Backoff retryen, dem Add-in
  eine klare Fehlermeldung zurückgeben.
- **Was NICHT enthalten ist:** Chancen & Risiken / Lagebericht — siehe Abschnitt 10.

---

## 8. Daten→Excel-Mapping & Layout

**Zielblatt:** neues Worksheet (Name z. B. „OpenRegister-Daten" + Zeitstempel;
falls vorhanden, eindeutigen Namen wählen).

**Spalten-Layout (Firma × Jahr, gruppiert):**
```
| Position                     | Firma A 2023 | Firma A 2022 | Firma B 2023 | Firma B 2022 | ...
|------------------------------|--------------|--------------|--------------|--------------|
| AKTIVA                       |              |              |              |              |
|   A. Anlagevermögen          |   1.234.567  |   1.100.000  |      ...     |     ...      |
|     I. Immaterielle ...      |     ...      |     ...      |      ...     |     ...      |
|   B. Umlaufvermögen          |     ...      |     ...      |      ...     |     ...      |
| PASSIVA                      |              |              |              |              |
|   ...                        |              |              |              |              |
| GUV                          |              |              |              |              |
|   Umsatzerlöse               |     ...      |     ...      |      ...     |     ...      |
| KENNZAHLEN                   |              |              |              |              |
| STAMMDATEN                   |              |              |              |              |
```

**Regeln:**
- **Kopfzeile:** zwei logische Ebenen — Firma und Jahr. Entweder zwei Headerzeilen
  (Firma gemerged über ihre Jahresspalten + darunter die Jahre) oder kombinierte
  Labels „Firma A — 2023". Bevorzuge zwei Zeilen mit gemergten Firmenzellen.
- **Erste Spalte = hierarchische Positionsnamen.** `merged.aktiva`, `merged.passiva`,
  `merged.guv` **rekursiv** rendern: jede Ebene um eine Einrückstufe tiefer
  (z. B. führende Leerzeichen oder Excel-Einzug). `formatted_name` bevorzugen,
  Fallback `name`.
- **Werte:** für jede `(Firma, Jahr)`-Spalte den passenden `values["<report_end_date>"]`
  des Knotens eintragen; Jahr aus dem Berichtsenddatum (`report_end_date.slice(0,4)`)
  ableiten und gegen die im Task-Pane gewählten Jahre filtern. Fehlende Werte =
  leere Zelle.
- **Zahlenformat:** Werte als Zahlen schreiben (nicht als Text), deutsches
  Tausender-Format als Zellformat setzen.
- **Sektions-Trennung:** Überschriftenzeilen für AKTIVA / PASSIVA / GUV /
  KENNZAHLEN / STAMMDATEN; nur die im Task-Pane gewählten Blöcke ausgeben.
- **Stammdaten/Kennzahlen:** als einfache Label→Wert-Zeilen pro Firma (bei
  Kennzahlen ggf. ebenfalls je Jahr, falls jahresbezogen).
- **Schreiben effizient:** Werte als 2D-Array sammeln und in **einem**
  `range.values = [...]` schreiben (nicht zellweise), innerhalb `Excel.run` +
  `context.sync()`.

---

## 9. Fehler- & Edge-Cases

- **Leere Selektion:** Hinweis „Bitte zuerst Zellen mit Firmennamen markieren."
- **Firma nicht gefunden** (`results` leer): Zeile/Firma als „nicht gefunden"
  markieren, Lauf fortsetzen.
- **Mehrdeutiger Name** (mehrere plausible Treffer): besten Treffer nehmen ODER
  Auswahlliste im Task-Pane anbieten; gewählte Zuordnung anzeigen.
- **Keine Bilanz veröffentlicht** (`reports`/`merged` leer): Stammdaten dennoch
  ausgeben, Finanzspalten leer lassen, Hinweis setzen.
- **API-Limit erreicht** (429 / keine Credits): klare Meldung, bereits geladene
  Firmen behalten, Rest abbrechen oder pausieren.
- **Netzwerk-/Proxy-Fehler:** pro Firma fangen, andere Firmen weiterverarbeiten.
- **Gewähltes Jahr ohne Daten:** Spalte bleibt leer (kein Abbruch).
- **Doppelte Firmennamen in der Selektion:** deduplizieren (Cache greift).

---

## 10. Chancen & Risiken (bewusst ausgeklammert)

**Belegt:** Chancen & Risiken (Lagebericht-Inhalte aus dem Bundesanzeiger) sind
**nicht** über die OpenRegister-API verfügbar — weder über `/financials` noch über
die Dokument-Endpunkte (die nur HR-Auszüge AD/CD/HD, Gesellschafterliste und
Satzung liefern, nicht den Bundesanzeiger-Lagebericht).

**Umsetzung in V1:**
- Im Task-Pane die Checkbox „Chancen & Risiken" **anzeigen, aber deaktivieren**,
  mit Tooltip/Hinweis „Derzeit nicht über die API verfügbar".
- Im Code einen **klar gekapselten Erweiterungspunkt** vorsehen (z. B. eine
  leere Funktion `loadRisksAndOpportunities()` in `mapping.ts`/`api.ts` mit
  TODO-Kommentar), damit eine spätere Quelle ohne Architekturänderung andockbar ist.

---

## 11. Secrets & Env

- `OPENREGISTER_API_KEY` lebt **ausschließlich serverseitig** im Proxy als
  Umgebungsvariable. **Niemals** im Add-in-Code, im Bundle oder im Repo.
- `proxy/.env.example` anlegen:
  ```dotenv
  OPENREGISTER_API_KEY=__hier_einsetzen__
  # Optional:
  PORT=3001
  ALLOWED_ORIGIN=https://localhost:3000
  ```
- `.env` in `.gitignore` aufnehmen.
- **README-Hinweis:** Falls der Live-Key (`sk_live_...`) jemals im Klartext
  übermittelt/geteilt wurde, gilt er als **kompromittiert → im OpenRegister-
  Dashboard rotieren** und nur noch als Env-Var verwenden.

---

## 12. Akzeptanzkriterien / Verifikation

- [ ] `proxy/` startet lokal über HTTPS, lädt den Key aus `.env`, und leitet
      `/autocomplete`, `/financials`, `/company` korrekt mit Bearer-Auth weiter.
- [ ] Im Client-Bundle des Add-ins ist **kein** OpenRegister-Key enthalten
      (Build durchsuchen/bestätigen).
- [ ] Add-in lässt sich in Excel **sideloaden**; Ribbon-Reiter „OpenRegister" mit
      Button „Daten laden" erscheint und öffnet das Task-Pane.
- [ ] Task-Pane zeigt Datenblock-Checkboxen + Jahres-Mehrfachauswahl + Laden-Button
      + Status; „Chancen & Risiken" deaktiviert mit Hinweis.
- [ ] **Funktionstest mit 2–3 echten Firmen:** Namen in Zellen markieren, laden,
      und prüfen, dass ein neues Worksheet mit korrektem Layout entsteht
      (hierarchische Positionen in Spalte 1, je Firma × Jahr eine Wertspalte,
      Zahlen als Zahlen, gewählte Jahre korrekt gefiltert).
- [ ] Edge-Cases aus Abschnitt 9 führen nicht zum Absturz, sondern zu klaren
      Statusmeldungen.
- [ ] `README.md` beschreibt Setup, lokalen Start, Sideload, Deploy des Proxys und
      Key-Rotation.

---

### Reihenfolge für die Umsetzung (Empfehlung)
1. Proxy aufsetzen (SDK, Routen, `.env`, CORS, lokal HTTPS) und mit `curl` testen.
2. Add-in scaffolden (`yo office`), Manifest um Ribbon-Reiter/Button erweitern.
3. Task-Pane-UI (Checkboxen, Jahre, Button, Status).
4. `lib/api.ts` (Proxy-Aufrufe) + `lib/excel.ts` (Selektion lesen / Worksheet schreiben).
5. `lib/mapping.ts` (rekursives Rendern der `merged.*`-Bäume + Firma×Jahr-Spalten).
6. Edge-Cases, Statusanzeige, README, End-to-End-Test mit echten Firmen.
