// Orchestriert pro Firmenname: Autocomplete -> company_id -> Financials/Company.

import { autocomplete, getCompany, getFinancials, ApiError } from "./api";
import type { AutocompleteResult, CompanyData, DataBlock } from "./types";

export interface ProgressUpdate {
  index: number;
  total: number;
  name: string;
  message: string;
}

// --- Namensabgleich ------------------------------------------------------

/** Normalisiert einen Firmennamen für den Vergleich (AG↔Aktiengesellschaft etc.). */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/aktiengesellschaft/g, "ag")
    .replace(/gesellschaft mit beschränkter haftung/g, "gmbh")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Erweitert gängige Abkürzungen, damit die Autocomplete bessere Treffer liefert. */
function expandQuery(q: string): string {
  return q
    .replace(/\bAG\b/gi, "Aktiengesellschaft")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean));
}

/** Ähnlichkeits-Score zwischen Suchbegriff und Treffer (höher = besser). */
function scoreMatch(query: string, result: AutocompleteResult): number {
  const nq = normalizeName(query);
  const nn = normalizeName(result.name);
  let score = 0;

  if (nn === nq) score += 1000;
  if (nn.startsWith(nq)) score += 80;

  // Token-Überlappung (Jaccard)
  const tq = tokens(query);
  const tn = tokens(result.name);
  let inter = 0;
  for (const t of tq) if (tn.has(t)) inter++;
  const union = new Set([...tq, ...tn]).size || 1;
  score += (inter / union) * 100;

  // Zweigstellen/Filialen abwerten – selten das gesuchte Hauptunternehmen
  if (/(filiale|zweigniederlassung|niederlassung)/i.test(result.name)) score -= 60;
  if (/\bi\.?\s*l\.?\b/i.test(result.name)) score -= 20; // in Liquidation

  if (result.active) score += 15;

  return score;
}

function pickBestMatch(results: AutocompleteResult[], query: string): AutocompleteResult {
  let best = results[0];
  let bestScore = -Infinity;
  for (const r of results) {
    const s = scoreMatch(query, r);
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

/** Sucht Treffer – bei schwacher Übereinstimmung mit expandiertem Begriff nachladen. */
async function resolveCompany(name: string): Promise<AutocompleteResult[]> {
  const map = new Map<string, AutocompleteResult>();
  const addAll = (rs: AutocompleteResult[]) => rs.forEach((r) => map.set(r.company_id, r));

  addAll((await autocomplete(name)).results || []);

  // Wenn kein gut passender Treffer dabei ist, mit expandiertem Begriff nachladen.
  const expanded = expandQuery(name);
  const current = [...map.values()];
  const bestScore = current.length ? Math.max(...current.map((r) => scoreMatch(name, r))) : -Infinity;
  if (expanded.toLowerCase() !== name.toLowerCase() && bestScore < 120) {
    addAll((await autocomplete(expanded)).results || []);
  }

  return [...map.values()];
}

export interface ResolveCandidate {
  result: AutocompleteResult;
  score: number;
  picked: boolean;
}

/** Debug-Hilfe für die Admin-Sidebar: zeigt Kandidaten + Score, markiert den gewählten. */
export async function debugResolve(name: string): Promise<ResolveCandidate[]> {
  const results = await resolveCompany(name);
  const scored = results
    .map((result) => ({ result, score: Math.round(scoreMatch(name, result)), picked: false }))
    .sort((a, b) => b.score - a.score);
  if (scored.length) scored[0].picked = true;
  return scored;
}

function needsFinancials(blocks: Set<DataBlock>): boolean {
  return blocks.has("aktiva") || blocks.has("passiva") || blocks.has("guv");
}

function needsCompany(blocks: Set<DataBlock>): boolean {
  return blocks.has("stammdaten") || blocks.has("kennzahlen");
}

/**
 * Lädt alle Firmen sequentiell (schont das Rate-Limit/Budget).
 * Fehler einzelner Firmen brechen den Gesamtlauf nicht ab.
 */
export async function loadAllCompanies(
  names: string[],
  blocks: Set<DataBlock>,
  onProgress: (u: ProgressUpdate) => void
): Promise<CompanyData[]> {
  const out: CompanyData[] = [];
  const total = names.length;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    onProgress({ index: i, total, name, message: "suche…" });

    const entry: CompanyData = { inputName: name, status: "ok" };

    try {
      const results = await resolveCompany(name);
      if (results.length === 0) {
        entry.status = "not_found";
        entry.error = "Keine Firma gefunden.";
        out.push(entry);
        onProgress({ index: i, total, name, message: "nicht gefunden" });
        continue;
      }

      const best = pickBestMatch(results, name);
      entry.companyId = best.company_id;
      entry.matchedName = best.name;
      if (normalizeName(best.name) !== normalizeName(name)) {
        entry.error = `Abweichender Treffer gewählt: ${best.name} (${best.company_id}).`;
      }

      if (needsFinancials(blocks)) {
        onProgress({ index: i, total, name, message: "lade Finanzdaten…" });
        entry.financials = await getFinancials(best.company_id);
      }
      if (needsCompany(blocks)) {
        onProgress({ index: i, total, name, message: "lade Stammdaten…" });
        entry.company = await getCompany(best.company_id);
      }

      onProgress({ index: i, total, name, message: "geladen" });
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof ApiError ? err.message : (err as Error).message;
      onProgress({ index: i, total, name, message: `Fehler: ${entry.error}` });
    }

    out.push(entry);
  }

  return out;
}
