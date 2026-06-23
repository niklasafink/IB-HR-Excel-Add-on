import { Router, type Request, type Response } from "express";
import { proxyGet, UpstreamError } from "./handelsregister.js";
import { getUsageSummary, resetUsage } from "./usage.js";

export const router = Router();

function handleError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? null });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("Unerwarteter Fehler:", err);
  res.status(500).json({ error: "Interner Proxy-Fehler." });
}

const enc = encodeURIComponent;

type JsonRecord = Record<string, unknown>;

/** Liest einen Query-String-Parameter (getrimmt). */
function q(req: Request, name: string): string {
  return String(req.query[name] ?? "").trim();
}

/** Liest einen Bool-Query-Parameter ("true"/"1" => true). */
function boolQ(req: Request, name: string): boolean {
  const v = String(req.query[name] ?? "").toLowerCase();
  return v === "true" || v === "1";
}

/** Hängt gesetzte Bool-Flags als Query-String an einen Upstream-Pfad. */
function withFlags(req: Request, basePath: string, flags: string[]): string {
  const params = new URLSearchParams();
  for (const f of flags) if (boolQ(req, f)) params.set(f, "true");
  const s = params.toString();
  return s ? `${basePath}?${s}` : basePath;
}

function notSupported(res: Response, feature: string): void {
  res.status(501).json({
    error: `${feature} wird von handelsregister.ai in dieser Proxy-Kompatibilität noch nicht unterstützt.`,
  });
}

function searchOrganizationsPath(query: string, limit = 10, filters?: unknown): string {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (filters && typeof filters === "object") params.set("filters", JSON.stringify(filters));
  return `/v1/search-organizations?${params.toString()}`;
}

