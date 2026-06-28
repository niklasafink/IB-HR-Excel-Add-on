/* global Excel, fetch, Response, localStorage, AbortController, setTimeout, clearTimeout */

import { featureByKey } from "./features";
import { buildExcelModel, type ExcelCell, type ExcelModel, type ExcelTable } from "./excelModel";

declare const process: { env: { PROXY_BASE_URL?: string } };

const DEFAULT_PROXY_BASE_URL = process.env.PROXY_BASE_URL || "https://localhost:3001/api";
const PROXY_KEY = "gordon.proxyUrl";
const USER_TOKEN_KEY = "gordon.userToken";

/** Features mit einer Zeit-/Jahres-Dimension – nur dort ist der Jahr-Filter sinnvoll. */
export const YEAR_FEATURES = new Set<string>([
  "financial_kpi",
  "balance_sheet_accounts",
  "profit_and_loss_account",
]);

export type TargetMode = "per-company" | "combined";

export interface ReportOptions {
  yearFrom: number | null;
  yearTo: number | null;
  target: TargetMode;
  /** KI-Suche aktivieren (genauere Treffer + Website, höhere Credits). */
  aiSearch?: boolean;
  /** Echtzeitdaten aus dem Handelsregister. */
  realtime?: boolean;
}

export interface ReportSummary {
  featureLabel: string;
  requested: number;
  written: { company: string; sheet: string; rows: number }[];
  failed: { company: string; error: string }[];
  firstSheet: string | null;
}

type JsonRecord = Record<string, unknown>;

/**
 * Ruft für jede übergebene Firma das gewählte Feature ab (über den Proxy),
 * filtert optional nach Jahr und schreibt das Ergebnis nach Excel –
 * je nach Modus pro Firma ein eigenes Blatt oder alles in ein kombiniertes Blatt.
 */
export async function generateReports(
  featureKey: string,
  companies: string[],
  options: ReportOptions
): Promise<ReportSummary> {
  const feature = featureByKey(featureKey);
  const summary: ReportSummary = {
    featureLabel: feature.shortLabel,
    requested: companies.length,
    written: [],
    failed: [],
    firstSheet: null,
  };
  if (!companies.length) return summary;

  const usedNames = await loadSheetNames();

  // Phase 1: Daten je Firma abrufen + Modell bauen.
  const sections: { company: string; model: ExcelModel; rows: number }[] = [];
  for (const company of companies) {
    try {
      const raw = await fetchFeature(company, feature.key, { aiSearch: options.aiSearch, realtime: options.realtime });
      const filtered = applyYearFilter(feature.key, raw, options);
      const model = buildExcelModel(feature.key, filtered);
      const rows = model.tables.reduce((sum, table) => sum + table.rows.length, 0);
      sections.push({ company, model, rows });
    } catch (err) {
      summary.failed.push({ company, error: (err as Error).message });
    }
  }
  if (!sections.length) return summary;

  // Phase 2: Schreiben.
  if (options.target === "combined") {
    const name = uniqueSheetName(`${feature.shortLabel} · Report`, usedNames);
    await writeCombinedSheet(name, feature.shortLabel, sections);
    summary.firstSheet = name;
    for (const section of sections) {
      summary.written.push({ company: section.company, sheet: name, rows: section.rows });
    }
  } else {
    // Ein Blatt pro Firma: Reports derselben Firma werden im selben Tab
    // untereinander gesammelt (people → Bilanz → GuV …). Das Blatt wird nach
    // der Firma benannt, sodass spätere Reports daran angehängt werden.
    for (const section of sections) {
      const name = safeSheetName(section.company);
      await appendCompanyReport(name, section.company, feature.shortLabel, section.model, summary.firstSheet === null);
      if (summary.firstSheet === null) summary.firstSheet = name;
      summary.written.push({ company: section.company, sheet: name, rows: section.rows });
    }
  }

  return summary;
}

/** Liest die aktuell in Excel markierten Firmennamen (alle nicht-leeren Zellen, dedupliziert). */
export async function readSelectedCompanies(): Promise<string[]> {
  try {
    return await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("values");
      await context.sync();

      const companies: string[] = [];
      const seen = new Set<string>();
      for (const row of range.values ?? []) {
        for (const cell of row) {
          const cellText = String(cell ?? "").trim();
          if (cellText && !seen.has(cellText.toLowerCase())) {
            seen.add(cellText.toLowerCase());
            companies.push(cellText);
          }
        }
      }
      return companies;
    });
  } catch {
    return [];
  }
}

