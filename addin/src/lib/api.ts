// Dünner Client gegen den Backend-Proxy. Das Add-in kennt NUR die Proxy-URL,
// niemals den OpenRegister-Key.

import type { AutocompleteResponse, CompanyResponse, FinancialsResponse } from "./types";
import { getConfig } from "./config";

// Standard-Proxy-URL (lokal). Über das Admin-Panel überschreibbar.
const DEFAULT_PROXY_BASE_URL = "https://localhost:3001/api";

/** Aktive Proxy-URL: Admin-Override aus der Konfig oder Standard. */
export function proxyBaseUrl(): string {
  const override = getConfig().proxyUrl?.trim();
  return override ? override.replace(/\/+$/, "") : DEFAULT_PROXY_BASE_URL;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const baseUrl = proxyBaseUrl();
  const hasBody = body !== undefined;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new ApiError(
      0,
      `Proxy nicht erreichbar (${baseUrl}). Läuft der Proxy und sind die HTTPS-Zertifikate akzeptiert? (${(err as Error).message})`
    );
  }

  if (!res.ok) {
    let message = `Proxy-Fehler (${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, "GET");
}

/**
 * Generischer Aufruf für den API-Explorer im Dev-Panel.
 * `path` ist relativ zur Proxy-Basis (z. B. "/company/ubo?company_id=…").
 * Gibt die rohe JSON-Antwort zurück.
 */
export function callEndpoint(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<unknown> {
  return request<unknown>(path, method, body);
}

export function autocomplete(query: string): Promise<AutocompleteResponse> {
  return get<AutocompleteResponse>(`/autocomplete?query=${encodeURIComponent(query)}`);
}

export function health(): Promise<{ ok: boolean }> {
  return get<{ ok: boolean }>(`/health`);
}

export function getCompany(companyId: string): Promise<CompanyResponse> {
  return get<CompanyResponse>(`/company?company_id=${encodeURIComponent(companyId)}`);
}

export function getFinancials(companyId: string): Promise<FinancialsResponse> {
  return get<FinancialsResponse>(`/financials?company_id=${encodeURIComponent(companyId)}`);
}

export function getUsage(): Promise<unknown> {
  return get<unknown>(`/usage`);
}

export function resetUsage(): Promise<unknown> {
  return request<unknown>(`/usage/reset`, "POST");
}
