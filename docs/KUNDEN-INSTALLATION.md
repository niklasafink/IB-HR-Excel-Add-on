# Gordon für Excel – Installations- & Einrichtungsanleitung

Gordon ist ein Excel-Add-in für Handelsregister- und Unternehmensdaten. Die
Einrichtung erfolgt in zwei Schritten: einmal durch die IT (Teil A), danach
einmalig durch jeden Mitarbeiter (Teil B).

---

## Teil A — Bereitstellung durch die IT (einmalig)

> Für den Microsoft-365-Administrator der Firma. Danach erscheint Gordon
> **automatisch** in Excel bei allen zugewiesenen Mitarbeitern – auf jedem Gerät,
> an dem sie sich mit dem Firmenkonto anmelden. Es muss **nichts** lokal installiert
> werden.

1. Im **Microsoft 365 Admin Center** anmelden: <https://admin.microsoft.com>
2. **Einstellungen → Integrierte Apps** öffnen.
3. **„Benutzerdefinierte App hochladen"** wählen → App-Typ **Office-Add-in**.
4. Manifest per **URL** angeben:
   ```
   https://app.gordonsregister.com/manifest.xml
   ```
5. **Zuweisen** an: gesamte Organisation, eine Gruppe oder einzelne Nutzer.
6. **Bereitstellen** klicken und bestätigen.

Hinweis: Die Verteilung an die Postfächer kann einige Minuten bis wenige Stunden
dauern. Gordon erscheint danach im Excel-Menüband (Desktop für Windows/Mac sowie
Excel im Web).

---

## Teil B — Erste Einrichtung durch den Mitarbeiter (einmalig pro Gerät)

> Gilt für jeden Mitarbeiter, auch auf einem **neuen Rechner**. Es ist keine
> Installation nötig – nur das einmalige Hinterlegen von Adresse und Zugangs-Token.

1. **Excel öffnen** (mit dem Firmen-M365-Konto angemeldet). Im Menüband erscheint
   **Gordon** → darauf klicken, um den Aufgabenbereich (Task-Pane) zu öffnen.
2. Unten im Aufgabenbereich **„Einstellungen"** aufklappen.
3. Eintragen:
   - **Proxy-Adresse:** `https://api.gordonsregister.com/api`
   - **Zugangs-Token:** der persönliche Token, den der/die Mitarbeiter:in von der
     Gordon-Administration erhalten hat.
4. Auf **„Test"** klicken – der Statuspunkt sollte grün werden (Verbindung OK).

Fertig. Ab jetzt können Unternehmen abgefragt und die Ergebnisse nach Excel
geschrieben werden.

### Auf einem neuen Rechner
Da das Add-in zentral bereitgestellt ist, ist es nach Anmeldung in Excel sofort da.
Nur **Teil B** (Proxy-Adresse + Token) muss einmal pro Gerät erneut eingetragen
werden, da diese Angaben lokal im Browserprofil gespeichert sind.

---

## Häufige Fragen / Problembehebung

- **Gordon erscheint nicht im Menüband:** Verteilung kann etwas dauern; Excel neu
  starten. Sicherstellen, dass der Nutzer der App zugewiesen ist (Teil A, Schritt 5).
- **Statuspunkt rot / „Proxy nicht erreichbar":** Proxy-Adresse exakt
  `https://api.gordonsregister.com/api` prüfen (mit `/api` am Ende).
- **„Ungültiger oder fehlender Nutzer-Token":** Token erneut bei der
  Gordon-Administration anfordern und exakt einfügen (keine Leerzeichen).
- **„Token-Limit erreicht":** Das Credit-Kontingent dieses Nutzers ist aufgebraucht
  – die Administration kann es erhöhen oder zurücksetzen.