function fetchOrganizationPath(query: string, features: string[] = []): string {
  const params = new URLSearchParams({ q: query });
  for (const feature of features) params.append("feature", feature);
  return `/v1/fetch-organization?${params.toString()}`;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeSearchResult(item: unknown): JsonRecord {
  const r = asRecord(item);
  const registration = asRecord(r.registration);
  return {
    company_id: firstString(r.entity_id, r.company_id, r.id),
    name: text(r.name),
    country: firstString(asRecord(r.address).country) || null,
    register_number: text(registration.register_number),
    register_type: text(registration.register_type),
    register_court: text(registration.court),
    active: text(r.status).toUpperCase() !== "INACTIVE",
    legal_form: text(r.legal_form),
    raw: r,
  };
}

function normalizeOrganization(data: unknown): JsonRecord {
  const d = asRecord(data);
  const address = asRecord(d.address);
  const registration = asRecord(d.registration);
  const contact = asRecord(d.contact_data);
  return {
    ...d,
    id: firstString(d.entity_id, d.id),
    name: { name: text(d.name) },
    address: {
      ...address,
      formatted_value:
        firstString(address.formatted_value) ||
        [address.street, address.house_number, address.postal_code, address.city].filter(Boolean).join(" "),
    },
    register: {
      register_number: text(registration.register_number),
      register_type: text(registration.register_type),
      register_court: text(registration.court),
    },
    incorporated_at: text(d.registration_date),
    purpose: typeof d.purpose === "string" ? { purpose: d.purpose } : d.purpose,
    representation: asArray(asRecord(d.related_persons).current).map((person) => {
      const p = asRecord(person);
      const role = asRecord(p.role);
      const roleDe = asRecord(role.de);
      return { name: text(p.name), role: firstString(roleDe.long, role.de, role.en, p.label) };
    }),
    contact: {
      email: firstString(contact.email),
      phone: firstString(contact.phone_number, contact.phone),
      website_url: firstString(contact.website, contact.website_url),
      vat_id: firstString(contact.vat_id),
    },
    indicators: asArray(d.financial_kpi).map((item) => {
      const kpi = asRecord(item);
      const year = Number(kpi.year);
      return {
        date: year ? `${year}-12-31` : "",
        revenue: numberOrNull(kpi.revenue),
        net_income: numberOrNull(kpi.net_income),
        employees: numberOrNull(kpi.employees),
        balance_sheet_total: numberOrNull(kpi.bs_assets_total ?? kpi.balance_sheet_total ?? kpi.assets_total),
        equity: numberOrNull(kpi.bs_equity_total ?? kpi.equity),
        liabilities: numberOrNull(kpi.bs_liabilities_total ?? kpi.liabilities),
        cash: numberOrNull(kpi.bs_cash_and_equivalents ?? kpi.cash),
      };
    }),
  };
}

function yearFromRecord(record: JsonRecord): string {
  const raw = firstString(record.date, record.report_end_date, record.fiscal_year_end, record.year);
  if (/^\d{4}$/.test(raw)) return `${raw}-12-31`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const year = Number(record.year);
  return year ? `${year}-12-31` : "";
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function appendValueRow(rows: JsonRecord[], key: string, label: string, date: string, value: unknown): void {
  const num = numberOrNull(value);
  if (!date || num === null) return;
  let row = rows.find((candidate) => candidate.name === key);
  if (!row) {
    row = { name: key, formatted_name: label, values: {} };
    rows.push(row);
  }
  asRecord(row.values)[date] = num;
}

function rowsFromFeature(feature: unknown, fallbackKeys: string[]): JsonRecord[] {
  const rows: JsonRecord[] = [];
  for (const item of asArray(feature)) {
    const record = asRecord(item);
    const date = yearFromRecord(record);
    const nestedRows = asArray(record.rows);
    if (nestedRows.length) {
      rows.push(...nestedRows.map(asRecord));
      continue;
    }
    const accounts = asRecord(record.accounts);
    const source = Object.keys(accounts).length ? accounts : record;
    for (const [key, value] of Object.entries(source)) {
      if (["year", "date", "report_end_date", "fiscal_year_end", "accounts"].includes(key)) continue;
      appendValueRow(rows, key, labelFromKey(key), date, value);
    }
  }
  for (const key of fallbackKeys) {
    if (!rows.some((row) => row.name === key)) rows.push({ name: key, formatted_name: labelFromKey(key), values: {} });
  }
  return rows.filter((row) => Object.keys(asRecord(row.values)).length > 0 || asArray(row.children).length > 0);
}

function normalizeFinancials(data: unknown): JsonRecord {
  const d = asRecord(data);
  const balanceRows = rowsFromFeature(d.balance_sheet_accounts, [
    "bs_assets_total",
    "bs_equity_total",
    "bs_liabilities_total",
    "bs_cash_and_equivalents",
  ]);
  const plRows = rowsFromFeature(d.profit_and_loss_account, ["pl_revenue", "pl_net_income", "pl_ebit"]);
  const kpiRows = rowsFromFeature(d.financial_kpi, [
    "revenue",
    "net_income",
    "employees",
    "balance_sheet_total",
    "equity",
    "liabilities",
    "cash",
  ]);
  const dates = new Set<string>();
  for (const row of [...balanceRows, ...plRows, ...kpiRows]) {
    for (const date of Object.keys(asRecord(row.values))) dates.add(date);
  }
  const passivaRows = balanceRows.filter((row) => /equity|liabilit|capital/i.test(String(row.name)));
  const aktivaRows = balanceRows.filter((row) => !passivaRows.includes(row));
  return {
    reports: [...dates].sort().map((date) => ({
      report_id: date,
      consolidated: false,
      report_start_date: `${date.slice(0, 4)}-01-01`,
      report_end_date: date,
    })),
    merged: {
      aktiva: { rows: aktivaRows.length ? aktivaRows : kpiRows.filter((row) => /asset|cash/i.test(String(row.name))) },
      passiva: { rows: passivaRows },
      guv: { rows: plRows.length ? plRows : kpiRows.filter((row) => /revenue|income|ebit/i.test(String(row.name))) },
    },
  };
}

function filtersFromLegacyBody(body: unknown): JsonRecord {
  const out: JsonRecord = {};
  const b = asRecord(body);
  const scalar = (value: unknown): unknown => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  };
  for (const condition of asArray(b.filters)) {
    const c = asRecord(condition);
    const field = text(c.field);
    if (!field) continue;
    if (c.value !== undefined) out[field] = scalar(c.value);
    else if (Array.isArray(c.values)) out[field] = c.values.map(scalar);
    else {
      const range: JsonRecord = {};
      if (c.min !== undefined) range.gte = Number(c.min) || c.min;
      if (c.max !== undefined) range.lte = Number(c.max) || c.max;
      if (Object.keys(range).length) out[field] = range;
    }
  }
  const location = asRecord(b.location);
  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    out.location_coordinates = { lat: location.latitude, lon: location.longitude };
    if (typeof location.radius === "number") out.location_max_distance_km = location.radius;
  }
  return out;
}

/** Wrapper: prüft einen Pflicht-Query-Parameter und ruft danach den Handler. */
function requireParam(
  req: Request,
  res: Response,
  name: string,
  run: (value: string) => Promise<unknown>
): void {
  const value = q(req, name);
  if (!value) {
    res.status(400).json({ error: `Parameter '${name}' fehlt.` });
    return;
  }
  run(value)
    .then((data) => res.json(data))
    .catch((err) => handleError(res, err));
}

