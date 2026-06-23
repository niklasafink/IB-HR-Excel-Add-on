export interface ApiFeature {
  key: string;
  label: string;
  shortLabel: string;
  group: "Finance" | "People" | "Publications" | "Ownership" | "AI";
  credits: string;
  beta?: boolean;
  description: string;
}

export const API_FEATURES: ApiFeature[] = [
  {
    key: "financial_kpi",
    label: "Finanzkennzahlen",
    shortLabel: "KPI",
    group: "Finance",
    credits: "1",
    description: "Array jährlicher Finanzkennzahlen wie Umsatz, Nettogewinn und Mitarbeiter.",
  },
  {
    key: "balance_sheet_accounts",
    label: "Bilanz",
    shortLabel: "Balance",
    group: "Finance",
    credits: "3",
    description: "Hierarchische Bilanzdaten mit Vermögen und Verbindlichkeiten pro Jahr.",
  },
  {
    key: "profit_and_loss_account",
    label: "Gewinn- und Verlustrechnung (GuV)",
    shortLabel: "P&L",
    group: "Finance",
    credits: "3",
    description: "Detaillierte GuV-Aufstellungen mit Umsatz, Ausgaben und Gewinn.",
  },
  {
    key: "annual_financial_statements",
    label: "Jahresabschluss (Markdown)",
    shortLabel: "AFS MD",
    group: "Finance",
    credits: "5",
    description: "Vollständige Jahresberichte im Markdown-Format mit Metadaten.",
  },
  {
    key: "annual_financial_statements__html",
    label: "Jahresabschluss (HTML)",
    shortLabel: "AFS HTML",
    group: "Finance",
    credits: "5",
    description: "Vollständige Jahresberichte im HTML-Format mit Metadaten.",
  },
  {
    key: "related_persons",
    label: "Geschäftsführung & Organe",
    shortLabel: "People",
    group: "People",
    credits: "2",
    description: "Aktuelle und ehemalige Geschäftsführer oder Vorstände mit Rollen und Amtszeiten.",
  },
  {
    key: "publications",
    label: "Bekanntmachungen",
    shortLabel: "Publ.",
    group: "Publications",
    credits: "1",
    description: "Offizielle Handelsregisterveröffentlichungen und Bekanntmachungen.",
  },
  {
    key: "news",
    label: "Nachrichten",
    shortLabel: "News",
    group: "Publications",
    credits: "10",
    description: "Nachrichtenartikel mit Titel, Quelle, Veröffentlichungsdatum und URL.",
  },
  {
    key: "insolvency_publications",
    label: "Insolvenzbekanntmachungen",
    shortLabel: "Insolv.",
    group: "Publications",
    credits: "1",
    description: "Insolvenzgerichtsveröffentlichungen mit Daten, Aktenzeichen und Ereignissen.",
  },
  {
    key: "shareholders",
    label: "Gesellschafter",
    shortLabel: "Shareholders",
    group: "Ownership",
    credits: "5",
    beta: true,
    description: "Liste der Gesellschafter mit Eigentumsanteilen und Rollen.",
  },
  {
    key: "ubos",
    label: "Wirtschaftlich Berechtigte (UBOs)",
    shortLabel: "UBOs",
    group: "Ownership",
    credits: "10",
    beta: true,
    description: "Wirtschaftlich Berechtigte mit Beteiligungsquoten und Abdeckungsgrad.",
  },
  {
    key: "shareholdings",
    label: "Beteiligungen",
    shortLabel: "Holdings",
    group: "Ownership",
    credits: "5",
    beta: true,
    description: "Aktuelle Beteiligungen dieses Unternehmens an anderen Gesellschaften.",
  },
  {
    key: "website_content",
    label: "Website-Inhalt (KI)",
    shortLabel: "Website",
    group: "AI",
    credits: "0",
    description: "Unternehmens-Website als strukturiertes Markdown, optimiert für LLM-Verarbeitung.",
  },
];

export function featureByKey(key: string | null | undefined): ApiFeature {
  return API_FEATURES.find((feature) => feature.key === key) ?? API_FEATURES[0];
}
