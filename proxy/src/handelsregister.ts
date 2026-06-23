/**
 * Dünner Service gegen die handelsregister.ai-API.
 * Hält den API-Key serverseitig, normalisiert Fehler und cached
 * GET-Antworten pro Upstream-Pfad, um Credits zu sparen.
 *
 * Generische Bausteine:
 *   proxyGet(path)         – authentifizierter, gecachter GET
 *   proxyPost(path, body)  – authentifizierter POST (ungecacht, z. B. Suche)
 *
 * Die konkreten Endpunkte werden in routes.ts zusammengebaut.
 */

const BASE_URL = (
  process.env.HANDELSREGISTER_BASE_URL ||
  "https://handelsregister.ai/api"
).replace(/\/+$/, "");
const API_KEY = process.env.HANDELSREGISTER_API_KEY || "";
const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 86400) * 1000;
import { recordUsage, creditCost } from "./usage.js";
import { chargeCurrentUser } from "./users.js";

export class UpstreamError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.details = details;
  }
}

interface CacheEntry {
  expires: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires < nowMs()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expires: nowMs() + CACHE_TTL_MS });
}

// Date.now() in einer eigenen Funktion, damit Tests/Mocking einfach bleiben.
function nowMs(): number {
  return Date.now();
}

export function assertConfigured(): void {
  if (!API_KEY) {
    throw new UpstreamError(
      500,
      "HANDELSREGISTER_API_KEY ist nicht gesetzt. Bitte proxy/.env aus .env.example anlegen."
    );
  }
}

/**
 * Führt einen authentifizierten Request gegen die handelsregister.ai-API aus.
 * Retryt einmal bei 429 mit kurzem Backoff. Wirft UpstreamError bei Fehlern.
 */
async function apiRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  assertConfigured();
  const url = `${BASE_URL}${path}`;
  const hasBody = body !== undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "x-api-key": API_KEY,
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new UpstreamError(502, `Netzwerkfehler beim Aufruf der handelsregister.ai-API: ${(err as Error).message}`);
    }

    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await sleep(Math.min(retryAfter, 5) * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await safeJson(res);
      const message = errorMessageForStatus(res.status, body);
      throw new UpstreamError(res.status, message, body);
    }

    const json = await res.json();
    checkApiLevelError(json);
    return json as T;
  }

  throw new UpstreamError(429, "handelsregister.ai-API: Rate-Limit erreicht (429) - bitte später erneut versuchen.");
}

/**
 * handelsregister.ai liefert bei aufgebrauchten Credits HTTP 200 mit
 * { meta: { message: "Insufficient credits ..." } } statt eines Fehlerstatus.
 * Das würde sonst als (fast leeres) Ergebnis durchrutschen – hier hart abfangen.
 */
export function checkApiLevelError(body: unknown): void {
  if (typeof body !== "object" || body === null) return;
  const meta = (body as Record<string, unknown>).meta;
  if (typeof meta !== "object" || meta === null) return;
  const message = (meta as Record<string, unknown>).message;
  if (typeof message !== "string") return;
  if (/insufficient credits|no credits|credits.*(exhaust|remaining: ?0)/i.test(message)) {
    throw new UpstreamError(
      402,
      "handelsregister.ai-API: Keine Credits mehr verfügbar. Bitte Guthaben im handelsregister.ai-Dashboard aufladen.",
      body
    );
  }
}

export function errorMessageForStatus(status: number, body: unknown): string {
  const detail = extractErrorDetail(body);
  switch (status) {
    case 401:
    case 403:
      return "handelsregister.ai-API: Authentifizierung fehlgeschlagen (Key ungültig oder Credits aufgebraucht).";
    case 404: {
      const hint = "Bitte vollständigen Firmennamen inkl. Rechtsform verwenden (z. B. „OroraTech GmbH\").";
      return detail
        ? `handelsregister.ai-API: ${detail}. ${hint}`
        : `handelsregister.ai-API: Firma nicht gefunden. ${hint}`;
    }
    case 402:
      return "handelsregister.ai-API: Keine Credits mehr verfügbar.";
    case 429:
      return "handelsregister.ai-API: Rate-Limit erreicht (429).";
    default:
      return `handelsregister.ai-API-Fehler (${status})${detail ? ": " + detail : ""}.`;
  }
}

export function extractErrorDetail(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (typeof record.error === "object" && record.error !== null) {
    const error = record.error as Record<string, unknown>;
    if (typeof error.message === "string") return error.message;
    if (typeof error.code === "string") return error.code;
  }
  // FastAPI-Stil: { detail: [{ msg: "..." }] } oder { detail: "..." }
  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.detail)) {
    const first = record.detail[0];
    if (first && typeof first === "object" && typeof (first as Record<string, unknown>).msg === "string") {
      return (first as Record<string, unknown>).msg as string;
    }
  }
  return "";
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Öffentliche Service-Funktionen -------------------------------------

/** Authentifizierter, gecachter GET gegen einen beliebigen Upstream-Pfad. */
export async function proxyGet(path: string): Promise<unknown> {
  const key = `get:${path}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const result = await apiRequest<unknown>("GET", path);
  // Bei echten Upstream-Calls (Cache-Miss) Credits erfassen – global und pro Nutzer.
  try {
    await recordUsage(path, "GET");
    chargeCurrentUser(creditCost(path).credits);
  } catch {
    // ignore
  }
  cacheSet(key, result);
  return result;
}

/** Authentifizierter POST (ungecacht – Suchanfragen variieren stark). */
export async function proxyPost(path: string, body: unknown): Promise<unknown> {
  const result = await apiRequest<unknown>("POST", path, body);
  try {
    await recordUsage(path, "POST");
    chargeCurrentUser(creditCost(path).credits);
  } catch {
    // ignore
  }
  return result;
}
