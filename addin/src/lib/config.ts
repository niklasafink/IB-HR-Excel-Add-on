/* global Office */

// Persistente Admin-Konfiguration. Wird im Dokument gespeichert
// (Office.context.document.settings) und ist damit für die Sidebar UND die
// Ribbon-Command-Runtime sichtbar.

export type ValueScale = "original" | "thousand" | "million";

export interface AdminConfig {
  proxyUrl: string; // "" => Build-Default verwenden
  autoYearCount: number; // wie viele Jahre automatisch geladen werden
  removeEmpty: boolean; // leere Positionszeilen entfernen
  scale: ValueScale; // Anzeige in Original / Tausend / Millionen
  centsToEuro: boolean; // API-Werte in Cent -> auf Euro umrechnen (÷100)
  kennzahlenFields: string[]; // welche Kennzahlen (CompanyIndicator) importiert werden
  stammdatenFields: string[]; // welche Stammdaten-Felder importiert werden
}

// Auswählbare Kennzahlen-Felder (entsprechen CompanyIndicator). monetary = in Cent.
export const KENNZAHLEN_FIELDS: Array<{ key: string; label: string; monetary: boolean }> = [
  { key: "revenue", label: "Umsatzerlöse", monetary: true },
  { key: "net_income", label: "Jahresüberschuss", monetary: true },
  { key: "balance_sheet_total", label: "Bilanzsumme", monetary: true },
  { key: "equity", label: "Eigenkapital", monetary: true },
  { key: "employees", label: "Mitarbeiter", monetary: false },
  { key: "cash", label: "Liquide Mittel", monetary: true },
  { key: "liabilities", label: "Verbindlichkeiten", monetary: true },
  { key: "capital_reserves", label: "Kapitalrücklagen", monetary: true },
  { key: "pension_provisions", label: "Pensionsrückstellungen", monetary: true },
  { key: "salaries", label: "Personalaufwand", monetary: true },
  { key: "taxes", label: "Steuern", monetary: true },
  { key: "real_estate", label: "Immobilien", monetary: true },
  { key: "materials", label: "Materialbestand", monetary: true },
  { key: "active_accruals", label: "Aktive RAP", monetary: true },
  { key: "passive_accruals", label: "Passive RAP", monetary: true },
];

// Auswählbare Stammdaten-Felder (aus CompanyV1).
export const STAMMDATEN_FIELDS: Array<{ key: string; label: string }> = [
  { key: "name", label: "Name" },
  { key: "legal_form", label: "Rechtsform" },
  { key: "status", label: "Status" },
  { key: "address", label: "Adresse" },
  { key: "capital", label: "Stammkapital" },
  { key: "incorporated_at", label: "Gegründet am" },
  { key: "notarized_at", label: "Notariell beurkundet" },
  { key: "terminated_at", label: "Aufgelöst am" },
  { key: "purpose", label: "Unternehmensgegenstand" },
  { key: "representation", label: "Vertretung / Geschäftsführung" },
  { key: "register", label: "Registernummer / -gericht" },
  { key: "lei", label: "LEI" },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon" },
  { key: "website", label: "Website" },
  { key: "vat_id", label: "USt-IdNr." },
  { key: "industry_codes", label: "Branchencodes (WZ2025)" },
];

const KEY = "gordonsRegister.config";

export const DEFAULT_CONFIG: AdminConfig = {
  proxyUrl: "",
  autoYearCount: 5,
  removeEmpty: true,
  scale: "original",
  centsToEuro: true,
  kennzahlenFields: ["revenue", "net_income", "balance_sheet_total", "equity", "employees"],
  stammdatenFields: [
    "name",
    "legal_form",
    "status",
    "address",
    "capital",
    "incorporated_at",
    "purpose",
    "representation",
  ],
};

export function getConfig(): AdminConfig {
  try {
    const raw = Office.context.document.settings.get(KEY);
    if (raw && typeof raw === "object") {
      return { ...DEFAULT_CONFIG, ...(raw as Partial<AdminConfig>) };
    }
  } catch {
    /* settings evtl. noch nicht verfügbar */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: AdminConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      Office.context.document.settings.set(KEY, cfg);
      Office.context.document.settings.saveAsync((res) => {
        if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(res.error?.message || "Speichern fehlgeschlagen."));
      });
    } catch (err) {
      reject(err as Error);
    }
  });
}
