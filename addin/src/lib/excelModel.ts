import { featureByKey } from "./features";

export type ExcelCell = string | number | boolean | null;

export interface ExcelTable {
  title: string;
  headers: string[];
  rows: ExcelCell[][];
  /** Optionales Excel-Zahlenformat je Spalte (null = unformatiert). */
  formats?: (string | null)[];
}

/** Standard-Zahlenformat: Tausendertrennung + 2 Nachkommastellen (locale-abhängig). */
const NUM_FORMAT = "#,##0.00";

/** Leitet ein passendes Zahlenformat aus dem Spaltennamen ab (oder null). */
function formatForHeader(header: string): string | null {
  const h = header.toLowerCase();
  if (/percent|prozent|quote/.test(h)) return "0.00";
  if (/year|jahr|level|date|datum/.test(h)) return null;
  if (
    /amount|value|wert|revenue|umsatz|income|gewinn|capital|kapital|ebit|cash|equity|eigenkapital|liabilit|balance|bilanz|total|summe|contribution|einlage|expense|aufwand|betrag|asset|verm/.test(
      h
    )
  ) {
    return NUM_FORMAT;
  }
  return null;
}

export interface ExcelModel {
  sheetName: string;
  tables: ExcelTable[];
}

type JsonRecord = Record<string, unknown>;

/**
 * Manche Features liefert handelsregister.ai unter einem abweichenden
 * Antwort-Schlüssel zurück (z. B. `publications` => `history`). Reihenfolge =
 * Priorität; der erste vorhandene, nicht-leere Schlüssel gewinnt.
 */
const FEATURE_RESPONSE_KEYS: Record<string, string[]> = {
  publications: ["publications", "history"],
};

const ORG_BASE_KEYS = new Set([
  "entity_id",
  "name",
  "status",
  "legal_form",
  "registration",
  "keywords",
  "products_and_services",
  "industry_classification",
  "contact_data",
  "address",
  "registration_date",
  "purpose",
  "meta",
]);

function resolveFeatureValue(root: JsonRecord, featureKey: string, response: unknown): unknown {
  const candidates = FEATURE_RESPONSE_KEYS[featureKey] ?? [featureKey];
  for (const key of candidates) {
    const value = root[key];
    if (value !== undefined && value !== null) return value;
  }
  // Fallback: erstes nicht-leeres Daten-Feld, das kein Stammdatenfeld ist.
  for (const [key, value] of Object.entries(root)) {
    if (ORG_BASE_KEYS.has(key)) continue;
    if (Array.isArray(value) ? value.length > 0 : value && typeof value === "object") return value;
  }
  return response;
}

export function buildExcelModel(featureKey: string, response: unknown): ExcelModel {
  const feature = featureByKey(featureKey);
  const root = asRecord(response);
  const value = resolveFeatureValue(root, featureKey, response);

  switch (featureKey) {
    case "financial_kpi":
      return model(feature.shortLabel, [arrayTable("financial_kpi", asArray(value))]);
    case "balance_sheet_accounts":
      return model(feature.shortLabel, balanceSheetTables(asArray(value)));
    case "profit_and_loss_account":
      return model(feature.shortLabel, [hierarchyTable("profit_and_loss_account", asArray(value))]);
    case "related_persons":
      return model(feature.shortLabel, relatedPersonsTables(value));
    case "publications":
    case "news":
    case "insolvency_publications":
      return model(feature.shortLabel, [arrayTable(featureKey, asArray(value))]);
    case "ubos":
      return model(feature.shortLabel, [arrayTable("ubos", uboRows(value))]);
    case "shareholders":
      return model(feature.shortLabel, [arrayTable("shareholders", shareholderRows(value))]);
    case "shareholdings":
      return model(feature.shortLabel, [arrayTable("shareholdings", shareholdingRows(value))]);
    case "annual_financial_statements":
    case "annual_financial_statements__html":
      return model(feature.shortLabel, documentTables(featureKey, value));
    case "website_content":
      return model(feature.shortLabel, websiteTables(value));
    default:
      return model(feature.shortLabel, [genericTable(featureKey, response)]);
  }
}

function model(sheetName: string, tables: ExcelTable[]): ExcelModel {
  return { sheetName: safeSheetName(sheetName), tables: tables.filter((table) => table.headers.length > 0) };
}

