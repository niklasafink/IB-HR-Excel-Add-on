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
  if (/percent|prozent|quote|anteil/.test(h)) return "0.00";
  if (/year|jahr|level|date|datum/.test(h)) return null;
  if (
    /amount|value|wert|revenue|umsatz|income|gewinn|überschuss|fehlbetrag|capital|kapital|ebit|cash|equity|eigenkapital|liabilit|balance|bilanz|total|summe|contribution|einlage|expense|aufwand|betrag|asset|verm/.test(
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
    case "company_details":
      return model(feature.shortLabel, [companyProfileTable(root)]);
    case "financial_kpi":
      return model(feature.shortLabel, [arrayTable("Finanzkennzahlen", kpiRows(value))]);
    case "balance_sheet_accounts":
      return model(feature.shortLabel, balanceSheetTables(asArray(value)));
    case "profit_and_loss_account": {
      const pl = hierarchyTable("Gewinn- und Verlustrechnung (GuV)", asArray(value));
      if (!pl.rows.length) {
        return model(feature.shortLabel, [
          {
            title: "Gewinn- und Verlustrechnung (GuV)",
            headers: ["Hinweis"],
            rows: [["Im Handelsregister wurde keine GuV veröffentlicht."]],
          },
        ]);
      }
      return model(feature.shortLabel, [pl]);
    }
    case "related_persons":
      return model(feature.shortLabel, relatedPersonsTables(value));
    case "publications":
      return model(feature.shortLabel, [arrayTable("Bekanntmachungen", publicationRows(value))]);
    case "insolvency_publications":
      return model(feature.shortLabel, [arrayTable("Insolvenzbekanntmachungen", insolvencyRows(value))]);
    case "news":
      return model(feature.shortLabel, [arrayTable("Nachrichten", newsRows(value))]);
    case "ubos":
      return model(feature.shortLabel, [arrayTable("Wirtschaftlich Berechtigte (UBOs)", uboRows(value))]);
    case "shareholders":
      return model(feature.shortLabel, [arrayTable("Gesellschafter", shareholderRows(value))]);
    case "shareholdings":
      return model(feature.shortLabel, [arrayTable("Beteiligungen", shareholdingRows(value))]);
    case "annual_financial_statements":
    case "annual_financial_statements__html":
      return model(feature.shortLabel, documentTables(featureKey, value));
    case "website_content":
      return model(feature.shortLabel, websiteTables(root));
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
  if (Array.isArray(value)) return [arrayTable("Geschäftsführung & Organe", value.map(normalizePerson))];

  const titles: Record<string, string> = {
    current: "Aktuelle Organe",
    former: "Ehemalige Organe",
    all: "Alle Personen",
  };
  const tables: ExcelTable[] = [];
  for (const key of ["current", "former", "all"]) {
    const rows = asArray(record[key]);
    if (rows.length) tables.push(arrayTable(titles[key] ?? key, rows.map(normalizePerson)));
  }
  return tables.length ? tables : [genericTable("Geschäftsführung & Organe", value)];
}

function normalizePerson(value: unknown): JsonRecord {
  const person = asRecord(value);
  const role = asRecord(person.role);
  return {
    Name: person.name,
    Rolle: profileText(asRecord(role.de).long ?? role.de),
    Seit: formatGermanDate(person.start_date),
    Bis: formatGermanDate(person.end_date),
    Status: statusLabel(person.status),
  };
}

/** ubos: { beneficial_owners: [{ person, ownership_percentage, ... }] } */
function uboRows(value: unknown): JsonRecord[] {
  return asArray(asRecord(value).beneficial_owners).map((entry) => {
    const r = asRecord(entry);
    const person = asRecord(r.person);
    const home = asRecord(asRecord(person.location).home);
    return {
      Name: person.name,
      Geburtsdatum: formatGermanDate(person.birth_date),
      "Anteil %": r.ownership_percentage,
      Ort: home.city,
      Land: home.country,
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
      Name: holder.entity_name ?? holder.name ?? (personName || null),
      Adresse: holder.address,
      Land: holder.country_code,
      Register: holder.registration_reference,
      Einlage: contribution.amount,
      Währung: contribution.currency,
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
        Status: statusDe(status),
        "Beteiligung an": org.name,
        "Anteil %": ownership.percentage,
        Einlage: contribution.amount,
        Währung: contribution.currency,
        Stand: formatGermanDate(r.as_of),
      });
    }
  }
  return out;
}