function requireValue(
  res: Response,
  name: string,
  value: string,
  run: (value: string) => Promise<unknown>
): void {
  if (!value) {
    res.status(400).json({ error: `Parameter '${name}' fehlt.` });
    return;
  }
  run(value)
    .then((data) => res.json(data))
    .catch((err) => handleError(res, err));
}

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Usage (Dev): aktueller Credit-Verbrauch
router.get("/usage", (_req, res) => {
  try {
    res.json(getUsageSummary());
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/usage/reset", async (_req, res) => {
  try {
    await resetUsage();
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ---- Suche --------------------------------------------------------------

// GET /api/autocomplete?query=<NAME>
router.get("/autocomplete", (req, res) => {
  requireParam(req, res, "query", (query) =>
    proxyGet(searchOrganizationsPath(query)).then((data) => ({
      results: asArray(asRecord(data).results).map(normalizeSearchResult),
    }))
  );
});

// POST /api/search/company   { query, filters, pagination }
router.post("/search/company", async (req, res) => {
  try {
    const body = asRecord(req.body);
    const queryRecord = asRecord(body.query);
    const query = firstString(queryRecord.value, body.q, body.query) || "GmbH";
    const pagination = asRecord(body.pagination);
    const limit = Number(pagination.per_page) || Number(body.limit) || 10;
    const filters = filtersFromLegacyBody(body);
    const data = await proxyGet(searchOrganizationsPath(query, limit, filters));
    res.json({
      ...asRecord(data),
      results: asArray(asRecord(data).results).map(normalizeSearchResult),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/lookup?url=<WEBSITE>
router.get("/lookup", (req, res) => {
  void req;
  notSupported(res, "Website-Lookup");
});

// ---- Firma --------------------------------------------------------------

// GET /api/organization?q=<NAME>&feature=<FEATURE>[&feature=<FEATURE>...]
router.get("/organization", (req, res) => {
  const query = q(req, "q");
  const rawFeatures = req.query.feature;
  const features = (Array.isArray(rawFeatures) ? rawFeatures : rawFeatures ? [rawFeatures] : [])
    .map((feature) => String(feature).trim())
    .filter(Boolean);
  requireValue(res, "q", query, (value) => proxyGet(fetchOrganizationPath(value, features)));
});

// GET /api/company?company_id=<ID>[&q=<NAME>]
router.get("/company", (req, res) => {
  const search = q(req, "q") || q(req, "company_id");
  requireValue(res, "q", search, (query) =>
    proxyGet(fetchOrganizationPath(query, ["financial_kpi", "related_persons"])).then(normalizeOrganization)
  );
});

// GET /api/financials?company_id=<ID>[&q=<NAME>]
router.get("/financials", (req, res) => {
  const search = q(req, "q") || q(req, "company_id");
  requireValue(res, "q", search, (query) =>
    proxyGet(fetchOrganizationPath(query, ["financial_kpi", "balance_sheet_accounts", "profit_and_loss_account"])).then(
      normalizeFinancials
    )
  );
});

// GET /api/company/contact?company_id=<ID>   (veraltet)
router.get("/company/contact", (req, res) => {
  void req;
  notSupported(res, "Kontaktdaten-Endpunkt");
});

// ---- Eigentümer / Beteiligungen ----------------------------------------

// GET /api/company/owners?company_id=<ID>[&realtime&export&best_available]
router.get("/company/owners", (req, res) => {
  const search = q(req, "q") || q(req, "company_id");
  requireValue(res, "q", search, (query) =>
    proxyGet(fetchOrganizationPath(query, ["shareholders"])).then((data) => ({
      company_id: q(req, "company_id"),
      owners: asArray(asRecord(data).shareholders),
    }))
  );
});

// GET /api/company/ubo?company_id=<ID>
router.get("/company/ubo", (req, res) => {
  const search = q(req, "q") || q(req, "company_id");
  requireValue(res, "q", search, (query) =>
    proxyGet(fetchOrganizationPath(query, ["ubos"])).then((data) => ({
      company_id: q(req, "company_id"),
      ubos: asArray(asRecord(data).ubos),
    }))
  );
});

// GET /api/company/holdings?company_id=<ID>
router.get("/company/holdings", (req, res) => {
  const search = q(req, "q") || q(req, "company_id");
  requireValue(res, "q", search, (query) =>
    proxyGet(fetchOrganizationPath(query, ["shareholdings"])).then((data) => ({
      company_id: q(req, "company_id"),
      holdings: asArray(asRecord(data).shareholdings),
    }))
  );
});

// GET /api/company/historical-owners?company_id=<ID>
router.get("/company/historical-owners", (req, res) => {
  void req;
  notSupported(res, "Historische Eigentümer");
});

// ---- Person -------------------------------------------------------------

// GET /api/person?person_id=<UUID>
router.get("/person", (req, res) => {
  const person = q(req, "person_q") || q(req, "person_id");
  const organization = q(req, "organization_q") || q(req, "organization") || q(req, "company_id") || "GmbH";
  requireValue(res, "person_q", person, (personQ) =>
    proxyGet(`/v1/fetch-person?person_q=${enc(personQ)}&organization_q=${enc(organization)}`)
  );
});

// GET /api/person/holdings?person_id=<UUID>
router.get("/person/holdings", (req, res) => {
  const person = q(req, "person_q") || q(req, "person_id");
  const organization = q(req, "organization_q") || q(req, "organization") || q(req, "company_id") || "GmbH";
  requireValue(res, "person_q", person, (personQ) =>
    proxyGet(`/v1/fetch-person?person_q=${enc(personQ)}&organization_q=${enc(organization)}&feature=shareholdings`)
  );
});

// POST /api/search/person   { query, filters, pagination }
router.post("/search/person", async (req, res) => {
  void req;
  notSupported(res, "Personensuche per Filter");
});

// GET /api/document?company_id=<ID>&document_category=<TYPE>
router.get("/document", (req, res) => {
  void req;
  notSupported(res, "Dokument-Download");
});
