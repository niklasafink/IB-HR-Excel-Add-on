/**
 * Per-Nutzer-Zugang & Credit-Limits ("Tokens pro Nutzer").
 *
 * - Jeder Nutzer hat einen geheimen Zugangs-Token (nur als SHA-256-Hash gespeichert),
 *   ein Credit-Limit, einen Verbrauchszähler, sowie Schalter für "unlimited"
 *   (Limit vorübergehend aufheben) und "disabled" (gesperrt).
 * - Enforcement ist nur aktiv, wenn ein ADMIN_TOKEN gesetzt ist; sonst läuft der
 *   Proxy im offenen Modus (z. B. lokale Entwicklung).
 * - Persistenz: proxy/users.json (analog zu usage.json, gitignored).
 *
 * Die laufende Anfrage trägt ihre Nutzer-Identität über AsyncLocalStorage, damit
 * der eigentliche Credit-Verbrauch (erst bei echtem Upstream-Call) dem Nutzer
 * zugeordnet werden kann.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { requestContext } from "./context.js";
import { DEFAULT_TENANT_ID } from "./tenants.js";

const USERS_FILE = process.env.USERS_FILE
  ? resolve(process.env.USERS_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "users.json");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export interface User {
  id: string;
  name: string;
  /** Mandant (Kunde), zu dem dieser Nutzer gehört. */
  tenantId: string;
  tokenHash: string;
  /** Klartext-Token, damit der Admin ihn später wieder kopieren kann. */
  token: string;
  creditLimit: number;
  creditsUsed: number;
  unlimited: boolean;
  disabled: boolean;
  createdAt: string;
}

/** Öffentliche Sicht (ohne Geheimnis). */
export type PublicUser = Omit<User, "tokenHash">;

interface Store {
  users: User[];
}

let store: Store = load();
migrateUsers();

function load(): Store {
  try {
    const raw = JSON.parse(readFileSync(USERS_FILE, "utf8")) as Partial<Store>;
    return { users: Array.isArray(raw.users) ? (raw.users as User[]) : [] };
  } catch {
    return { users: [] };
  }
}

/** Bestehende Nutzer ohne Mandant dem Default-Mandanten zuordnen. */
function migrateUsers(): void {
  let changed = false;
  for (const user of store.users) {
    if (!user.tenantId) {
      user.tenantId = DEFAULT_TENANT_ID;
      changed = true;
    }
  }
  if (changed) persist();
}

function persist(): void {
  try {
    writeFileSync(USERS_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[WARN] Konnte users.json nicht schreiben:", (err as Error).message);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicView(user: User): PublicUser {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { tokenHash, ...rest } = user;
  return rest;
}

// ---- Status ------------------------------------------------------------

/** Enforcement (Token-Pflicht + Limits) ist nur mit gesetztem ADMIN_TOKEN aktiv. */
export function authEnabled(): boolean {
  return ADMIN_TOKEN.length > 0;
}

export function isAdminToken(token: string | undefined): boolean {
  return !!token && !!ADMIN_TOKEN && token === ADMIN_TOKEN;
}

// ---- Nutzer-Verwaltung (Admin) -----------------------------------------

export function listUsers(): PublicUser[] {
  return store.users.map(publicView);
}

export function createUser(
  name: string,
  creditLimit: number,
  tenantId: string = DEFAULT_TENANT_ID
): { user: PublicUser; token: string } {
  const token = randomBytes(24).toString("hex");
  const user: User = {
    id: randomBytes(8).toString("hex"),
    name: name.trim() || "Unbenannt",
    tenantId: tenantId || DEFAULT_TENANT_ID,
    tokenHash: hashToken(token),
    token,
    creditLimit: Number.isFinite(creditLimit) && creditLimit >= 0 ? Math.floor(creditLimit) : 0,
    creditsUsed: 0,
    unlimited: false,
    disabled: false,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  persist();
  return { user: publicView(user), token };
}

export function updateUser(
  id: string,
  patch: Partial<Pick<User, "name" | "creditLimit" | "unlimited" | "disabled" | "tenantId">>
): PublicUser | null {
  const user = store.users.find((u) => u.id === id);
  if (!user) return null;
  if (typeof patch.name === "string") user.name = patch.name.trim() || user.name;
  if (typeof patch.creditLimit === "number" && patch.creditLimit >= 0) user.creditLimit = Math.floor(patch.creditLimit);
  if (typeof patch.unlimited === "boolean") user.unlimited = patch.unlimited;
  if (typeof patch.disabled === "boolean") user.disabled = patch.disabled;
  if (typeof patch.tenantId === "string" && patch.tenantId) user.tenantId = patch.tenantId;
  persist();
  return publicView(user);
}

/** Verbrauchszähler eines Nutzers zurücksetzen. */
export function resetUser(id: string): PublicUser | null {
  const user = store.users.find((u) => u.id === id);
  if (!user) return null;
  user.creditsUsed = 0;
  persist();
  return publicView(user);
}

/** Neuen Zugangs-Token erzeugen (alter wird ungültig). */
export function rotateToken(id: string): { user: PublicUser; token: string } | null {
  const user = store.users.find((u) => u.id === id);
  if (!user) return null;
  const token = randomBytes(24).toString("hex");
  user.tokenHash = hashToken(token);
  user.token = token;
  persist();
  return { user: publicView(user), token };
}

export function deleteUser(id: string): boolean {
  const before = store.users.length;
  store.users = store.users.filter((u) => u.id !== id);
  if (store.users.length === before) return false;
  persist();
  return true;
}

// ---- Authentifizierung & Enforcement (Request-Pfad) --------------------

export function authenticateUser(token: string | undefined): User | null {
  if (!token) return null;
  const hash = hashToken(token);
  return store.users.find((u) => u.tokenHash === hash) ?? null;
}

export interface AccessCheck {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Prüft, ob der Token-Inhaber aktuell Anfragen stellen darf. */
export function checkAccess(token: string | undefined): { user: User | null; check: AccessCheck } {
  const user = authenticateUser(token);
  if (!user) return { user: null, check: { ok: false, status: 401, error: "Ungültiger oder fehlender Nutzer-Token." } };
  if (user.disabled) return { user, check: { ok: false, status: 403, error: "Dieser Nutzer ist gesperrt." } };
  if (!user.unlimited && user.creditsUsed >= user.creditLimit) {
    return {
      user,
      check: {
        ok: false,
        status: 402,
        error: `Token-Limit erreicht (${user.creditsUsed}/${user.creditLimit} Credits). Bitte Administrator kontaktieren.`,
      },
    };
  }
  return { user, check: { ok: true } };
}

/** Bucht verbrauchte Credits auf den Nutzer der laufenden Anfrage (no-op ohne Kontext). */
export function chargeCurrentUser(credits: number): void {
  if (credits <= 0) return;
  const ctx = requestContext.getStore();
  if (!ctx) return;
  const user = store.users.find((u) => u.id === ctx.userId);
  if (!user) return;
  user.creditsUsed += credits;
  persist();
}
