/* global Excel */

import { fetchOrganization } from "./report";

// ---- Zielfelder ---------------------------------------------------------

export type TargetKey = "input" | "name" | "revenue" | "ebit" | "ebitda" | "year" | "description" | "homepage";

export interface TargetDef {
  key: TargetKey;
  label: string;
  /** input = Quelle (gelesen); alle anderen = Ausgabe (geschrieben). */
  output: boolean;
}

export const TARGETS: TargetDef[] = [
  { key: "input", label: "Firmenname (Input)", output: false },
  { key: "name", label: "Firmenname (vollständig)", output: true },
  { key: "revenue", label: "Revenue", output: true },
  { key: "ebit", label: "EBIT", output: true },
  { key: "ebitda", label: "EBITDA", output: true },
  { key: "year", label: "Geschäftsjahr", output: true },
  { key: "description", label: "Beschreibung", output: true },
  { key: "homepage", label: "Homepage", output: true },
];

/** Stichwörter je Zielfeld für die Header-Erkennung. */
const KEYWORDS: Record<TargetKey, RegExp> = {
  input: /\b(name|unternehmen|firma|company|gesellschaft)\b/i,
  name: /(vollst|offiziell|legal|full\s*name|firmenname)/i,
  revenue: /(revenue|umsatz|erl[öo]s|sales)/i,
  ebit: /\bebit\b/i,
  ebitda: /ebitda/i,
  year: /(gesch[äa]ftsjahr|jahr\b|\byear\b|\bfy\b|\bgj\b)/i,
  description: /(beschreib|description|gegenstand|profil|t[äa]tigkeit|about)/i,
  homepage: /(homepage|website|webseite|\burl\b|\blink\b|internet|web\b)/i,
};

/** Spaltenzuordnung: Index relativ zur Tabelle, oder Sondermarken. */
export const NONE = -1;
export const NEW_COLUMN = -2;

export type Mapping = Record<TargetKey, number>;

export interface TableInfo {
  sheetName: string;
  /** 0-basierter Index der ersten Datenzeile (Kopfzeile + 1). */
  dataStartRow: number;
  startCol: number;
  colCount: number;
  rowCount: number; // Anzahl Datenzeilen (ohne Kopf)
  headers: string[];
  /** Eingelesene Werte der Datenzeilen (rowCount × colCount). */
  dataValues: unknown[][];
  address: string;
}

// ---- Tabelle lesen ------------------------------------------------------

export async function readTable(): Promise<TableInfo> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load("address, values, rowIndex, columnIndex, rowCount, columnCount");
    const sheet = range.worksheet;
    sheet.load("name");
    await context.sync();

    const values = range.values ?? [];
    if (values.length < 2) {
      throw new Error("Bitte eine Tabelle mit Kopfzeile und mindestens einer Datenzeile markieren.");
    }
    const headers = (values[0] ?? []).map((cell) => String(cell ?? "").trim());
    return {
      sheetName: sheet.name,
      dataStartRow: range.rowIndex + 1,
      startCol: range.columnIndex,
      colCount: range.columnCount,
      rowCount: values.length - 1,
      headers,
      dataValues: values.slice(1),
      address: range.address,
    };
  });
}

/** Erkennt je Zielfeld die passende Spalte anhand der Kopfzeile. */
export function detectMapping(headers: string[]): Mapping {
  const used = new Set<number>();
  const find = (re: RegExp): number => {
    const index = headers.findIndex((header, i) => !used.has(i) && re.test(header));
    if (index >= 0) used.add(index);
    return index;
  };

  const mapping = {} as Mapping;
  // Input zuerst (Spalte A bevorzugt), dann der Rest.
  let input = find(KEYWORDS.input);
  if (input < 0) input = 0;
  used.add(input);
  mapping.input = input;

  for (const target of TARGETS) {
    if (target.key === "input") continue;
    const found = find(KEYWORDS[target.key]);
    // Nicht erkannte Ausgabefelder landen in einer neuen Spalte, damit nichts fehlt.
    mapping[target.key] = found >= 0 ? found : NEW_COLUMN;
  }
  return mapping;
}

