/**
 * Mandanten (Kunden) – Multi-Tenant auf einem Server.
 *
 * Jeder Mandant kann einen **eigenen** handelsregister.ai-Key haben (`apiKey`) –
 * oder das Feld leer lassen, dann wird der **geteilte Default-Key** aus der
 * Umgebung (`HANDELSREGISTER_API_KEY`) genutzt (Reseller-Modell). Der Verbrauch
 * wird **pro Mandant** getrackt (für Abrechnung/Transparenz).
 *
 * Persistenz: proxy/tenants.json (analog users.json, gitignored).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { requestContext } from "./context.js";

const TENANTS_FILE = process.env.TENANTS_FILE
  ? resolve(process.env.TENANTS_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "tenants.json");

const DEFAULT_API_KEY = process.env.HANDELSREGISTER_API_KEY || "";
export const DEFAULT_TENANT_ID = "default";

export interface Tenant {
  id: string;
  name: string;
  apiKey: string; // "" => geteilter Default-Key
  creditsUsed: number;
  createdAt: string;
}

/** Öffentliche Sicht: nie den Klartext-Key, nur Hinweis + letzte 4 Zeichen. */
export interface PublicTenant {
  id: string;
  name: string;
  hasOwnKey: boolean;
  apiKeyHint: string;
  creditsUsed: number;
  createdAt: string;
}

interface Store {
  tenants: Tenant[];
}

let store: Store = load();

function load(): Store {
  try {
    const raw = JSON.parse(readFileSync(TENANTS_FILE, "utf8")) as Partial<Store>;
    return { tenants: Array.isArray(raw.tenants) ? (raw.tenants as Tenant[]) : [] };
  } catch {
    return { tenants: [] };
  }
}

function persist(): void {
  try {
    writeFileSync(TENANTS_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[WARN] Konnte tenants.json nicht schreiben:", (err as Error).message);
  }
}

function publicView(t: Tenant): PublicTenant {
  return {
    id: t.id,
    name: t.name,
    hasOwnKey: t.apiKey.length > 0,
    apiKeyHint: t.apiKey ? "…" + t.apiKey.slice(-4) : "",
    creditsUsed: t.creditsUsed,
    createdAt: t.createdAt,
  };
}

/** Stellt sicher, dass es immer den Default-Mandanten ("Standard") gibt. */
export function ensureDefaultTenant(): Tenant {
  let t = store.tenants.find((x) => x.id === DEFAULT_TENANT_ID);
  if (!t) {
    t = { id: DEFAULT_TENANT_ID, name: "Standard", apiKey: "", creditsUsed: 0, createdAt: new Date().toISOString() };
    store.tenants.unshift(t);
    persist();
  }
  return t;
}

export function getTenant(id: string): Tenant | null {
  return store.tenants.find((t) => t.id === id) ?? null;
}

/** Effektiver Key: eigener Mandanten-Key, sonst der geteilte Default-Key. */
export function effectiveApiKey(tenant: Tenant | null): string {
  return (tenant && tenant.apiKey) || DEFAULT_API_KEY;
}

// ---- Verwaltung (Admin) ------------------------------------------------

export function listTenants(): PublicTenant[] {
  return store.tenants.map(publicView);
}

export function createTenant(name: string, apiKey = ""): PublicTenant {
  const tenant: Tenant = {
    id: randomBytes(8).toString("hex"),
    name: name.trim() || "Unbenannt",
    apiKey: apiKey.trim(),
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  };
  store.tenants.push(tenant);
  persist();
  return publicView(tenant);
}

export function updateTenant(id: string, patch: { name?: string; apiKey?: string }): PublicTenant | null {
  const tenant = store.tenants.find((t) => t.id === id);
  if (!tenant) return null;
  if (typeof patch.name === "string" && patch.name.trim()) tenant.name = patch.name.trim();
  if (typeof patch.apiKey === "string") tenant.apiKey = patch.apiKey.trim();
  persist();
  return publicView(tenant);
}

export function resetTenant(id: string): PublicTenant | null {
  const tenant = store.tenants.find((t) => t.id === id);
  if (!tenant) return null;
  tenant.creditsUsed = 0;
  persist();
  return publicView(tenant);
}

export function deleteTenant(id: string): boolean {
  if (id === DEFAULT_TENANT_ID) return false; // Default-Mandant nicht löschbar
  const before = store.tenants.length;
  store.tenants = store.tenants.filter((t) => t.id !== id);
  if (store.tenants.length === before) return false;
  persist();
  return true;
}

// ---- Verbrauch (Request-Pfad) ------------------------------------------

/** Bucht verbrauchte Credits auf den Mandanten der laufenden Anfrage (no-op ohne Kontext). */
export function chargeCurrentTenant(credits: number): void {
  if (credits <= 0) return;
  const ctx = requestContext.getStore();
  if (!ctx) return;
  const tenant = store.tenants.find((t) => t.id === ctx.tenantId);
  if (!tenant) return;
  tenant.creditsUsed += credits;
  persist();
}

// Beim Laden sicherstellen, dass der Default-Mandant existiert.
ensureDefaultTenant();
