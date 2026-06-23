// Typen für die OpenRegister-Antworten (Teilmenge der relevanten Felder).
// Stand: verifiziert gegen https://docs.openregister.de

// ---- Autocomplete -------------------------------------------------------
export interface AutocompleteResult {
  company_id: string;
  name: string;
  country: string | null;
  register_number: string;
  register_type: "HRB" | "HRA" | "PR" | "GnR" | "VR" | string;
  register_court: string;
  active: boolean;
  legal_form: string;
}

export interface AutocompleteResponse {
  results: AutocompleteResult[];
}

// ---- Financials ---------------------------------------------------------
// Knoten im "merged"-Baum: Werte je Berichtsenddatum (report_end_date).
export interface MergedRow {
  name: string;
  formatted_name: string;
  values: Record<string, number | null>;
  children?: MergedRow[];
}

export interface MergedSection {
  rows: MergedRow[];
}

export interface FinancialsResponse {
  reports?: Array<{
    report_id: string;
    consolidated: boolean;
    report_start_date: string;
    report_end_date: string;
  }>;
  merged?: {
    aktiva?: MergedSection;
    passiva?: MergedSection;
    guv?: MergedSection;
  };
}

// ---- Company (Stammdaten & Kennzahlen) ----------------------------------
// Nur die für das Layout genutzten Felder; der Rest bleibt offen (index).
export interface CompanyName {
  name?: string;
}
export interface CompanyAddress {
  formatted_value?: string;
  street?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
}
export interface CompanyCapital {
  amount?: number;
  currency?: string;
}
export interface CompanyRepresentative {
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

// Kennzahlen pro Jahr. Monetäre Werte in Cent (kleinste Währungseinheit).
export interface CompanyIndicator {
  date: string; // YYYY-MM-DD
  report_id?: string;
  balance_sheet_total?: number | null;
  net_income?: number | null;
  revenue?: number | null;
  cash?: number | null;
  employees?: number | null;
  equity?: number | null;
  real_estate?: number | null;
  materials?: number | null;
  pension_provisions?: number | null;
  salaries?: number | null;
  taxes?: number | null;
  liabilities?: number | null;
  capital_reserves?: number | null;
  active_accruals?: number | null;
  passive_accruals?: number | null;
}

export interface CompanyPurpose {
  purpose?: string;
  start_date?: string;
}
export interface CompanyRegister {
  register_number?: string;
  register_type?: string;
  register_court?: string;
}
export interface CompanyContact {
  email?: string;
  phone?: string;
  vat_id?: string;
  website_url?: string;
}

export interface CompanyResponse {
  id?: string;
  status?: string;
  name?: CompanyName;
  address?: CompanyAddress;
  capital?: CompanyCapital;
  legal_form?: string;
  representation?: CompanyRepresentative[];
  incorporated_at?: string;
  notarized_at?: string | null;
  terminated_at?: string | null;
  purpose?: CompanyPurpose | null;
  register?: CompanyRegister;
  lei?: string;
  contact?: CompanyContact | null;
  indicators?: CompanyIndicator[];
  industry_codes?: { WZ2025?: Array<{ code: string }> };
  [key: string]: unknown;
}

// ---- Add-in-interne Modelle --------------------------------------------
export type DataBlock = "aktiva" | "passiva" | "guv" | "kennzahlen" | "stammdaten";

export interface LoadOptions {
  blocks: Set<DataBlock>;
  years: number[]; // gewählte Geschäftsjahre, z. B. [2024, 2023, 2022]
}

export interface CompanyData {
  inputName: string;
  companyId?: string;
  matchedName?: string;
  financials?: FinancialsResponse;
  company?: CompanyResponse;
  error?: string;
  status: "ok" | "not_found" | "error";
}