async function loadSheetNames(): Promise<Set<string>> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    sheets.load("items/name");
    await context.sync();
    return new Set<string>(sheets.items.map((sheet) => sheet.name.toLowerCase()));
  });
}

export interface FetchFlags {
  /** KI-Suche: genauere Treffer + befüllt website_content/Homepage (höhere Credits). */
  aiSearch?: boolean;
  /** Echtzeitdaten direkt aus dem Handelsregister. */
  realtime?: boolean;
}

function organizationUrl(query: string, features: string[], flags: FetchFlags): string {
  const params = new URLSearchParams({ q: query });
  for (const feature of features) params.append("feature", feature);
  if (flags.aiSearch) params.set("ai_search", "true");
  if (flags.realtime) params.set("realtime", "true");
  return `${proxyBaseUrl()}/organization?${params.toString()}`;
}

async function fetchOrgRaw(query: string, features: string[], flags: FetchFlags): Promise<unknown> {
  // KI-Suche (Website-Scraping + Auswertung) dauert beim Upstream deutlich
  // länger – dafür großzügigeres Timeout, ansonsten Standard.
  const timeoutMs = flags.aiSearch ? 120000 : 30000;
  const res = await fetchWithTimeout(organizationUrl(query, features, flags), timeoutMs);
  const body = await safeJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(body) || `Proxy-Fehler (${res.status})`);
  }
  return body;
}

/**
 * Übersetzt einen Add-in-Feature-Key in die tatsächliche API-Anfrage.
 * - `company_details`: kein Feature-Flag (Stammdaten kommen immer mit), aber
 *   KI-Suche für Website/genauere Treffer.
 * - `website_content` (KI) benötigt zwingend ai_search, sonst ist es leer.
 */
function featureRequest(featureKey: string, flags: FetchFlags): { features: string[]; flags: FetchFlags } {
  if (featureKey === "company_details") {
    return { features: ["website_content"], flags: { ...flags, aiSearch: true } };
  }
  if (featureKey === "website_content") {
    return { features: ["website_content"], flags: { ...flags, aiSearch: true } };
  }
  return { features: [featureKey], flags };
}

async function fetchFeature(query: string, featureKey: string, flags: FetchFlags = {}): Promise<unknown> {
  const req = featureRequest(featureKey, flags);
  return fetchOrgRaw(query, req.features, req.flags);
}

/**
 * Ruft eine Organisation mit mehreren Features in einem Request ab und gibt die
 * rohe Proxy-Antwort zurück. Genutzt vom „Erkennen"-Workflow (lib/detect.ts).
 */
export async function fetchOrganization(
  query: string,
  features: string[],
  flags: FetchFlags = {}
): Promise<unknown> {
  return fetchOrgRaw(query, features, flags);
}

/**
 * fetch mit Timeout (Standard 30s) – verhindert endlos hängende Anfragen.
 *
 * WICHTIG: Kein AbortController/`signal`. Die Office-WebView auf dem Mac
 * (WKWebView) lässt jeden fetch mit angehängtem `signal` mit „Load failed“
 * fehlschlagen, selbst wenn der Server normal antwortet. Deshalb wird das
 * Timeout über `Promise.race` realisiert (der fetch läuft im Hintergrund aus).
 */
