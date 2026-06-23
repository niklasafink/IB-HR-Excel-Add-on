// Wandelt geladene Firmendaten in ein tabellarisches Modell um.
//
// Layout:
//   Spalte 0      = hierarchische Positionsnamen (eingerückt)
//   weitere Spalten = je Unternehmen × gewähltem Jahr eine Wertspalte
//                     (gruppiert: Firma A 2024 | Firma A 2023 | Firma B 2024 | ...)
//
// Da die Bilanz-/GuV-Bäume verschiedener Firmen unterschiedlich aufgebaut sein
// können, werden sie zu EINER gemeinsamen Positionsachse zusammengeführt
// (Merge nach Positionsname je Hierarchieebene). Jede Firma füllt die Werte,
// die sie zu dieser Position hat.

import type { CompanyData, CompanyIndicator, DataBlock, MergedRow, MergedSection } from "./types";
import { KENNZAHLEN_FIELDS, STAMMDATEN_FIELDS } from "./config";

export interface SheetCell {
  value: number | string | null;
  isNumber: boolean;
}

export interface SheetRow {
  label: string;
  depth: number;
  kind: "section" | "line";
  cells: SheetCell[]; // Länge = firms * years
}

export interface FirmSpan {
  name: string;
  startCol: number; // 0-basiert innerhalb der Wertspalten (ohne die Label-Spalte)
  count: number;
}

export interface SheetModel {
  years: number[];
  firms: { name: string; status: CompanyData["status"]; note?: string }[];
  firmSpans: FirmSpan[];
  rows: SheetRow[];
  valueColumnCount: number;
}