const KPI_LABELS: Record<string, string> = {
  year: "Jahr",
  revenue: "Umsatz",
  net_income: "Jahresüberschuss",
  active_total: "Bilanzsumme",
  material_expenses: "Materialaufwand",
  personnel_expenses: "Personalaufwand",
  employees: "Mitarbeiter",
};
const KPI_RANK = ["revenue", "net_income", "active_total", "material_expenses", "personnel_expenses", "employees"];

/**
 * Finanzkennzahlen: „Jahr" zuerst, danach die KPIs – Spalten **mit** Werten vor
 * den leeren, alle mit deutschen Bezeichnungen.
 */
function kpiRows(value: unknown): JsonRecord[] {
  const entries = asArray(value).map(asRecord);
  if (!entries.length) return [];
  const keys = new Set<string>();
  for (const entry of entries) for (const key of Object.keys(entry)) if (key !== "year") keys.add(key);
  const ordered = [...keys].sort((a, b) => kpiRank(a) - kpiRank(b));
  const hasData = (key: string): boolean =>
    entries.some((entry) => entry[key] !== null && entry[key] !== undefined && entry[key] !== "");
  const cols = ["year", ...ordered.filter(hasData), ...ordered.filter((key) => !hasData(key))];
  return entries.map((entry) => {
    const out: JsonRecord = {};
    for (const key of cols) out[KPI_LABELS[key] ?? humanizeKey(key)] = entry[key];
    return out;
  });
}

function kpiRank(key: string): number {
  const i = KPI_RANK.indexOf(key);
  return i === -1 ? 999 : i;
}

/** Unbekannte Schlüssel lesbar machen: "bs_equity_total" -> "Bs Equity Total". */
function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Nachrichten: Datum, Titel, Quelle, Link (ohne interne ID). */
function newsRows(value: unknown): JsonRecord[] {
  return asArray(value).map((entry) => {
    const r = asRecord(entry);
    return {
      Datum: formatGermanDate(r.publication_date),
      Titel: profileText(r.title),
      Quelle: profileText(r.source),
      Link: profileText(r.url),
    };
  });
}

/** Bekanntmachungen (Event-Historie) auf wenige, lesbare Spalten reduzieren. */
function publicationRows(value: unknown): JsonRecord[] {
  return asArray(value).map((entry) => {
    const r = asRecord(entry);
    const details = asRecord(r.details);
    const linked = asRecord(details.linked_entities);
    const personName = asRecord(asRecord(linked.person).name);
    const person = [personName.given, personName.family].map(profileText).filter(Boolean).join(" ");
    return {
      Datum: formatGermanDate(r.start_date),
      Ereignis: localizedName(r.name),
      Beschreibung: localizedName(asRecord(r.description).short),
      "Beteiligte(r)": person || profileText(asRecord(linked.organization).name),
      Details: publicationDetail(asRecord(details.value)),
    };
  });
}

/** Fasst das ereignis-spezifische Detail (Adresse, Rolle oder Betrag) kurz zusammen. */
function publicationDetail(value: JsonRecord): string {
  const role = asRecord(value.role);
  if (role.name) return profileText(role.name);
  if (value.formatted_address) return profileText(value.formatted_address);
  if (typeof value.amount === "number") {
    return [value.amount.toLocaleString("de-DE"), profileText(value.currency)].filter(Boolean).join(" ");
  }
  return "";
}

