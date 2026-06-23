// Katalog aller OpenRegister-Endpunkte für den API-Explorer im Dev-Panel.
// Einzige Quelle der Wahrheit: Das Panel rendert UI + Calls aus diesen Defs.
// Jede `build`-Funktion erzeugt den proxy-relativen Pfad (und ggf. POST-Body).

import { COMPANY_FILTER_FIELDS, PERSON_FILTER_FIELDS, type FilterFieldDef } from "./filters";

const enc = encodeURIComponent;

export type FieldType = "text" | "number" | "bool" | "textarea";

export interface EndpointParam {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: string[]; // Für Select-Dropdowns
}

export interface BuiltRequest {
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}

/** Konfiguration für Endpunkte mit dem interaktiven Filter-Builder. */
export interface SearchConfig {
  path: string; // proxy-relativer POST-Pfad
  fields: FilterFieldDef[]; // filterbare Felder
  location: boolean; // Umkreissuche anbieten?
}

export interface SelectableField {
  key: string; // z.B. "natural_person", "percentage_share"
  label: string; // z.B. "Natural Person", "Percentage Share"
}

export interface EndpointDef {
  id: string;
  group: string;
  label: string;
  method: "GET" | "POST";
  credits: string;
  description: string;
  params: EndpointParam[];
  /** Was die Antwort enthält (zur Orientierung, ohne Call). */
  fields: string[];
  /** Baut Pfad + Body aus den Eingabewerten (nur Nicht-Such-Endpunkte). */
  build?: (v: Record<string, string | boolean>) => BuiltRequest;
  /** Wenn gesetzt: rendert den Filter-Builder statt einfacher Parameter. */
  search?: SearchConfig;
  /** Wählbare Felder für die Antwort-Filterung (Client-seitig). */
  selectableFields?: SelectableField[];
}

const str = (v: Record<string, string | boolean>, k: string): string => String(v[k] ?? "").trim();
const flag = (v: Record<string, string | boolean>, k: string): boolean => v[k] === true;

/** Baut den Query-String für gesetzte Bool-Flags. */
function flagQuery(v: Record<string, string | boolean>, names: string[]): string {
  const parts = names.filter((n) => flag(v, n)).map((n) => `${n}=true`);
  return parts.length ? `&${parts.join("&")}` : "";
}

const COMPANY_ID: EndpointParam = {
  name: "company_id",
  label: "company_id",
  type: "text",
  required: true,
  placeholder: "DE-HRB-F1103-267645",
  hint: "Aus der Firmensuche oben (Treffer anklicken füllt dieses Feld).",
};

const PERSON_ID: EndpointParam = {
  name: "person_id",
  label: "person_id",
  type: "text",
  required: true,
  placeholder: "cc78ab54-d958-49b8-bae7-2f6c0c308837",
};

