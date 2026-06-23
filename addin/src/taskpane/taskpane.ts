/* global Office, document, window */

import { API_FEATURES, featureByKey, type ApiFeature } from "../lib/features";
import {
  generateReports,
  readSelectedCompanies,
  proxyBaseUrl,
  setProxyBaseUrl,
  userToken,
  setUserToken,
  checkHealth,
  YEAR_FEATURES,
  type ReportOptions,
  type ReportSummary,
  type TargetMode,
} from "../lib/report";

interface CompanyEntry {
  name: string;
  checked: boolean;
}

let companies: CompanyEntry[] = [];

Office.onReady((info) => {
  if (info.host !== Office.HostType.Excel) return;
  byId("app").classList.remove("hidden");

  renderFeatureSelect();
  applyFeatureFromUrl();
  renderYearQuick();
  byId<HTMLInputElement>("proxyUrl").value = proxyBaseUrl();
  byId<HTMLInputElement>("userToken").value = userToken();
  bindEvents();
  void refreshCompanies();
  void testConnection(false);
});

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function bindEvents(): void {
  byId<HTMLSelectElement>("featureSelect").addEventListener("change", () => {
    const feature = currentFeature();
    renderFeatureInfo(feature);
    applyYearVisibility(feature);
  });
  byId("refreshCompanies").addEventListener("click", () => void refreshCompanies());
  byId("companyAddBtn").addEventListener("click", addManualCompany);
  byId<HTMLInputElement>("companyAdd").addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") addManualCompany();
  });
  byId("generate").addEventListener("click", () => void runGenerate());
  // Manuelle Eingabe hebt die Schnellauswahl-Markierung auf.
  for (const id of ["yearFrom", "yearTo"]) {
    byId<HTMLInputElement>(id).addEventListener("input", () => setActiveChip(null));
  }
  byId("testConn").addEventListener("click", () => void testConnection(true));
  byId<HTMLInputElement>("proxyUrl").addEventListener("change", () => {
    const normalized = setProxyBaseUrl(byId<HTMLInputElement>("proxyUrl").value);
    byId<HTMLInputElement>("proxyUrl").value = normalized;
    void testConnection(false);
  });
  byId<HTMLInputElement>("userToken").addEventListener("change", () => {
    setUserToken(byId<HTMLInputElement>("userToken").value);
  });
}