/** Insolvenzbekanntmachungen (flaches Format) mit deutschen Spalten. */
function insolvencyRows(value: unknown): JsonRecord[] {
  return asArray(value).map((entry) => {
    const r = asRecord(entry);
    return {
      Datum: formatGermanDate(r.publication_date),
      Art: profileText(r.publication_label),
      Aktenzeichen: profileText(r.insolvency_id),
      Gericht: profileText(r.court_city),
      Sitz: profileText(r.seat),
      Register: profileText(r.register),
      Mitteilung: profileText(r.event_notice),
    };
  });
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
    headers: ["Jahr", "Pfad", "Ebene", "Konto", "Wert"],
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

/**
 * Aufbereitung des "Website"-Features: ein lesbares Unternehmensprofil mit
 * deutschen Feldnamen statt des rohen API-Dumps. Falls echter Website-Inhalt
 * (Markdown) vorhanden ist, wird er als zweite Tabelle angehängt.
 */
function websiteTables(root: JsonRecord): ExcelTable[] {
  const tables: ExcelTable[] = [];

  // Enthält die Antwort Stammdaten, zuerst das Unternehmensprofil aufbauen.
  const hasOrgData = Array.from(ORG_BASE_KEYS).some((key) => root[key] !== undefined && root[key] !== null);
  if (hasOrgData) tables.push(companyProfileTable(root));

  // Echten Website-Inhalt als zweite Tabelle anhängen, sofern vorhanden.
  const content = websiteContentText(root.website_content).trim();
  if (content) {
    tables.push({ title: "Website-Inhalt", headers: ["Inhalt"], rows: contentLines(content).map((line) => [line]) });
  }

  if (tables.length) return tables;

  return [
    {
      title: "Website-Inhalt",
      headers: ["Hinweis"],
      rows: [["Kein Website-Inhalt verfügbar – KI-Suche aktiv? Ggf. hat das Unternehmen keine erkannte Website."]],
    },
  ];
}

/** Extrahiert den Website-Text – egal ob String, Array oder Objekt. */
function websiteContentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : "")).join("\n");
  const r = asRecord(value);
  return profileText(r.content ?? r.markdown ?? r.text ?? r.summary ?? r.body);
}

/** Kuratiertes Unternehmensprofil (Feld/Wert) mit verständlichen Bezeichnungen. */
function companyProfileTable(root: JsonRecord): ExcelTable {
  const reg = asRecord(root.registration);
  const addr = asRecord(root.address);
  const contact = asRecord(root.contact_data);
  const rows: ExcelCell[][] = [];
  const add = (label: string, value: unknown): void => {
    const text = profileText(value);
    if (text) rows.push([label, text]);
  };

  add("Unternehmen", root.name);
  add("Status", statusLabel(root.status));
  add("Rechtsform", root.legal_form);
  add("Registergericht", reg.court);
  add("Registerart", reg.register_type);
  add("Registernummer", reg.register_number);
  add("Gründungsdatum", formatGermanDate(root.registration_date));
  add("Adresse", formatAddress(addr));
  add("Bundesland", addr.state);
  add("Land", addr.country);
  add("Website", contact.website);
  add("Telefon", contact.phone_number ?? contact.phone);
  add("E-Mail", contact.email);
  add("Branche", industryText(root.industry_classification));
  add("Schlagwörter", joinList(root.keywords));
  add("Produkte & Dienstleistungen", joinList(root.products_and_services));
  add("Unternehmenszweck", purposeText(root.purpose));

  if (!rows.length) return { title: "Unternehmensprofil", headers: ["Hinweis"], rows: [["Keine Daten verfügbar"]] };
  return { title: "Unternehmensprofil", headers: ["Feld", "Wert"], rows };
}

function profileText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Beteiligungs-Status (current/former) auf Deutsch. */
function statusDe(status: string): string {
  if (status === "current") return "Aktuell";
  if (status === "former") return "Ehemalig";
  return status;
}

function statusLabel(value: unknown): string {
  const s = typeof value === "string" ? value.toUpperCase() : "";
  if (s === "ACTIVE") return "Aktiv";
  if (s === "INACTIVE" || s === "LIQUIDATION") return s === "LIQUIDATION" ? "In Liquidation" : "Inaktiv";
  return typeof value === "string" ? value : "";
}

/** "2018-09-28T00:00:00+00:00" -> "28.09.2018". */
function formatGermanDate(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function formatAddress(addr: JsonRecord): string {
  const formatted = typeof addr.formatted_value === "string" ? addr.formatted_value.trim() : "";
  if (formatted) return formatted;
  const line1 = [addr.street, addr.house_number].map(profileText).filter(Boolean).join(" ");
  const line2 = [addr.postal_code, addr.city].map(profileText).filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

function industryText(value: unknown): string {
  const ic = asRecord(value);
  const list = asArray(ic.WZ2025).length ? asArray(ic.WZ2025) : asArray(ic.WZ2008);
  const labels = list.map((entry) => profileText(asRecord(entry).label)).filter(Boolean);
  return labels.join("; ");
}

function joinList(value: unknown): string {
  return asArray(value).map(profileText).filter(Boolean).join("; ");
}

function purposeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return profileText(asRecord(value).purpose);
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
