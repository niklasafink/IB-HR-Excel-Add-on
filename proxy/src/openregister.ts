/**
 * Dünner Service gegen die OpenRegister-API.
 * Hält den API-Key (Bearer) serverseitig, normalisiert Fehler und cached
 * GET-Antworten pro Upstream-Pfad, um Credits zu sparen.
 *
 * Generische Bausteine:
 *   proxyGet(path)         – authentifizierter, gecachter GET
 *   proxyPost(path, body)  – authentifizierter POST (ungecacht, z. B. Suche)
 *
 * Die konkreten Endpunkte werden in routes.ts zusammengebaut. Übersicht:
 *   GET  /v1/autocomplete/company?query=            (1)
 *   POST /v1/search/company                         (10)
 *   GET  /v1/company/{id}[?realtime&export]         (10, +10 realtime)
 *   GET  /v1/company/{id}/financials                (10)
 *   GET  /v0/company/{id}/contact                   (10, veraltet)
 *   GET  /v1/company/{id}/owners[?realtime&export&best_available]  (10/20)
 *   GET  /v1/company/{id}/ubo                       (25)
 *   GET  /v1/company/{id}/holdings                  (10)
 *   GET  /v1/company/{id}/owners/historical         (10)
 *   GET  /v1/person/{person_id}                     (10)
 *   POST /v1/search/person                          (10)
 *   GET  /v1/person/{person_id}/holdings            (10)
 *   GET  /v0/search/lookup?url=                     (10)
 */

const BASE_URL = (process.env.OPENREGISTER_BASE_URL || "https://api.openregister.de").replace(/\/+$/, "");
const API_KEY = process.env.OPENREGISTER_API_KEY || "";
const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 86400) * 1000;
import { recordUsage } from "./usage.js";

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
      "OPENREGISTER_API_KEY ist nicht gesetzt. Bitte proxy/.env aus .env.example anlegen."
    );
  }
}

/**
 * Führt einen authentifizierten Request gegen die OpenRegister-API aus.
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
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new UpstreamError(502, `Netzwerkfehler beim Aufruf der OpenRegister-API: ${(err as Error).message}`);
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

    return (await res.json()) as T;
  }

  throw new UpstreamError(429, "OpenRegister-API: Rate-Limit erreicht (429) – bitte später erneut versuchen.");
}

function errorMessageForStatus(status: number, body: unknown): string {
  const detail = typeof body === "object" && body !== null && "message" in body
    ? String((body as Record<string, unknown>).message)
    : "";
  switch (status) {
    case 401:
    case 403:
      return "OpenRegister-API: Authentifizierung fehlgeschlagen (Key ungültig oder Credits aufgebraucht).";
    case 404:
      return "OpenRegister-API: Nicht gefunden.";
    case 402:
      return "OpenRegister-API: Keine Credits mehr verfügbar.";
    case 429:
      return "OpenRegister-API: Rate-Limit erreicht (429).";
    default:
      return `OpenRegister-API-Fehler (${status})${detail ? ": " + detail : ""}.`;
  }
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
  // Bei echten Upstream-Calls (Cache-Miss) Credits erfassen
  try {
    await recordUsage(path, "GET");
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
  } catch {
    // ignore
  }
  return result;
}
