// Filter-Felder für die erweiterte Suche (POST /v1/search/company & /search/person).
// Quelle: https://docs.openregister.de/filtering.md
//
// Wichtig: Alle monetären Felder werden von der API in CENT erwartet.
// Im UI gibt der Nutzer EUR ein, beim Senden wird via eurToCents() umgerechnet.

export type FilterValueKind = "text" | "enum" | "money" | "number" | "date" | "bool";
export type FilterOp = "value" | "values" | "keywords" | "range";

export interface FilterFieldDef {
  field: string;
  label: string;
  kind: FilterValueKind;
  /** Erlaubte Operatoren; der erste ist Default. */
  ops: FilterOp[];
  /** Werte für enum/bool. */
  options?: string[];
  /** Nur in Enterprise-Tarifen verfügbar. */
  enterprise?: boolean;
  hint?: string;
}

export interface FilterCondition {
  field: string;
  value?: string;
  values?: string[];
  keywords?: string[];
  min?: string;
  max?: string;
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  value: "ist",
  values: "ist eine von",
  keywords: "enthält",
  range: "Bereich (min/max)",
};

const LEGAL_FORMS = [
  "ag", "eg", "ek", "ev", "ewiv", "foreign", "gbr", "ggmbh", "gmbh",
  "kg", "kgaa", "unknown", "llp", "municipal", "ohg", "se", "ug",
];
const REGISTER_TYPES = ["HRB", "HRA", "PR", "GnR", "VR"];
const STATUS = ["active", "inactive", "liquidation"];
const BOOL = ["true", "false"];

const TEXT_OPS: FilterOp[] = ["value", "values", "keywords"];
const ENUM_OPS: FilterOp[] = ["value", "values"];
const RANGE_OPS: FilterOp[] = ["range"];
const BOOL_OPS: FilterOp[] = ["value"];

const MONEY_HINT = "Betrag in EUR – wird in Cent an die API gesendet.";

export const COMPANY_FILTER_FIELDS: FilterFieldDef[] = [
  // Stammdaten
  { field: "status", label: "Status", kind: "enum", options: STATUS, ops: ENUM_OPS },
  { field: "legal_form", label: "Rechtsform", kind: "enum", options: LEGAL_FORMS, ops: ENUM_OPS },
  { field: "active", label: "Aktiv", kind: "bool", options: BOOL, ops: BOOL_OPS },
  { field: "register_type", label: "Registerart", kind: "enum", options: REGISTER_TYPES, ops: ENUM_OPS },
  { field: "register_number", label: "Registernummer", kind: "text", ops: TEXT_OPS },
  { field: "register_court", label: "Registergericht", kind: "text", ops: TEXT_OPS },
  { field: "incorporated_at", label: "Gründungsdatum", kind: "date", ops: RANGE_OPS, hint: "Format DD-MM-YYYY." },
  { field: "purpose", label: "Unternehmensgegenstand", kind: "text", ops: ["value", "keywords"] },
  { field: "industry_codes", label: "Branchencode (WZ2025)", kind: "text", ops: TEXT_OPS, hint: "z. B. 56.11 (Restaurants)." },
  // Adresse
  { field: "city", label: "Stadt", kind: "text", ops: TEXT_OPS },
  { field: "zip", label: "PLZ", kind: "text", ops: TEXT_OPS },
  { field: "address", label: "Adresse", kind: "text", ops: ["value", "keywords"] },
  // Kapital
  { field: "capital_amount", label: "Stammkapital", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "capital_currency", label: "Kapital-Währung", kind: "text", ops: ["value"], hint: "z. B. EUR." },
  // Finanzkennzahlen (alle in Cent)
  { field: "revenue", label: "Umsatzerlöse", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "net_income", label: "Jahresüberschuss", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "balance_sheet_total", label: "Bilanzsumme", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "equity", label: "Eigenkapital", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "cash", label: "Liquide Mittel", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "real_estate", label: "Immobilien", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "materials", label: "Materialbestand", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "pension_provisions", label: "Pensionsrückstellungen", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "salaries", label: "Personalaufwand", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "taxes", label: "Steuern", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "liabilities", label: "Verbindlichkeiten", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "capital_reserves", label: "Kapitalrücklagen", kind: "money", ops: RANGE_OPS, hint: MONEY_HINT },
  { field: "employees", label: "Mitarbeiter", kind: "number", ops: RANGE_OPS },
  // LEI
  { field: "has_lei", label: "Hat LEI", kind: "bool", options: BOOL, ops: BOOL_OPS },
  { field: "lei", label: "LEI (GLEIF)", kind: "text", ops: ["value", "values"], hint: "20-stellige LEI; mehrere = OR." },
  // Eigentümer (Enterprise)
  { field: "number_of_owners", label: "Anzahl Eigentümer", kind: "number", ops: ["range", "value"], enterprise: true },
  { field: "has_sole_owner", label: "Alleineigentümer", kind: "bool", options: BOOL, ops: BOOL_OPS, enterprise: true },
  { field: "has_representative_owner", label: "Eigentümer in Geschäftsführung", kind: "bool", options: BOOL, ops: BOOL_OPS, enterprise: true },
  { field: "is_family_owned", label: "Familiengeführt", kind: "bool", options: BOOL, ops: BOOL_OPS, enterprise: true },
  { field: "youngest_owner_age", label: "Alter jüngster Eigentümer", kind: "number", ops: RANGE_OPS, enterprise: true },
];

export const PERSON_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "date_of_birth", label: "Geburtsdatum", kind: "date", ops: ["range", "value"], hint: "Format DD-MM-YYYY." },
  { field: "city", label: "Stadt", kind: "text", ops: TEXT_OPS },
  { field: "active", label: "Aktiv", kind: "bool", options: BOOL, ops: BOOL_OPS },
];

/** EUR-Eingabe (auch mit Komma) in Cent-String umrechnen. Leer => "". */
export function eurToCents(input: string): string {
  const n = Number(input.replace(/\s/g, "").replace(",", "."));
  if (!input.trim() || !isFinite(n)) return "";
  return String(Math.round(n * 100));
}