function renderFeatureSelect(): void {
  const select = byId<HTMLSelectElement>("featureSelect");
  const groups = [...new Set(API_FEATURES.map((feature) => feature.group))];
  select.innerHTML = groups
    .map((group) => {
      const options = API_FEATURES.filter((feature) => feature.group === group)
        .map((feature) => {
          const badge = feature.beta ? " (Beta)" : feature.group === "AI" ? " (KI)" : "";
          return `<option value="${feature.key}">${escapeHtml(feature.label + badge)}</option>`;
        })
        .join("");
      return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`;
    })
    .join("");
}

function applyFeatureFromUrl(): void {
  const feature = featureByKey(new URLSearchParams(window.location.search).get("feature"));
  byId<HTMLSelectElement>("featureSelect").value = feature.key;
  renderFeatureInfo(feature);
  applyYearVisibility(feature);
}

function currentFeature(): ApiFeature {
  return featureByKey(byId<HTMLSelectElement>("featureSelect").value);
}

function renderFeatureInfo(feature: ApiFeature): void {
  byId("featureInfo").innerHTML = [
    `<b>${escapeHtml(feature.label)}</b>`,
    feature.beta ? `<span> · Beta</span>` : "",
    `<span> · ${escapeHtml(feature.credits)} Credits</span>`,
    `<div>${escapeHtml(feature.description)}</div>`,
  ].join("");
}

function applyYearVisibility(feature: ApiFeature): void {
  byId("yearOption").style.display = YEAR_FEATURES.has(feature.key) ? "" : "none";
}

// ---- Jahr-Schnellauswahl ------------------------------------------------

/** Buttons für die letzten 3 Jahre + Spanne, statt Jahreszahlen zu tippen. */
function renderYearQuick(): void {
  const current = new Date().getFullYear();
  const years = [current - 1, current - 2, current - 3];
  const chips = years.map(
    (year) => `<button type="button" class="year-chip" data-from="${year}" data-to="${year}">${year}</button>`
  );
  chips.push(
    `<button type="button" class="year-chip" data-from="${current - 3}" data-to="${current - 1}">Letzte 3 Jahre</button>`
  );

  const container = byId("yearQuick");
  container.innerHTML = chips.join("");
  container.querySelectorAll<HTMLButtonElement>(".year-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setYearRange(Number(btn.dataset.from), Number(btn.dataset.to));
      setActiveChip(btn);
    });
  });
}

function setYearRange(from: number, to: number): void {
  byId<HTMLInputElement>("yearFrom").value = String(from);
  byId<HTMLInputElement>("yearTo").value = String(to);
}

function setActiveChip(active: HTMLElement | null): void {
  byId("yearQuick")
    .querySelectorAll<HTMLButtonElement>(".year-chip")
    .forEach((chip) => chip.classList.toggle("active", chip === active));
}

// ---- Firmen-Liste -------------------------------------------------------

async function refreshCompanies(): Promise<void> {
  const fromExcel = await readSelectedCompanies();
  const existing = new Map(companies.map((entry) => [entry.name.toLowerCase(), entry]));
  for (const name of fromExcel) {
    if (!existing.has(name.toLowerCase())) {
      const entry = { name, checked: true };
      existing.set(name.toLowerCase(), entry);
      companies.push(entry);
    }
  }
  renderCompanyList();
  if (!fromExcel.length && !companies.length) {
    setStatus("Keine Firma markiert – bitte Zellen mit Firmennamen markieren oder manuell hinzufügen.");
  }
}

function addManualCompany(): void {
  const input = byId<HTMLInputElement>("companyAdd");
  const name = input.value.trim();
  if (!name) return;
  if (!companies.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    companies.push({ name, checked: true });
  }
  input.value = "";
  renderCompanyList();
}

function renderCompanyList(): void {
  const container = byId("companyList");
  if (!companies.length) {
    container.innerHTML = `<p class="muted-line">Noch keine Firmen.</p>`;
    return;
  }
  container.innerHTML = companies
    .map(
      (entry, index) => `
      <label class="company-item">
        <input type="checkbox" data-index="${index}" ${entry.checked ? "checked" : ""} />
        <span>${escapeHtml(entry.name)}</span>
        <button type="button" class="remove-btn" data-remove="${index}" title="Entfernen">×</button>
      </label>`
    )
    .join("");

  container.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((box) => {
    box.addEventListener("change", () => {
      const index = Number(box.dataset.index);
      if (companies[index]) companies[index].checked = box.checked;
    });
  });
  container.querySelectorAll<HTMLButtonElement>("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.remove);
      companies.splice(index, 1);
      renderCompanyList();
    });
  });
}

function selectedCompanies(): string[] {
  return companies.filter((entry) => entry.checked).map((entry) => entry.name);
}

// ---- Report erzeugen ----------------------------------------------------

async function runGenerate(): Promise<void> {
  const names = selectedCompanies();
  if (!names.length) {
    setStatus("Keine Firma ausgewählt.", "err");
    return;
  }

  const feature = currentFeature();
  const options = readOptions();
  const button = byId<HTMLButtonElement>("generate");
  button.disabled = true;
  setStatus(`Erzeuge Report für ${names.length} Firma(en) …`);

  try {
    const summary = await generateReports(feature.key, names, options);
    setStatus(summarize(summary), summary.written.length ? "ok" : "err");
  } catch (err) {
    setStatus((err as Error).message, "err");
  } finally {
    button.disabled = false;
  }
}

function readOptions(): ReportOptions {
  return {
    yearFrom: parseYear(byId<HTMLInputElement>("yearFrom").value),
    yearTo: parseYear(byId<HTMLInputElement>("yearTo").value),
    target: byId<HTMLSelectElement>("targetMode").value as TargetMode,
  };
}

function parseYear(value: string): number | null {
  const num = Number(value.trim());
  return Number.isInteger(num) && num > 1900 && num < 3000 ? num : null;
}

function summarize(summary: ReportSummary): string {
  if (!summary.written.length) {
    return `Kein Report erstellt. Fehler: ${summary.failed[0]?.error ?? "unbekannt"}`;
  }
  const base = `${summary.written.length} Report(s) „${summary.featureLabel}" erstellt.`;
  if (!summary.failed.length) return base;
  return `${base} Fehlgeschlagen (${summary.failed.length}): ${summary.failed.map((f) => f.company).join(", ")}`;
}

// ---- Proxy / Status -----------------------------------------------------

async function testConnection(showStatus: boolean): Promise<void> {
  if (showStatus) setStatus("teste Verbindung …");
  const ok = await checkHealth();
  setHealth(ok);
  if (showStatus) setStatus(ok ? "Proxy OK" : "Proxy nicht erreichbar", ok ? "ok" : "err");
}

function setStatus(message: string, kind: "" | "ok" | "err" = ""): void {
  const el = byId("status");
  el.textContent = message;
  el.className = `status ${kind}`;
}

function setHealth(ok: boolean): void {
  byId("healthDot").className = `health-dot ${ok ? "ok" : "err"}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
}