/** Spaltenbuchstabe(n) für einen 0-basierten Spaltenindex (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index;
  let letter = "";
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

// ---- Daten abrufen ------------------------------------------------------

const FEATURES = ["financial_kpi", "profit_and_loss_account", "website_content"];
const DESCRIPTION_MAX = 600;
const WEB_SUMMARY_MAX = 320;

// Credit-Kosten je Feature – Spiegelung der Proxy-Logik (usage.ts: creditCost).
// Pro Firma gilt: max(5, Summe der angefragten Feature-Credits).
const FEATURE_CREDITS: Record<string, number> = {
  financial_kpi: 1,
  balance_sheet_accounts: 3,
  profit_and_loss_account: 3,
  related_persons: 2,
  publications: 1,
  news: 10,
  insolvency_publications: 1,
  shareholders: 5,
  ubos: 10,
  shareholdings: 5,
  website_content: 0,
};

/** Credits pro Firma für den Erkennen-Request (mind. 5). */
export const FILL_CREDITS_PER_COMPANY = Math.max(
  5,
  FEATURES.reduce((sum, feature) => sum + (FEATURE_CREDITS[feature] ?? 0), 0)
);

/**
 * Schätzt die Kosten des Erkennen-Laufs für die aktuelle Auswahl:
 * Anzahl nicht-leerer Firmen in der Input-Spalte × Credits pro Firma.
 */
export function estimateFillCredits(table: TableInfo, mapping: Mapping): { companies: number; credits: number } {
  const companies = table.dataValues
    .map((row) => String(row[mapping.input] ?? "").trim())
    .filter(Boolean).length;
  return { companies, credits: companies * FILL_CREDITS_PER_COMPANY };
}

export interface RowResult {
  name: string;
  revenue: number | null;
  ebit: number | null;
  /** Hinweis, falls EBIT nicht berechenbar war. */
  ebitNote: string;
  ebitda: number | null;
  /** Hinweis, falls EBITDA nicht berechenbar war (z. B. „fehlt: AfA"). */
  ebitdaNote: string;
  year: number | null;
  description: string;
  homepage: string;
}

type JsonRecord = Record<string, unknown>;

export interface FillProgress {
  done: number;
  total: number;
  company: string;
}

export interface FillSummary {
  filled: number;
  failed: { company: string; error: string }[];
}

/**
 * Liest die Firmen aus der Input-Spalte, ruft je Firma die Daten ab, berechnet
 * die Zielwerte und schreibt sie in die zugeordneten (ggf. neuen) Spalten.
 */
export async function fillTable(
  table: TableInfo,
  mapping: Mapping,
  onProgress?: (p: FillProgress) => void
): Promise<FillSummary> {
  const inputCol = mapping.input;
  const companies = table.dataValues.map((row) => String(row[inputCol] ?? "").trim());
  const total = companies.filter(Boolean).length;

  const results: (RowResult | null)[] = [];
  const failed: { company: string; error: string }[] = [];
  let done = 0;

  for (const company of companies) {
    if (!company) {
      results.push(null);
      continue;
    }
    try {
      const data = await fetchOrganization(company, FEATURES, { aiSearch: true });
      results.push(extractRow(data));
    } catch (err) {
      results.push(null);
      failed.push({ company, error: (err as Error).message });
    }
    done += 1;
    onProgress?.({ done, total, company });
  }

  await writeResults(table, mapping, results);
  return { filled: results.filter(Boolean).length, failed };
}

function extractRow(data: unknown): RowResult {
  const d = asRecord(data);
  const { revenue, year, netIncome } = latestKpi(d.financial_kpi);
  const pl = plLineMap(d.profit_and_loss_account, year);
  const hasFinancials = pl.size > 0 || revenue !== null || netIncome !== null;
  const { ebit, ebitda } = computeFinancials(pl, netIncome, hasFinancials);
  return {
    name: firstString(d.name, asRecord(d.name).name),
    revenue,
    ebit: ebit.value,
    ebitNote: ebit.note,
    ebitda: ebitda.value,
    ebitdaNote: ebitda.note,
    year,
    description: buildDescription(d),
    homepage: extractHomepage(d),
  };
}

/** Neuester Umsatz, Geschäftsjahr und Jahresüberschuss aus financial_kpi. */
function latestKpi(kpi: unknown): { revenue: number | null; year: number | null; netIncome: number | null } {
  let best = { revenue: null as number | null, year: null as number | null, netIncome: null as number | null };
  for (const item of asArray(kpi)) {
    const r = asRecord(item);
    const year = toYear(r.year ?? r.date);
    if (year === null) continue;
    if (best.year === null || year > best.year) {
      best = {
        revenue: toNumber(r.revenue ?? r.pl_revenue ?? r.sales),
        year,
        netIncome: toNumber(r.net_income ?? r.netincome ?? r.profit),
      };
    }
  }
  return best;
}

