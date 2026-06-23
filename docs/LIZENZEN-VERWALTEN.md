# Gordon – Lizenzen & Nutzer verwalten (Admin-Playbook)

Dieses Dokument beschreibt, wie du als Betreiber Nutzer anlegst und Lizenzen
vergibst. Eine **Lizenz** = ein persönlicher **Zugangs-Token** mit einem
**Credit-Limit**.

> Zugang nur mit dem **ADMIN_TOKEN** (liegt serverseitig in `/opt/gordon/.env`).
> Niemals an Kunden weitergeben.

---

## Admin-Oberfläche öffnen

1. Browser: <https://api.gordonsregister.com/admin>
2. Den **ADMIN_TOKEN** einfügen → **Anmelden**.

---

## Neue Lizenz vergeben (Nutzer anlegen)

1. Unter **„Neuen Nutzer anlegen"**:
   - **Name:** z. B. „Max Mustermann (Firma XY)"
   - **Credit-Limit:** das Kontingent, z. B. `1000`
2. **„Anlegen"** klicken.
3. Der **Zugangs-Token wird angezeigt** → an den Mitarbeiter weitergeben.
   (Später jederzeit über den Button **„Token kopieren"** in der Nutzerzeile abrufbar.)

Der Mitarbeiter trägt Proxy-Adresse + Token einmalig im Add-in ein
(siehe `KUNDEN-INSTALLATION.md`, Teil B).

---

## Lizenzen steuern (pro Nutzerzeile)

| Aktion | Wirkung |
|--------|---------|
| **Token kopieren** | Persönlichen Token erneut in die Zwischenablage holen |
| **Limit speichern** | Neues Credit-Limit setzen (Zahl im Feld anpassen) |
| **Limit aufheben** | Lizenz vorübergehend **unbegrenzt** schalten (z. B. Sonderfall) |
| **Sperren** | Zugang sofort blockieren (Token bleibt, ist aber inaktiv) |
| **Verbrauch 0** | Verbrauchszähler zurücksetzen (z. B. neuer Abrechnungszeitraum) |
| **Löschen** | Lizenz endgültig entziehen, Token wird ungültig |

---

## Verbrauch überwachen

- In der Nutzerliste steht je Nutzer der aktuelle **Verbrauch** (verbrauchte Credits).
- Der Verbrauch wird **nur bei echten Abfragen** gebucht (zwischengespeicherte
  Ergebnisse kosten nichts).
- Erreicht ein Nutzer sein Limit, erhält er beim nächsten Abruf den Hinweis
  „Token-Limit erreicht" – du kannst das Limit erhöhen (**Limit speichern**) oder
  zurücksetzen (**Verbrauch 0**).

---

## Lizenzmodell – kurz erklärt

- **Eine Lizenz = ein Nutzer-Token mit Credit-Limit.** Mehr Mitarbeiter = mehr
  Nutzer anlegen.
- Alle Nutzer teilen sich den **gemeinsamen handelsregister.ai-Credit-Pool** des
  Servers; die Einzel-Limits deckeln, wie viel jeder davon nutzen darf.
- **Credits aufladen:** im handelsregister.ai-Dashboard. Ist der Pool leer, melden
  alle Abfragen „Keine Credits mehr verfügbar" – unabhängig vom Einzel-Limit.

---

## Produktions-Hinweise

- **Eigene App-GUID:** Vor breitem Rollout im `addin/manifest.xml` eine eigene
  Produktions-GUID setzen (die aktuelle ist eine Entwicklungs-ID).
- **Kunden-Trennung:** Sollen Kunden **getrennte** Credit-Budgets/Keys haben, statt
  sich einen Pool zu teilen, kann pro Kunde eine eigene Proxy-Instanz mit eigenem
  handelsregister.ai-Key betrieben werden (siehe `HOSTING.md`).
- **ADMIN_TOKEN** sicher aufbewahren (Passwort-Manager); bei Verdacht auf Kompromittierung
  in `/opt/gordon/.env` ändern und Container neu starten.