function arrayTable(title: string, rows: unknown[]): ExcelTable {
  if (!rows.length) return { title, headers: ["Hinweis"], rows: [["Keine Daten verfügbar"]] };

  const flattened = rows.map((row) => flattenObject(row));
  const headers = collectHeaders(flattened);
  return {
    title,
    headers,
    rows: flattened.map((row) => headers.map((header) => toCell(row[header]))),
    formats: headers.map(formatForHeader),
  };
}

function relatedPersonsTables(value: unknown): ExcelTable[] {
  const record = asRecord(value);
  if (Array.isArray(value)) return [arrayTable("related_persons", value)];

  const tables: ExcelTable[] = [];
  for (const key of ["current", "former", "all"]) {
    const rows = asArray(record[key]);
    if (rows.length) tables.push(arrayTable(`related_persons_${key}`, rows.map(normalizePerson)));
  }
  return tables.length ? tables : [genericTable("related_persons", value)];
}

function normalizePerson(value: unknown): JsonRecord {
  const person = asRecord(value);
  const role = asRecord(person.role);
  return {
    name: person.name,
    role_de: asRecord(role.de).long ?? role.de,
    role_en: asRecord(role.en).long ?? role.en,
    start_date: person.start_date,
    end_date: person.end_date,
    status: person.status,
  };
}

/** ubos: { beneficial_owners: [{ person, ownership_percentage, ... }] } */
function uboRows(value: unknown): JsonRecord[] {
  return asArray(asRecord(value).beneficial_owners).map((entry) => {
    const r = asRecord(entry);
    const person = asRecord(r.person);
    const home = asRecord(asRecord(person.location).home);
    return {
      name: person.name,
      birth_date: person.birth_date,
      ownership_percentage: r.ownership_percentage,
      city: home.city,
      country: home.country,
    };
  });
}

/** shareholders: { total_capital, entries: [{ shareholder, contribution }] } */
function shareholderRows(value: unknown): JsonRecord[] {
  return asArray(asRecord(value).entries).map((entry) => {
    const r = asRecord(entry);
    const holder = asRecord(r.shareholder);
    const contribution = asRecord(r.contribution);
    const personName = [holder.first_name, holder.last_name].filter(Boolean).join(" ");
    return {
      name: holder.entity_name ?? holder.name ?? (personName || null),
      address: holder.address,
      country: holder.country_code,
      registration: holder.registration_reference,
      contribution_amount: contribution.amount,
      currency: contribution.currency,
    };
  });
}

/** shareholdings: { holdings: { current/former: [{ organization, ownership, as_of }] } } */
function shareholdingRows(value: unknown): JsonRecord[] {
  const holdings = asRecord(asRecord(value).holdings);
  const out: JsonRecord[] = [];
  for (const status of ["current", "former"]) {
    for (const entry of asArray(holdings[status])) {
      const r = asRecord(entry);
      const org = asRecord(r.organization);
      const ownership = asRecord(r.ownership);
      const contribution = asRecord(ownership.contribution);
      out.push({
        status,
        organization: org.name,
        percentage: ownership.percentage,
        contribution_amount: contribution.amount,
        currency: contribution.currency,
        as_of: r.as_of,
      });
    }
  }
  return out;
}

const HIERARCHY_META_KEYS = ["year", "date", "report_end_date", "fiscal_year_end"];

interface BalanceLine {
  label: string;
  value: ExcelCell;
}

/**
 * Stellt die Bilanz je Geschäftsjahr als Gegenüberstellung dar:
 * Aktiva (Label + Wert) links, Passiva (Label + Wert) direkt daneben.
 * Fällt auf die flache Hierarchie-Tabelle zurück, falls keine
 * Aktiv-/Passivseite erkennbar ist.
 */
function balanceSheetTables(records: unknown[]): ExcelTable[] {
  const tables: ExcelTable[] = [];

  for (const record of records) {
    const r = asRecord(record);
    const year = yearOf(r) || "";
    const nodes = nestedNodes(r);

    const aktiva: BalanceLine[] = [];
    const passiva: BalanceLine[] = [];
    for (const node of nodes) {
      const target = balanceSide(node) === "passiva" ? passiva : aktiva;
      flattenSide(asRecord(node), 0, target);
    }

    // Keine echte zweiseitige Bilanz erkannt -> flache Darstellung.
    if (!aktiva.length || !passiva.length) {
      tables.push(hierarchyTable(year ? `Bilanz ${year}` : "balance_sheet_accounts", [record]));
      continue;
    }

    const rows: ExcelCell[][] = [];
    const count = Math.max(aktiva.length, passiva.length);
    for (let i = 0; i < count; i++) {
      const a = aktiva[i];
      const p = passiva[i];
      rows.push([a?.label ?? "", a?.value ?? null, "", p?.label ?? "", p?.value ?? null]);
    }

    tables.push({
      title: year ? `Bilanz ${year}` : "Bilanz",
      headers: ["Aktiva", "Wert", "", "Passiva", "Wert"],
      rows,
      formats: [null, NUM_FORMAT, null, null, NUM_FORMAT],
    });
  }

  return tables.length ? tables : [hierarchyTable("balance_sheet_accounts", records)];
}

