# Gordon

Excel Add-in für Handelsregister- und Unternehmensdaten (handelsregister.ai).

## Dokumentation

- **Betrieb & Onboarding**
  - [Kunden-Installation](docs/KUNDEN-INSTALLATION.md) – Add-in im M365-Tenant bereitstellen + Ersteinrichtung durch Mitarbeiter
  - [Lizenzen & Nutzer verwalten](docs/LIZENZEN-VERWALTEN.md) – Admin-Playbook (Tokens, Limits)
- **Deployment**
  - [Add-in auf Cloudflare Pages](DEPLOY-CLOUDFLARE.md) · [Proxy-Hosting](HOSTING.md)
- **Recht:** [legal/](legal/) (EULA, Datenschutz, AVV, AGB – Muster)

Die App besteht nur noch aus dem API-Teil: Im Ribbon gibt es je handelsregister.ai Feature einen Button. Jeder Button oeffnet das Taskpane mit dem passenden Feature vorausgewaehlt. Dort wird ein Unternehmen eingegeben oder aus der markierten Zelle uebernommen, der Request gesendet und die rohe JSON-Antwort angezeigt.

## Features im Ribbon

- `financial_kpi`
- `balance_sheet_accounts`
- `profit_and_loss_account`
- `related_persons`
- `publications`
- `news`
- `insolvency_publications`
- `annual_financial_statements`
- `annual_financial_statements__html`
- `shareholders`
- `ubos`
- `shareholdings`
- `website_content`

## Start

```bash
cd proxy
npm run dev
```

```bash
cd addin
npm run start
npm run sideload
```

Der API-Key liegt serverseitig im Proxy:

```bash
HANDELSREGISTER_API_KEY=...
```