/**
 * Flacht die GuV des Zieljahres (sonst des neuesten Jahres) in eine Map ab
 * (Label klein → Wert). Reale Struktur von handelsregister.ai:
 * [{ year, profit_and_loss_accounts: [{ name: {de,en,in_report}, value, children }] }]
 */
function plLineMap(pl: unknown, year: number | null): Map<string, number> {
  const items = asArray(pl);
  let chosen: JsonRecord | null = null;
  let chosenYear: number | null = null;
  for (const item of items) {
    const r = asRecord(item);
    const y = toYear(r.year ?? r.date ?? r.report_end_date);
    if (year !== null && y === year) {
      chosen = r;
      break;
    }
    if (chosenYear === null || (y !== null && y > chosenYear)) {
      chosen = r;
      chosenYear = y;
    }
  }

  const map = new Map<string, number>();
  if (!chosen) return map;
  const walk = (arr: unknown): void => {
    for (const item of asArray(arr)) {
      const r = asRecord(item);
      const nm = asRecord(r.name);
      const label = String(nm.de ?? nm.in_report ?? r.name ?? "")
        .toLowerCase()
        .trim();
      const value = toNumber(r.value);
      if (label && value !== null && !map.has(label)) map.set(label, value);
      walk(r.children);
    }
  };
  walk(chosen.profit_and_loss_accounts);
  return map;
}

interface Metric {
  value: number | null;
  note: string;
}

/**
 * EBIT und EBITDA, jeweils hybrid:
 *  1) fertige `EBIT`/`EBITDA`-Zeile der API;
 *  2) sonst Formel — EBIT = Jahresüberschuss + Zinsaufwand + Steuern,
 *     EBITDA = EBIT-Komponenten + Abschreibungen;
 *  3) sonst null mit Hinweis, was genau fehlt.
 */
function computeFinancials(
  pl: Map<string, number>,
  netIncomeKpi: number | null,
  hasFinancials: boolean
): { ebit: Metric; ebitda: Metric } {
  const directEbit = pickFrom(pl, /^ebit$/);
  const directEbitda = pickFrom(pl, /^ebitda$/, /normiert|berichtigt/);
  const noData = !pl.size && !hasFinancials;

  // Komponenten anhand der realen API-Labels.
  const netIncome = netIncomeKpi ?? pickFrom(pl, /jahres[üu]berschuss\/jahresfehlbetrag|^jahres[üu]berschuss$/);
  const interest = pickFrom(pl, /zinsaufwand|zinsen und ähnliche aufwendungen/);
  const taxes = pickFrom(pl, /steuerr[üu]ckstellung|steuern vom einkommen/, /steuersatz|steuerwirkung/);
  const depreciation = pickFrom(pl, /abschreibung|depreciation|amorti[sz]ation/);

  const base: [string, number | null][] = [
    ["Jahresüberschuss", netIncome],
    ["Zinsaufwand", interest],
    ["Steuern", taxes],
  ];

  const ebit = metric(directEbit, noData, base, () => netIncome! + Math.abs(interest!) + Math.abs(taxes!));
  const ebitda = metric(
    directEbitda,
    noData,
    [...base, ["AfA", depreciation]],
    () => netIncome! + Math.abs(interest!) + Math.abs(taxes!) + Math.abs(depreciation!)
  );
  return { ebit, ebitda };
}

/** Hybrid-Auswertung einer Kennzahl: direkte Zeile → Formel → Diagnose. */
function metric(
  direct: number | null,
  noData: boolean,
  components: [string, number | null][],
  formula: () => number
): Metric {
  if (direct !== null) return { value: direct, note: "" };
  if (noData) return { value: null, note: "keine GuV veröffentlicht" };
  const missing = components.filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length) return { value: null, note: `fehlt: ${missing.join(", ")}` };
  return { value: formula(), note: "" };
}

function pickFrom(map: Map<string, number>, match: RegExp, exclude?: RegExp): number | null {
  for (const [label, value] of map) {
    if (exclude && exclude.test(label)) continue;
    if (match.test(label)) return value;
  }
  return null;
}

/** Beschreibung = Unternehmensgegenstand + gekürzte KI-Website-Zusammenfassung. */
function buildDescription(d: JsonRecord): string {
  const purpose = extractPurpose(d.purpose);
  const web = summarizeWebsite(d.website_content);
  const parts = [purpose, web].filter(Boolean);
  return parts.join(" — ").slice(0, DESCRIPTION_MAX).trim();
}