/** Findet die verschachtelte Knoten-Liste eines Jahres-Records (Schlüssel variiert). */
function nestedNodes(record: JsonRecord): unknown[] {
  const nodes: unknown[] = [];
  for (const [key, val] of Object.entries(record)) {
    if (HIERARCHY_META_KEYS.includes(key)) continue;
    if (Array.isArray(val)) nodes.push(...val);
  }
  if (!nodes.length) nodes.push(...entriesAsNodes(asRecord(record.accounts)));
  return nodes;
}

/** Ordnet einen Top-Knoten der Aktiv- oder Passivseite zu (per Name). */
function balanceSide(node: unknown): "aktiva" | "passiva" {
  const n = asRecord(node);
  const name = `${localizedName(n.name)} ${localizedName(n.formatted_name)}`.toLowerCase();
  return /passiv|liabilit|equity|eigenkapital|fremdkapital/.test(name) ? "passiva" : "aktiva";
}

/** Flacht einen Bilanz-Knoten rekursiv in eingerückte Zeilen ab. */
function flattenSide(node: JsonRecord, level: number, out: BalanceLine[]): void {
  const name = localizedName(node.name ?? node.formatted_name ?? node.label ?? node.account);
  const value = node.value ?? node.amount ?? node.balance;
  out.push({ label: "   ".repeat(level) + name, value: toCell(value) });
  for (const child of asArray(node.children)) flattenSide(asRecord(child), level + 1, out);
}

function hierarchyTable(title: string, records: unknown[]): ExcelTable {
  const rows: ExcelCell[][] = [];

  for (const record of records) {
    const r = asRecord(record);
    const year = yearOf(r);
    // Die verschachtelte Konten-Liste steckt je nach Feature unter
    // unterschiedlichen Schlüsseln (rows, children, balance_sheet_accounts,
    // profit_and_loss_accounts, ...). Daher generisch jedes Array-Feld nehmen.
    const candidates: unknown[] = [];
    for (const [key, val] of Object.entries(r)) {
      if (HIERARCHY_META_KEYS.includes(key)) continue;
      if (Array.isArray(val)) candidates.push(...val);
    }
    if (!candidates.length) candidates.push(...entriesAsNodes(asRecord(r.accounts)));

    if (candidates.length) {
      for (const node of candidates) walkHierarchy(node, year, [], rows);
      continue;
    }

    for (const [key, value] of Object.entries(r)) {
      if (HIERARCHY_META_KEYS.includes(key)) continue;
      if (isPrimitive(value)) rows.push([year, key, 0, key, toCell(value)]);
    }
  }

  return {
    title,
    headers: ["year", "path", "level", "account", "value"],
    rows,
    formats: [null, null, null, null, NUM_FORMAT],
  };
}

function walkHierarchy(nodeValue: unknown, year: string, parents: string[], out: ExcelCell[][]): void {
  const node = asRecord(nodeValue);
  const name = localizedName(node.formatted_name ?? node.name ?? node.label ?? node.account);
  const path = [...parents, name].filter(Boolean);
  const values = asRecord(node.values);

  if (Object.keys(values).length) {
    for (const [date, value] of Object.entries(values)) {
      out.push([date.slice(0, 4) || year, path.join(" > "), Math.max(path.length - 1, 0), name, toCell(value)]);
    }
  } else {
    const direct = node.value ?? node.amount ?? node.balance;
    if (isPrimitive(direct)) {
      out.push([year, path.join(" > "), Math.max(path.length - 1, 0), name, toCell(direct)]);
    }
  }

  const children = [...asArray(node.children), ...asArray(node.rows), ...entriesAsNodes(asRecord(node.accounts))];
  for (const child of children) walkHierarchy(child, year, path, out);
}

