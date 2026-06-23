/**
 * Credit-Verbrauchszähler (vollständige, bereits existierende Implementierung).
 *
 * Persistente Datei: proxy/usage.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Landet sowohl unter tsx (src/) als auch kompiliert (dist/) in proxy/usage.json.
const USAGE_FILE = process.env.USAGE_FILE
  ? resolve(process.env.USAGE_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "usage.json");

export interface EndpointUsage {
  credits: number;
  calls: number;
}

export interface UsageSnapshot {
  totalCredits: number;
  totalCalls: number;
  since: string; // ISO-Zeitstempel des ersten gezählten Calls (bzw. Reset)
  byEndpoint: Record<string, EndpointUsage>;
}

function emptyUsage(): UsageSnapshot {
  return { totalCredits: 0, totalCalls: 0, since: new Date().toISOString(), byEndpoint: {} };
}

let usage: UsageSnapshot = load();

function load(): UsageSnapshot {
  try {
    const raw = JSON.parse(readFileSync(USAGE_FILE, "utf8")) as Partial<UsageSnapshot>;
    return {
      totalCredits: Number(raw.totalCredits) || 0,
      totalCalls: Number(raw.totalCalls) || 0,
      since: typeof raw.since === "string" ? raw.since : new Date().toISOString(),
      byEndpoint: raw.byEndpoint && typeof raw.byEndpoint === "object" ? raw.byEndpoint : {},
    };
  } catch {
    return emptyUsage(); // Datei fehlt/defekt -> frisch starten
  }
}

function persist(): void {
  try {
    writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[WARN] Konnte usage.json nicht schreiben:", (err as Error).message);
  }
}

export function creditCost(path: string): { credits: number; label: string } {
  const [pathname, qs] = path.split("?");
  const params = new URLSearchParams(qs ?? "");
  const seg = pathname.split("/").filter(Boolean); // z. B. ["v1","company","DE-…","owners"]

  if (seg[1] === "search-organizations") return { credits: 1, label: "search-organizations" };
  if (seg[1] === "fetch-organization") {
    const features = params.getAll("feature");
    const featureCredits: Record<string, number> = {
      financial_kpi: 1,
      balance_sheet_accounts: 3,
      profit_and_loss_account: 3,
      related_persons: 2,
      publications: 1,
      news: 10,
      insolvency_publications: 1,
      annual_financial_statements: 5,
      annual_financial_statements__html: 5,
      shareholders: 5,
      ubos: 10,
      shareholdings: 5,
      website_content: 0,
    };
    const credits = Math.max(5, features.reduce((sum, feature) => sum + (featureCredits[feature] ?? 0), 0));
    return { credits, label: "fetch-organization" };
  }
  if (seg[1] === "fetch-person") {
    const credits = params.getAll("feature").includes("shareholdings") ? 20 : 15;
    return { credits, label: "fetch-person" };
  }
  if (seg[1] === "fetch-document") return { credits: 5, label: "fetch-document" };

  const realtime = params.get("realtime") === "true";

  // Suche / Lookup
  if (seg[1] === "autocomplete") return { credits: 1, label: "autocomplete" };
  if (seg[1] === "search" && seg[2] === "company") return { credits: 10, label: "search/company" };
  if (seg[1] === "search" && seg[2] === "person") return { credits: 10, label: "search/person" };
  if (seg[1] === "search" && seg[2] === "lookup") return { credits: 10, label: "lookup" };

  // Firma + Unterressourcen
  if (seg[1] === "company") {
    const sub = seg[3]; // financials | contact | owners | ubo | holdings | undefined
    if (sub === "ubo") return { credits: 25, label: "company/ubo" };
    if (sub === "owners" && seg[4] === "historical")
      return { credits: 10, label: "company/owners/historical" };
    if (sub === "owners") return { credits: realtime ? 20 : 10, label: "company/owners" };
    if (sub === "financials") return { credits: 10, label: "company/financials" };
    if (sub === "contact") return { credits: 10, label: "company/contact" };
    if (sub === "holdings") return { credits: 10, label: "company/holdings" };
    return { credits: realtime ? 20 : 10, label: "company" }; // Stammdaten
  }

  // Person + Unterressourcen
  if (seg[1] === "person") {
    if (seg[3] === "holdings") return { credits: 10, label: "person/holdings" };
    return { credits: 10, label: "person" };
  }

  return { credits: 0, label: "sonstige" }; // unbekannt -> nicht raten
}

export function recordCall(path: string): void {
  const { credits, label } = creditCost(path);
  usage.totalCredits += credits;
  usage.totalCalls += 1;
  const e = usage.byEndpoint[label] ?? { credits: 0, calls: 0 };
  e.credits += credits;
  e.calls += 1;
  usage.byEndpoint[label] = e;
  persist();
}

export function getUsage(): UsageSnapshot {
  return usage;
}

export function resetUsage(): UsageSnapshot {
  usage = emptyUsage();
  persist();
  return usage;
}

// Adapter-Exports für den restlichen Code (erwartete Namen)
export async function recordUsage(pathStr: string, _method: "GET" | "POST"): Promise<void> {
  // Methode wird aktuell nicht benötigt, Pfad (inkl. Query) reicht zur Bestimmung
  recordCall(pathStr);
}

export function getUsageSummary(): UsageSnapshot {
  return getUsage();
}
