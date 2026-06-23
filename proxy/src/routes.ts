import { Router, type Request, type Response } from "express";
import { proxyGet, proxyPost, UpstreamError } from "./openregister.js";
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
    proxyGet(`/v1/autocomplete/company?query=${enc(query)}`)
  );
});

// POST /api/search/company   { query, filters, pagination }
router.post("/search/company", async (req, res) => {
  try {
    res.json(await proxyPost(`/v1/search/company`, req.body ?? {}));
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/lookup?url=<WEBSITE>
router.get("/lookup", (req, res) => {
  requireParam(req, res, "url", (url) => proxyGet(`/v0/search/lookup?url=${enc(url)}`));
});

// ---- Firma --------------------------------------------------------------

// GET /api/company?company_id=<ID>[&realtime&export]
router.get("/company", (req, res) => {
  requireParam(req, res, "company_id", (id) =>
    proxyGet(withFlags(req, `/v1/company/${enc(id)}`, ["realtime", "export"]))
  );
});

// GET /api/financials?company_id=<ID>
router.get("/financials", (req, res) => {
  requireParam(req, res, "company_id", (id) => proxyGet(`/v1/company/${enc(id)}/financials`));
});

// GET /api/company/contact?company_id=<ID>   (veraltet)
router.get("/company/contact", (req, res) => {
  requireParam(req, res, "company_id", (id) => proxyGet(`/v0/company/${enc(id)}/contact`));
});

// ---- Eigentümer / Beteiligungen ----------------------------------------

// GET /api/company/owners?company_id=<ID>[&realtime&export&best_available]
router.get("/company/owners", (req, res) => {
  requireParam(req, res, "company_id", (id) =>
    proxyGet(withFlags(req, `/v1/company/${enc(id)}/owners`, ["realtime", "export", "best_available"]))
  );
});

// GET /api/company/ubo?company_id=<ID>
router.get("/company/ubo", (req, res) => {
  requireParam(req, res, "company_id", (id) => proxyGet(`/v1/company/${enc(id)}/ubo`));
});

// GET /api/company/holdings?company_id=<ID>
router.get("/company/holdings", (req, res) => {
  requireParam(req, res, "company_id", (id) => proxyGet(`/v1/company/${enc(id)}/holdings`));
});

// GET /api/company/historical-owners?company_id=<ID>
router.get("/company/historical-owners", (req, res) => {
  requireParam(req, res, "company_id", (id) => proxyGet(`/v1/company/${enc(id)}/owners/historical`));
});

// ---- Person -------------------------------------------------------------

// GET /api/person?person_id=<UUID>
router.get("/person", (req, res) => {
  requireParam(req, res, "person_id", (id) => proxyGet(`/v1/person/${enc(id)}`));
});

// GET /api/person/holdings?person_id=<UUID>
router.get("/person/holdings", (req, res) => {
  requireParam(req, res, "person_id", (id) => proxyGet(`/v1/person/${enc(id)}/holdings`));
});

// POST /api/search/person   { query, filters, pagination }
router.post("/search/person", async (req, res) => {
  try {
    res.json(await proxyPost(`/v1/search/person`, req.body ?? {}));
  } catch (err) {
    handleError(res, err);
  }
});