export const ENDPOINTS: EndpointDef[] = [
  // ---- Suche ----
  {
    id: "autocomplete",
    group: "Suche",
    label: "Firmensuche (Autocomplete)",
    method: "GET",
    credits: "1",
    description: "Firmen per Name finden – liefert die company_id für alle weiteren Calls.",
    params: [{ name: "query", label: "Firmenname", type: "text", required: true, placeholder: "z. B. Trade Republic" }],
    fields: [
      "results[]: company_id, name, country, register_number, register_type, register_court, active, legal_form",
    ],
    build: (v) => ({ method: "GET", path: `/autocomplete?query=${enc(str(v, "query"))}` }),
  },
  {
    id: "search-company",
    group: "Suche",
    label: "Erweiterte Firmensuche (Filter)",
    method: "POST",
    credits: "10",
    description: "Firmen nach Kriterien filtern: Rechtsform, Ort, Finanzkennzahlen, Eigentümerstruktur … Alle Filter werden mit UND verknüpft.",
    params: [],
    fields: [
      "results[]: company_id, name, country, register_*, active, legal_form",
      "pagination: page, per_page, total_pages, total_results",
    ],
    search: { path: "/search/company", fields: COMPANY_FILTER_FIELDS, location: true },
  },
  {
    id: "lookup",
    group: "Suche",
    label: "Firma per Website-URL",
    method: "GET",
    credits: "10",
    description: "Findet die Firma zu einer Website-Adresse.",
    params: [{ name: "url", label: "Website-URL", type: "text", required: true, placeholder: "https://example.de" }],
    fields: ["company_id, email, phone, vat_id"],
    build: (v) => ({ method: "GET", path: `/lookup?url=${enc(str(v, "url"))}` }),
  },

  // ---- Firma ----
  {
    id: "company",
    group: "Firma",
    label: "Firmendaten (Stammdaten + Kennzahlen)",
    method: "GET",
    credits: "10 (+10 mit realtime)",
    description: "Vollständige Stammdaten, Historie, Vertretung, Finanzkennzahlen und Dokumentenliste.",
    params: [
      COMPANY_ID,
      { name: "realtime", label: "realtime (live aus Handelsregister, +10 Credits)", type: "bool" },
      { name: "export", label: "export (ohne Quellenangaben)", type: "bool" },
    ],
    fields: [
      "id, status, legal_form, lei, incorporated_at, notarized_at, terminated_at",
      "name (+ names[]), address (+ addresses[]), capital (+ capitals[]), purpose (+ purposes[])",
      "register (+ registers[]), representation[], contact, industry_codes",
      "indicators[]: revenue, net_income, balance_sheet_total, equity, employees, … (je Jahr)",
      "documents[], sources[]",
    ],
    build: (v) => ({
      method: "GET",
      path: `/company?company_id=${enc(str(v, "company_id"))}${flagQuery(v, ["realtime", "export"])}`,
    }),
  },
  {
    id: "financials",
    group: "Firma",
    label: "Bilanz / GuV (Financials)",
    method: "GET",
    credits: "10",
    description: "Strukturierte Bilanz (Aktiva/Passiva) und Gewinn- und Verlustrechnung über mehrere Jahre.",
    params: [COMPANY_ID],
    fields: [
      "reports[]: report_id, consolidated, report_start_date, report_end_date",
      "merged.aktiva / merged.passiva / merged.guv → rows[] (Baum)",
      "row: name, formatted_name, values{ report_end_date: number }, children[]",
    ],
    build: (v) => ({ method: "GET", path: `/financials?company_id=${enc(str(v, "company_id"))}` }),
  },
  {
    id: "company-contact",
    group: "Firma",
    label: "Kontaktdaten (veraltet)",
    method: "GET",
    credits: "10",
    description: "Veraltet – Kontaktdaten stecken bereits in den Firmendaten. Nur zur Vollständigkeit.",
    params: [COMPANY_ID],
    fields: ["source_url, email, phone, vat_id"],
    build: (v) => ({ method: "GET", path: `/company/contact?company_id=${enc(str(v, "company_id"))}` }),
  },

  // ---- Eigentümer / Beteiligungen ----
  {
    id: "company-owners",
    group: "Eigentümer",
    label: "Gesellschafter (Owners)",
    method: "GET",
    credits: "10 (20 mit realtime)",
    description: "Aktuelle Gesellschafter/Anteilseigner mit Anteilen – Basis für ein Beteiligungs-Organigramm.",
    params: [
      COMPANY_ID,
      { name: "realtime", label: "realtime (live, +Credits)", type: "bool" },
      { name: "export", label: "export (keine neuen Dokumente verarbeiten)", type: "bool" },
      { name: "best_available", label: "best_available (beste verfügbaren Daten, v.a. AG/SE)", type: "bool" },
    ],
    fields: [
      "company_id, best_available",
      "owners[]: type (natural_person|legal_person), relation_type, name, nominal_share, percentage_share, start",
      "owners[].natural_person: full_name, first_name, last_name, date_of_birth, city, country",
      "owners[].legal_person: name, city, country",
      "sources[]: document_url",
    ],
    build: (v) => ({
      method: "GET",
      path:
        `/company/owners?company_id=${enc(str(v, "company_id"))}` +
        flagQuery(v, ["realtime", "export", "best_available"]),
    }),
  },
  {
    id: "company-ubo",
    group: "Eigentümer",
    label: "Wirtschaftlich Berechtigte (UBO)",
    method: "GET",
    credits: "25",
    description: "Ultimate Beneficial Owners – die wirtschaftlich Berechtigten hinter der Firma.",
    params: [COMPANY_ID],
    fields: [
      "company_id",
      "ubos[]: name, percentage_share, max_percentage_share",
      "ubos[].natural_person: full_name, first_name, last_name, date_of_birth, city, country",
      "ubos[].legal_person: name, city, country",
    ],
    build: (v) => ({ method: "GET", path: `/company/ubo?company_id=${enc(str(v, "company_id"))}` }),
    selectableFields: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "natural_person", label: "Natural Person (Name, Geburt, Adresse)" },
      { key: "legal_person", label: "Legal Person (Firmenname, Adresse)" },
      { key: "percentage_share", label: "Percentage Share (%)" },
      { key: "max_percentage_share", label: "Max Percentage Share (%)" },
    ],
  },
  {
    id: "company-holdings",
    group: "Eigentümer",
    label: "Beteiligungen der Firma (Holdings)",
    method: "GET",
    credits: "10",
    description: "An welchen anderen Firmen diese Firma selbst beteiligt ist.",
    params: [COMPANY_ID],
    fields: [
      "company_id",
      "holdings[]: company_id, name, relation_type, nominal_share, percentage_share, start, end",
    ],
    build: (v) => ({ method: "GET", path: `/company/holdings?company_id=${enc(str(v, "company_id"))}` }),
  },
  {
    id: "company-historical-owners",
    group: "Eigentümer",
    label: "Frühere Eigentümer (historisch)",
    method: "GET",
    credits: "10",
    description: "Eigentümer-Historie inkl. Anteilsänderungen. Hinweis: 202 = wird verarbeitet, später erneut laden.",
    params: [COMPANY_ID],
    fields: [
      "owners[]: id, name, entity_type, country, status, first_appearance, last_appearance",
      "owners[].ownership_history[]: document_id, document_date, nominal_shares, percentage_shares",
    ],
    build: (v) => ({ method: "GET", path: `/company/historical-owners?company_id=${enc(str(v, "company_id"))}` }),
  },

  // ---- Person ----
  {
    id: "person",
    group: "Person",
    label: "Persondaten",
    method: "GET",
    credits: "10",
    description: "Stammdaten einer Person inkl. aller Management-Positionen.",
    params: [PERSON_ID],
    fields: [
      "id, first_name, last_name, date_of_birth, age, city",
      "management_positions[]: register_id, company_name, role, start_date, end_date",
    ],
    build: (v) => ({ method: "GET", path: `/person?person_id=${enc(str(v, "person_id"))}` }),
  },
  {
    id: "person-holdings",
    group: "Person",
    label: "Beteiligungen einer Person",
    method: "GET",
    credits: "10",
    description: "An welchen Firmen eine Person beteiligt ist.",
    params: [PERSON_ID],
    fields: [
      "person_id",
      "holdings[]: company_id, name, relation_type, nominal_share, percentage_share, start, end",
    ],
    build: (v) => ({ method: "GET", path: `/person/holdings?person_id=${enc(str(v, "person_id"))}` }),
  },
  {
    id: "search-person",
    group: "Person",
    label: "Personensuche (Filter)",
    method: "POST",
    credits: "10",
    description: "Personen per Name suchen, optional gefiltert nach Geburtsdatum, Stadt oder Aktivität.",
    params: [],
    fields: [
      "results[]: id, name, city, date_of_birth, active",
      "pagination: page, per_page, total_pages, total_results",
    ],
    search: { path: "/search/person", fields: PERSON_FILTER_FIELDS, location: false },
  },

  // ---- Dokumente ----
  {
    id: "document-realtime",
    group: "Dokumente",
    label: "Offizielles Dokument (Realtime)",
    method: "GET",
    credits: "10",
    description: "Rufe offizielle Handelsregisterdokumente in Echtzeit ab: Auszüge, Satzungen, Gesellschafterlisten oder strukturierte Daten (XML).",
    params: [
      COMPANY_ID,
      {
        name: "document_category",
        label: "Dokumenttyp",
        type: "text",
        required: true,
        hint: "Wähle den gewünschten Dokumenttyp",
        options: [
          "current_printout",
          "chronological_printout",
          "historical_printout",
          "structured_information",
          "shareholder_list",
          "articles_of_association",
        ],
      },
    ],
    fields: [
      "url (PDF/XML-Download-Link zum Dokument)",
      "category (Dokumenttyp wie gewählt)",
      "file_date (Datum der Dokumenterstellung)",
      "file_name (Originalname der Datei)",
    ],
    build: (v) => ({
      method: "GET",
      path: `/document?company_id=${enc(str(v, "company_id"))}&document_category=${enc(str(v, "document_category"))}`,
    }),
  },
];