function extractPurpose(purpose: unknown): string {
  if (typeof purpose === "string") return purpose.trim();
  const p = asRecord(purpose);
  return firstString(p.purpose, p.text, p.de, p.value);
}

function summarizeWebsite(content: unknown): string {
  let text = "";
  if (typeof content === "string") text = content;
  else {
    const c = asRecord(content);
    text = firstString(c.content, c.markdown, c.text, c.summary, c.description);
    if (!text && Array.isArray(content)) text = content.map((x) => String(x ?? "")).join(" ");
  }
  if (!text) return "";
  // Markdown grob entfernen, Whitespace glätten.
  const plain = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // Links/Bilder → Text
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > WEB_SUMMARY_MAX ? `${plain.slice(0, WEB_SUMMARY_MAX).trim()}…` : plain;
}

function extractHomepage(d: JsonRecord): string {
  const contact = asRecord(d.contact_data);
  return firstString(contact.website, contact.website_url, d.website, d.website_url);
}

// ---- Ergebnisse schreiben ----------------------------------------------

async function writeResults(table: TableInfo, mapping: Mapping, results: (RowResult | null)[]): Promise<void> {
  // Neue Spalten (NEW_COLUMN) rechts an die Tabelle anhängen.
  const newColAssignments = new Map<TargetKey, number>();
  let nextNewCol = table.startCol + table.colCount;
  for (const target of TARGETS) {
    if (target.output && mapping[target.key] === NEW_COLUMN) {
      newColAssignments.set(target.key, nextNewCol);
      nextNewCol += 1;
    }
  }

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(table.sheetName);

    for (const target of TARGETS) {
      if (!target.output) continue;
      const choice = mapping[target.key];
      if (choice === NONE) continue;

      const absCol = choice === NEW_COLUMN ? newColAssignments.get(target.key)! : table.startCol + choice;

      // Kopfzelle für neue Spalten beschriften.
      if (choice === NEW_COLUMN) {
        const head = sheet.getRangeByIndexes(table.dataStartRow - 1, absCol, 1, 1);
        head.values = [[target.label]];
        head.format.font.bold = true;
      }

      const column = results.map((r) => [valueFor(target.key, r)]);
      const dataRange = sheet.getRangeByIndexes(table.dataStartRow, absCol, results.length, 1);
      dataRange.values = column;

      const fmt = numberFormatFor(target.key);
      if (fmt) dataRange.numberFormat = results.map(() => [fmt]);
    }

    // Spaltenbreite bewusst NICHT anpassen (kein autofitColumns) – die vom
    // Nutzer eingestellten Breiten bleiben beim Erkennen unverändert.
    // Nur für die Beschreibungs-Spalte den Zeilenumbruch deaktivieren, damit
    // langer Text das Layout (Zeilenhöhe) nicht aufbläht.
    let descCol: number | null = null;
    if (mapping.description !== NONE) {
      descCol =
        mapping.description === NEW_COLUMN
          ? newColAssignments.get("description") ?? null
          : table.startCol + mapping.description;
    }
    if (descCol !== null) {
      const descRange = sheet.getRangeByIndexes(table.dataStartRow - 1, descCol, results.length + 1, 1);
      descRange.format.wrapText = false;
    }
    await context.sync();
  });
}

function valueFor(key: TargetKey, r: RowResult | null): string | number {
  if (!r) return "";
  switch (key) {
    case "name":
      return r.name;
    case "revenue":
      return r.revenue ?? "";
    case "ebit":
      return r.ebit ?? r.ebitNote;
    case "ebitda":
      return r.ebitda ?? r.ebitdaNote;
    case "year":
      return r.year ?? "";
    case "description":
      return r.description;
    case "homepage":
      return r.homepage;
    default:
      return "";
  }
}

function numberFormatFor(key: TargetKey): string | null {
  if (key === "revenue" || key === "ebit" || key === "ebitda") return "#,##0";
  if (key === "year") return "0";
  return null;
}

// ---- Helfer -------------------------------------------------------------

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(num) && value.trim() !== "") return num;
  }
  return null;
}

function toYear(value: unknown): number | null {
  if (typeof value === "number" && value > 1900 && value < 3000) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d{4})/);
    if (match) return Number(match[1]);
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