// --- interne, firmenübergreifend vereinte Baumstruktur -------------------
interface UniNode {
  name: string;
  formatted_name: string;
  children: UniNode[];
  // pro Firmenindex die Werte (gekeyt nach report_end_date)
  valuesByFirm: Map<number, Record<string, number | null>>;
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Vereint die Zeilen mehrerer Firmen einer Hierarchieebene zu UniNodes. */
function mergeLevel(perFirmRows: Array<{ firm: number; rows: MergedRow[] }>): UniNode[] {
  const order: string[] = [];
  const nodes = new Map<string, UniNode>();
  const childAccumulator = new Map<string, Array<{ firm: number; rows: MergedRow[] }>>();

  for (const { firm, rows } of perFirmRows) {
    for (const row of rows || []) {
      const key = normalizeKey(row.name || row.formatted_name || "");
      if (!key) continue;
      if (!nodes.has(key)) {
        order.push(key);
        nodes.set(key, {
          name: row.name || row.formatted_name || "",
          formatted_name: row.formatted_name || row.name || "",
          children: [],
          valuesByFirm: new Map(),
        });
        childAccumulator.set(key, []);
      }
      const node = nodes.get(key)!;
      if (!node.formatted_name && row.formatted_name) node.formatted_name = row.formatted_name;
      if (row.values) node.valuesByFirm.set(firm, row.values);
      if (row.children && row.children.length) {
        childAccumulator.get(key)!.push({ firm, rows: row.children });
      }
    }
  }

  return order.map((key) => {
    const node = nodes.get(key)!;
    node.children = mergeLevel(childAccumulator.get(key)!);
    return node;
  });
}

/** Findet zu einem Jahr den passenden Wert (Key = report_end_date, z. B. 2024-12-31). */
function valueForYear(values: Record<string, number | null> | undefined, year: number): number | null {
  if (!values) return null;
  let bestKey: string | null = null;
  for (const key of Object.keys(values)) {
    if (key.slice(0, 4) === String(year)) {
      if (bestKey === null || key > bestKey) bestKey = key; // spätestes Datum im Jahr
    }
  }
  return bestKey ? values[bestKey] ?? null : null;
}

function emptyCells(count: number): SheetCell[] {
  return Array.from({ length: count }, () => ({ value: null, isNumber: false }));
}

/**
 * Flacht den vereinten Baum in SheetRows ab (mit Einrücktiefe) und entfernt
 * dabei leere Positionen: Eine Zeile wird nur ausgegeben, wenn sie selbst
 * mindestens einen Wert hat ODER mindestens ein (Unter-)Kind einen Wert hat.
 */
function flattenSection(
  uniNodes: UniNode[],
  firmCount: number,
  years: number[],
  removeEmpty: boolean,
  divisor: number,
  depth = 1
): SheetRow[] {
  const valueCols = firmCount * years.length;
  const out: SheetRow[] = [];
  for (const node of uniNodes) {
    const cells = emptyCells(valueCols);
    for (let f = 0; f < firmCount; f++) {
      const values = node.valuesByFirm.get(f);
      years.forEach((year, yi) => {
        const raw = valueForYear(values, year);
        const v = raw === null || raw === undefined ? null : raw / divisor;
        const col = f * years.length + yi;
        cells[col] = { value: v, isNumber: v !== null && v !== undefined };
      });
    }
    const ownHasData = cells.some((c) => c.value !== null && c.value !== undefined);
    const childRows = flattenSection(node.children, firmCount, years, removeEmpty, divisor, depth + 1);
    if (!removeEmpty || ownHasData || childRows.length > 0) {
      out.push({ label: node.formatted_name || node.name, depth, kind: "line", cells });
      out.push(...childRows);
    }
  }
  return out;
}

function sectionRow(label: string, valueCols: number): SheetRow {
  return { label, depth: 0, kind: "section", cells: emptyCells(valueCols) };
}

function getSection(data: CompanyData, key: "aktiva" | "passiva" | "guv"): MergedSection | undefined {
  return data.financials?.merged?.[key];
}

const SECTION_LABELS: Record<"aktiva" | "passiva" | "guv", string> = {
  aktiva: "BILANZ – AKTIVA",
  passiva: "BILANZ – PASSIVA",
  guv: "GEWINN- UND VERLUSTRECHNUNG",
};

function buildFinancialSection(
  data: CompanyData[],
  key: "aktiva" | "passiva" | "guv",
  years: number[],
  rows: SheetRow[],
  removeEmpty: boolean,
  divisor: number
): void {
  const perFirm = data.map((d, firm) => ({ firm, rows: getSection(d, key)?.rows ?? [] }));
  const hasAny = perFirm.some((p) => p.rows.length > 0);
  if (!hasAny) return;
  const merged = mergeLevel(perFirm);
  const sectionRows = flattenSection(merged, data.length, years, removeEmpty, divisor, 1);
  if (sectionRows.length === 0) return; // nach Pruning nichts übrig
  rows.push(sectionRow(SECTION_LABELS[key], data.length * years.length));
  rows.push(...sectionRows);
}

/** Schreibt einen Label→Wert-Eintrag in die ERSTE Jahresspalte jeder Firma. */
function perFirmRow(
  label: string,
  data: CompanyData[],
  years: number[],
  valueOf: (d: CompanyData) => string | number | null
): SheetRow {
  const cells = emptyCells(data.length * years.length);
  data.forEach((d, f) => {
    const v = valueOf(d);
    const col = f * years.length; // erste Jahresspalte der Firma
    if (v !== null && v !== undefined && v !== "") {
      cells[col] = { value: v, isNumber: typeof v === "number" };
    }
  });
  return { label, depth: 1, kind: "line", cells };
}

function representationText(d: CompanyData): string {
  const reps = d.company?.representation;
  if (!reps || !reps.length) return "";
  return reps
    .map((r) => {
      const name = r.name || [r.first_name, r.last_name].filter(Boolean).join(" ");
      return r.role ? `${name} (${r.role})` : name;
    })
    .filter(Boolean)
    .join("; ");
}

function buildStammdaten(
  data: CompanyData[],
  years: number[],
  rows: SheetRow[],
  fields: string[]
): void {
  const anyCompany = data.some((d) => d.company);
  if (!anyCompany) return;
  const selected = STAMMDATEN_FIELDS.filter((f) => fields.includes(f.key));
  if (!selected.length) return;

  const getter: Record<string, (d: CompanyData) => string | number> = {
    name: (d) => d.company?.name?.name ?? d.matchedName ?? "",
    legal_form: (d) => d.company?.legal_form ?? "",
    status: (d) => d.company?.status ?? "",
    address: (d) => d.company?.address?.formatted_value ?? "",
    capital: (d) => {
      const c = d.company?.capital;
      if (!c || c.amount === undefined || c.amount === null) return "";
      return c.currency ? `${c.amount} ${c.currency}` : c.amount;
    },
    incorporated_at: (d) => d.company?.incorporated_at ?? "",
    notarized_at: (d) => d.company?.notarized_at ?? "",
    terminated_at: (d) => d.company?.terminated_at ?? "",
    purpose: (d) => d.company?.purpose?.purpose ?? "",
    representation: (d) => representationText(d),
    register: (d) => {
      const r = d.company?.register;
      if (!r) return "";
      const head = [r.register_type, r.register_number].filter(Boolean).join(" ");
      return r.register_court ? `${head}, ${r.register_court}` : head;
    },
    lei: (d) => d.company?.lei ?? "",
    email: (d) => d.company?.contact?.email ?? "",
    phone: (d) => d.company?.contact?.phone ?? "",
    website: (d) => d.company?.contact?.website_url ?? "",
    vat_id: (d) => d.company?.contact?.vat_id ?? "",
    industry_codes: (d) => (d.company?.industry_codes?.WZ2025 ?? []).map((c) => c.code).join(", "),
  };

  rows.push(sectionRow("STAMMDATEN", data.length * years.length));
  for (const field of selected) {
    const fn = getter[field.key];
    if (fn) rows.push(perFirmRow(field.label, data, years, fn));
  }
}

/** Findet den Kennzahlen-Datensatz eines Jahres (spätestes Datum im Jahr gewinnt). */
function indicatorForYear(
  inds: CompanyIndicator[] | undefined,
  year: number
): CompanyIndicator | undefined {
  if (!inds) return undefined;
  let best: CompanyIndicator | undefined;
  for (const ind of inds) {
    if (ind.date?.slice(0, 4) === String(year)) {
      if (!best || ind.date > best.date) best = ind;
    }
  }
  return best;
}

function buildKennzahlen(
  data: CompanyData[],
  years: number[],
  rows: SheetRow[],
  fields: string[],
  divisor: number,
  removeEmpty: boolean
): void {
  const selected = KENNZAHLEN_FIELDS.filter((f) => fields.includes(f.key));
  if (!selected.length) return;
  const anyInd = data.some((d) => (d.company?.indicators?.length ?? 0) > 0);
  if (!anyInd) return;

  const valueCols = data.length * years.length;
  const out: SheetRow[] = [];
  for (const field of selected) {
    const cells = emptyCells(valueCols);
    data.forEach((d, f) => {
      years.forEach((year, yi) => {
        const ind = indicatorForYear(d.company?.indicators, year);
        const raw = ind ? (ind as unknown as Record<string, unknown>)[field.key] : null;
        if (typeof raw === "number") {
          const v = field.monetary ? raw / divisor : raw;
          cells[f * years.length + yi] = { value: v, isNumber: true };
        }
      });
    });
    const hasData = cells.some((c) => c.value !== null && c.value !== undefined);
    if (!removeEmpty || hasData) out.push({ label: field.label, depth: 1, kind: "line", cells });
  }
  if (out.length === 0) return;
  rows.push(sectionRow("KENNZAHLEN", valueCols));
  rows.push(...out);
}

/**
 * Ermittelt die Geschäftsjahre, für die tatsächlich digitalisierte Werte
 * vorliegen (über alle Firmen), neueste zuerst, begrenzt auf `limit`.
 *
 * Wichtig: Es zählen nur Jahre mit mindestens einem von Null verschiedenen
 * Wert. Reine Report-Metadaten (z. B. eingereichter, aber nicht digitalisierter
 * Jahresabschluss) erzeugen leere Spalten und werden hier bewusst ignoriert.
 */
export function extractAvailableYears(data: CompanyData[], limit = 5): number[] {
  const counts = new Map<number, number>();
  for (const d of data) {
    const merged = d.financials?.merged;
    for (const key of ["aktiva", "passiva", "guv"] as const) {
      for (const row of merged?.[key]?.rows ?? []) tallyYears(row, counts);
    }
    // Auch Kennzahlen-Jahre berücksichtigen (für Kennzahlen-only-Läufe).
    for (const ind of d.company?.indicators ?? []) {
      const y = Number(ind.date?.slice(0, 4));
      if (!y) continue;
      const hasVal = KENNZAHLEN_FIELDS.some((f) => {
        const v = (ind as unknown as Record<string, unknown>)[f.key];
        return typeof v === "number" && v !== 0;
      });
      if (hasVal) counts.set(y, (counts.get(y) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 0)
    .map(([y]) => y)
    .sort((a, b) => b - a)
    .slice(0, limit);
}

function tallyYears(row: MergedRow, counts: Map<number, number>): void {
  for (const [key, val] of Object.entries(row.values ?? {})) {
    if (typeof val === "number" && val !== 0) {
      const y = Number(key.slice(0, 4));
      if (y) counts.set(y, (counts.get(y) || 0) + 1);
    }
  }
  for (const child of row.children ?? []) tallyYears(child, counts);
}

export interface BuildOptions {
  removeEmpty?: boolean;
  centsToEuro?: boolean;
  kennzahlenFields?: string[];
  stammdatenFields?: string[];
}

export function buildSheetModel(
  data: CompanyData[],
  blocks: Set<DataBlock>,
  years: number[],
  opts: BuildOptions = {}
): SheetModel {
  const removeEmpty = opts.removeEmpty ?? true;
  const divisor = (opts.centsToEuro ?? true) ? 100 : 1;
  const kennzahlenFields = opts.kennzahlenFields ?? KENNZAHLEN_FIELDS.map((f) => f.key);
  const stammdatenFields = opts.stammdatenFields ?? STAMMDATEN_FIELDS.map((f) => f.key);
  const sortedYears = [...years].sort((a, b) => b - a); // neueste zuerst
  const rows: SheetRow[] = [];

  if (blocks.has("aktiva")) buildFinancialSection(data, "aktiva", sortedYears, rows, removeEmpty, divisor);
  if (blocks.has("passiva")) buildFinancialSection(data, "passiva", sortedYears, rows, removeEmpty, divisor);
  if (blocks.has("guv")) buildFinancialSection(data, "guv", sortedYears, rows, removeEmpty, divisor);
  if (blocks.has("kennzahlen"))
    buildKennzahlen(data, sortedYears, rows, kennzahlenFields, divisor, removeEmpty);
  if (blocks.has("stammdaten")) buildStammdaten(data, sortedYears, rows, stammdatenFields);

  const firmSpans: FirmSpan[] = data.map((d, i) => ({
    name: d.matchedName || d.inputName,
    startCol: i * sortedYears.length,
    count: sortedYears.length,
  }));

  return {
    years: sortedYears,
    firms: data.map((d) => ({
      name: d.matchedName || d.inputName,
      status: d.status,
      note: d.error,
    })),
    firmSpans,
    rows,
    valueColumnCount: data.length * sortedYears.length,
  };
}