function documentTables(featureKey: string, value: unknown): ExcelTable[] {
  const documents = asArray(value);
  if (!documents.length) return [genericTable(featureKey, value)];

  const metaRows = documents.map((doc, index) => {
    const flat = flattenObject(doc);
    for (const key of Object.keys(flat)) {
      if (/content|markdown|html|text|body/i.test(key)) delete flat[key];
    }
    return { index, ...flat };
  });

  // Langer Inhalt (Markdown/HTML eines Jahresberichts) wird zeilenweise auf
  // mehrere Zeilen verteilt statt in eine riesige Zelle gekippt – Excel-Zellen
  // sind auf 32.767 Zeichen begrenzt und ein Riesen-Feld ist unlesbar.
  const contentRows: ExcelCell[][] = [];
  documents.forEach((doc, index) => {
    const record = asRecord(doc);
    const title = String(record.title ?? record.name ?? record.report_id ?? `Dokument ${index + 1}`);
    const lines = contentLines(findLongContent(record));
    if (!lines.length) {
      contentRows.push([title, "(kein Inhalt)"]);
      return;
    }
    for (const line of lines) contentRows.push([title, line]);
  });

  return [
    arrayTable(`${featureKey}_meta`, metaRows),
    { title: `${featureKey}_content`, headers: ["Dokument", "Inhalt"], rows: contentRows },
  ];
}

function websiteTables(value: unknown): ExcelTable[] {
  if (typeof value === "string") {
    return [{ title: "website_content", headers: ["Inhalt"], rows: contentLines(value).map((line) => [line]) }];
  }
  if (Array.isArray(value)) return [arrayTable("website_content", value)];
  return [genericTable("website_content", value)];
}

/** Zerlegt langen Text in nicht-leere Zeilen, mit Obergrenzen gegen Excel-Limits. */
function contentLines(content: string): string[] {
  const MAX_LINES = 5000;
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const capped = lines.slice(0, MAX_LINES).map((line) => (line.length > MAX_CELL ? line.slice(0, MAX_CELL) + " …" : line));
  if (lines.length > MAX_LINES) capped.push(`… (${lines.length - MAX_LINES} weitere Zeilen abgeschnitten)`);
  return capped;
}

function genericTable(title: string, value: unknown): ExcelTable {
  const rows: ExcelCell[][] = [];
  flattenJson(value, "", rows);
  return { title, headers: ["path", "value"], rows };
}

function flattenJson(value: unknown, path: string, rows: ExcelCell[][]): void {
  if (Array.isArray(value)) {
    if (!value.length) rows.push([path || "$", "[]"]);
    value.forEach((item, index) => flattenJson(item, `${path}[${index}]`, rows));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonRecord);
    if (!entries.length) rows.push([path || "$", "{}"]);
    for (const [key, nested] of entries) flattenJson(nested, path ? `${path}.${key}` : key, rows);
    return;
  }
  rows.push([path || "$", toCell(value)]);
}

function flattenObject(value: unknown, prefix = "", out: JsonRecord = {}): JsonRecord {
  if (Array.isArray(value)) {
    out[prefix || "value"] = value.map((item) => (isPrimitive(item) ? item : JSON.stringify(item))).join("; ");
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as JsonRecord)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (isPrimitive(nested) || Array.isArray(nested)) flattenObject(nested, next, out);
      else flattenObject(nested, next, out);
    }
    return out;
  }
  out[prefix || "value"] = value;
  return out;
}

function collectHeaders(rows: JsonRecord[]): string[] {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return headers;
}

/** Namen können String oder lokalisiertes Objekt {de,en,in_report,long} sein. */
function localizedName(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const r = asRecord(value);
  const picked = r.in_report ?? r.de ?? r.en ?? r.long ?? r.name;
  return typeof picked === "string" ? picked : "";
}

function entriesAsNodes(record: JsonRecord): unknown[] {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

function findLongContent(record: JsonRecord): string {
  for (const key of ["content", "markdown", "html", "text", "body"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.length > 200) return value;
  }
  return "";
}

function yearOf(record: JsonRecord): string {
  const raw = record.year ?? record.date ?? record.report_end_date ?? record.fiscal_year_end ?? "";
  const text = String(raw);
  return /^\d{4}/.test(text) ? text.slice(0, 4) : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
}

/** Excel-Zellen fassen max. 32.767 Zeichen – konservativ darunter kappen. */
const MAX_CELL = 32000;

function clampText(text: string): string {
  return text.length > MAX_CELL ? text.slice(0, MAX_CELL) + " …" : text;
}

function toCell(value: unknown): ExcelCell {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return clampText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return clampText(JSON.stringify(value));
}

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "API";
}