async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = userToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)}s – die Abfrage hat zu lange gedauert.`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([fetch(url, { headers }), timeout]);
  } catch (err) {
    const e = err as Error;
    // Office-WebView (Mac/WebKit) meldet fehlgeschlagene Requests häufig nur als
    // generisches „Load failed“ – verständlicher machen.
    if (/load failed|failed to fetch|networkerror/i.test(e.message)) {
      throw new Error("Verbindung fehlgeschlagen (Netzwerkfehler oder Timeout). Proxy-Adresse prüfen und erneut versuchen.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface UsageInfo {
  /** Restguthaben laut handelsregister.ai (oder null, falls noch unbekannt). */
  creditsRemaining: number | null;
  /** Bislang über den Proxy verbrauchte Credits. */
  totalCredits: number;
}

/** Holt den aktuellen Credit-Stand vom Proxy (für die Anzeige im Kopfbereich). */
export async function fetchUsage(): Promise<UsageInfo | null> {
  try {
    const res = await fetchWithTimeout(`${proxyBaseUrl()}/usage`, 10000);
    if (!res.ok) return null;
    const body = (await res.json()) as { creditsRemaining?: unknown; totalCredits?: unknown };
    return {
      creditsRemaining: typeof body.creditsRemaining === "number" ? body.creditsRemaining : null,
      totalCredits: typeof body.totalCredits === "number" ? body.totalCredits : 0,
    };
  } catch {
    return null;
  }
}

/** Filtert das Feature-Array client-seitig auf den Jahresbereich [yearFrom, yearTo]. */
function applyYearFilter(featureKey: string, response: unknown, options: ReportOptions): unknown {
  const { yearFrom, yearTo } = options;
  if ((yearFrom === null && yearTo === null) || !YEAR_FEATURES.has(featureKey)) return response;

  const root = asRecord(response);
  const value = root[featureKey];
  if (!Array.isArray(value)) return response;

  const filtered = value.filter((item) => {
    const year = detectYear(item);
    if (year === null) return true; // unbekanntes Jahr nicht verwerfen
    if (yearFrom !== null && year < yearFrom) return false;
    if (yearTo !== null && year > yearTo) return false;
    return true;
  });
  return { ...root, [featureKey]: filtered };
}

function detectYear(item: unknown): number | null {
  const record = asRecord(item);
  const keys = ["year", "date", "report_end_date", "fiscal_year_end", "published_at", "publication_date", "published"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && value > 1900 && value < 3000) return value;
    if (typeof value === "string") {
      const match = value.match(/(\d{4})/);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

/**
 * Schreibt einen Report in das (Firmen-)Blatt `name`. Existiert das Blatt
 * bereits, wird der neue Report unter den vorhandenen Inhalt angehängt –
 * so sammeln sich alle Reports einer Firma untereinander im selben Tab.
 * Beim erstmaligen Anlegen steht der Firmenname gut sichtbar in Zeile 1.
 */
async function appendCompanyReport(
  name: string,
  company: string,
  featureLabel: string,
  model: ExcelModel,
  activate: boolean
): Promise<void> {
  await Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    let sheet = sheets.getItemOrNullObject(name);
    sheet.load("isNullObject");
    await context.sync();

    const isNew = sheet.isNullObject;
    let row: number;
    if (isNew) {
      sheet = sheets.add(name);
      writeCompanyHeader(sheet, company);
      row = 2; // Zeile 1 = Firmenname, Zeile 2 frei, ab Zeile 3 (Index 2) die Reports.
    } else {
      const used = sheet.getUsedRangeOrNullObject();
      used.load("rowIndex, rowCount, isNullObject");
      await context.sync();
      row = used.isNullObject ? 0 : used.rowIndex + used.rowCount + 1; // eine Leerzeile Abstand
    }

    // Report-Überschrift, damit klar ist, welches Feature folgt.
    const reportBanner = sheet.getRangeByIndexes(row, 0, 1, 1);
    reportBanner.values = [[featureLabel]];
    reportBanner.format.font.bold = true;
    reportBanner.format.font.size = 12;
    reportBanner.format.font.color = "#185c37";
    row += 2;

    row = writeTables(sheet, model.tables, row);
    autofit(sheet);
    if (activate) sheet.activate();
    await context.sync();
  });
}

/** Firmenname gut sichtbar als Kopfzeile in Zeile 1. */
function writeCompanyHeader(sheet: Excel.Worksheet, company: string): void {
  const header = sheet.getRangeByIndexes(0, 0, 1, 1);
  header.values = [[company]];
  header.format.font.bold = true;
  header.format.font.size = 16;
  header.format.font.color = "#FFFFFF";
  header.format.fill.color = "#185c37";
}

async function writeCombinedSheet(
  name: string,
  featureLabel: string,
  sections: { company: string; model: ExcelModel }[]
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = await ensureSheet(context, name);
    let row = 0;
    for (const section of sections) {
      const banner = sheet.getRangeByIndexes(row, 0, 1, 1);
      banner.values = [[`${section.company} — ${featureLabel}`]];
      banner.format.font.bold = true;
      banner.format.font.size = 13;
      banner.format.font.color = "#185c37";
      row += 2;
      row = writeTables(sheet, section.model.tables, row);
      row += 2;
    }
    autofit(sheet);
    sheet.activate();
    await context.sync();
  });
}

async function ensureSheet(context: Excel.RequestContext, name: string): Promise<Excel.Worksheet> {
  const sheets = context.workbook.worksheets;
  let sheet = sheets.getItemOrNullObject(name);
  sheet.load("isNullObject");
  await context.sync();
  if (sheet.isNullObject) sheet = sheets.add(name);
  sheet.getUsedRangeOrNullObject().clear();
  return sheet;
}

/** Schreibt Tabellen ab Zeile `startRow` und gibt die nächste freie Zeile zurück. */
function writeTables(sheet: Excel.Worksheet, tables: ExcelTable[], startRow: number): number {
  let row = startRow;
  for (const table of tables) {
    const width = Math.max(table.headers.length, 1);
    const titleRange = sheet.getRangeByIndexes(row, 0, 1, width);
    titleRange.values = [[table.title, ...Array(width - 1).fill("")]];
    titleRange.format.font.bold = true;
    titleRange.format.fill.color = "#217346";
    titleRange.format.font.color = "#FFFFFF";
    row += 1;

    const headerRange = sheet.getRangeByIndexes(row, 0, 1, width);
    headerRange.values = [table.headers];
    headerRange.format.font.bold = true;
    headerRange.format.fill.color = "#E2F0D9";
    row += 1;

    if (table.rows.length) {
      const dataRange = sheet.getRangeByIndexes(row, 0, table.rows.length, width);
      dataRange.values = table.rows.map((cells) => padRow(cells, width));
      applyColumnFormats(sheet, table, row, width);
      row += table.rows.length;
    }
    row += 2;
  }
  return row;
}

/** Wendet die optionalen Spalten-Zahlenformate (table.formats) auf die Datenzeilen an. */
function applyColumnFormats(sheet: Excel.Worksheet, table: ExcelTable, dataRow: number, width: number): void {
  const formats = table.formats;
  if (!formats) return;
  for (let col = 0; col < width; col++) {
    const fmt = formats[col];
    if (!fmt) continue;
    const colRange = sheet.getRangeByIndexes(dataRow, col, table.rows.length, 1);
    colRange.numberFormat = table.rows.map(() => [fmt]);
  }
}

function autofit(sheet: Excel.Worksheet): void {
  // Spaltenbreite bewusst NICHT anpassen – die vom Nutzer eingestellten
  // Breiten sollen beim Generieren von Daten unverändert bleiben.
  const used = sheet.getUsedRangeOrNullObject();
  used.format.autofitRows();
}

/**
 * Normalisiert eine eingegebene Proxy-Adresse: trimmt, entfernt End-Slashes und
 * ergänzt fehlendes `https://`. Ohne Schema würde der Browser die URL als *relativ*
 * zur Add-in-Seite auflösen (→ Health-Check schlägt fehl, „Proxy nicht erreichbar").
 */
function normalizeProxyUrl(raw: string): string {
  let value = raw.trim().replace(/\/+$/, "");
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

export function proxyBaseUrl(): string {
  try {
    const stored = localStorage.getItem(PROXY_KEY);
    if (stored && stored.trim()) return normalizeProxyUrl(stored);
  } catch {
    /* localStorage steht evtl. nicht zur Verfügung. */
  }
  return DEFAULT_PROXY_BASE_URL.replace(/\/+$/, "");
}

export function setProxyBaseUrl(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed ? normalizeProxyUrl(trimmed) : DEFAULT_PROXY_BASE_URL.replace(/\/+$/, "");
  try {
    localStorage.setItem(PROXY_KEY, normalized);
  } catch {
    /* ignore */
  }
  return normalized;
}

/** Persönlicher Zugangs-Token (vom Administrator vergeben). */
export function userToken(): string {
  try {
    return (localStorage.getItem(USER_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setUserToken(value: string): string {
  const trimmed = value.trim();
  try {
    if (trimmed) localStorage.setItem(USER_TOKEN_KEY, trimmed);
    else localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  return trimmed;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${proxyBaseUrl()}/health`, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

export function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "API";
}

/** Eindeutiger, Excel-konformer Blattname (max. 31 Zeichen, case-insensitive eindeutig). */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = safeSheetName(raw);
  let name = base;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${counter})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function padRow(row: ExcelCell[], width: number): ExcelCell[] {
  return [...row, ...Array(Math.max(width - row.length, 0)).fill(null)].slice(0, width);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as JsonRecord;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as JsonRecord;
    if (typeof nested.message === "string") return nested.message;
  }
  return "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
