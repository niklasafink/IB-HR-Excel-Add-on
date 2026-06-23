# Datenschutzerklärung – Gordon Excel Add-in

> ⚠️ **Muster – keine Rechtsberatung. Vor Verwendung anwaltlich prüfen lassen.**
> Platzhalter `[…]` ausfüllen. Stand: [Datum].

## 1. Verantwortlicher
Für das Hosting und die Bereitstellung des statischen Add-in-Bundles:
**[Anbieter / Firma], [Anschrift], [E-Mail], [ggf. Datenschutzbeauftragter]**.

Für die Verarbeitung der über das Add-in abgefragten Unternehmens- und
Personendaten ist der **jeweilige Kunde** (Betreiber des Proxy) Verantwortlicher
im Sinne der DSGVO.

## 2. Architektur und Datenfluss (Kurzüberblick)
Gordon besteht aus (a) einem Excel-Add-in (statisches Bundle, vom Anbieter
gehostet) und (b) einem **vom Kunden selbst betriebenen Proxy-Server**, der den
handelsregister.ai-API-Key hält. Abgefragte Unternehmens-/Personendaten fließen
ausschließlich zwischen **Kunde (Excel) ↔ Kunden-Proxy ↔ handelsregister.ai**.
Sie erreichen die Infrastruktur des Anbieters nicht.

## 3. Vom Anbieter verarbeitete Daten (Add-in-Bundle)
Beim Laden des Add-ins von der Hosting-Plattform des Anbieters können technisch
bedingt **Server-Logdaten** anfallen (z. B. IP-Adresse, Zeitpunkt, abgerufene
Datei, User-Agent), die der Auslieferung und Sicherheit dienen
(Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO; berechtigtes Interesse an
sicherer, stabiler Bereitstellung). Das Add-in enthält **kein Tracking, keine
Analyse- oder Werbe-Cookies**. Hosting-Anbieter: [z. B. Cloudflare Pages] – ggf.
Auftragsverarbeitung dort beachten.

## 4. Vom Kunden verarbeitete Daten (Proxy)
Über den vom Kunden betriebenen Proxy werden Unternehmensdaten und ggf.
personenbezogene Daten (z. B. Namen und Geburtsdaten von Geschäftsführern,
wirtschaftlich Berechtigten, Gesellschaftern) von handelsregister.ai abgerufen
und in Excel dargestellt. Verantwortlicher hierfür ist der Kunde. Rechtsgrundlage
ist regelmäßig Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse, z. B.
Compliance/KYC/Bonitätsprüfung) – die Bewertung obliegt dem Kunden.

Im Proxy werden zur Zugriffssteuerung und Verbrauchskontrolle gespeichert:
Nutzername (frei wählbar), ein **gehashter** Zugangs-Token, Credit-Limit und
-Verbrauch (`users.json`). Abgefragte Firmennamen/Suchbegriffe werden **nicht**
dauerhaft personenbezogen protokolliert (lediglich aggregierte Credit-Statistik
in `usage.json`).

## 5. Empfänger / Drittland
- **handelsregister.ai** (Datenquelle) – Vertrag und Datenschutzinformationen
  des Kunden mit handelsregister.ai maßgeblich.
- **Hosting-Anbieter** des Add-in-Bundles und des Proxy (vom Kunden gewählt).
- Eine Übermittlung in Drittländer findet [nicht / nur bei … mit geeigneten
  Garantien gem. Art. 44 ff. DSGVO] statt.

## 6. Speicherdauer
Logdaten des Add-in-Hostings: [z. B. 14 Tage]. Nutzer-/Verbrauchsdaten im Proxy:
für die Dauer der Nutzung; Löschung durch den Kunden (Admin-Funktion „Löschen").

## 7. Betroffenenrechte
Betroffene haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und
Widerspruch (Art. 21) sowie das Recht auf Beschwerde bei einer Aufsichtsbehörde
(Art. 77). Anfragen zu abgefragten Daten richten sich an den **Kunden** als
Verantwortlichen.

## 8. Kontakt
[Anbieter], [Anschrift], [E-Mail]. Für kundenseitige Verarbeitungen: der
jeweilige Kunde.
