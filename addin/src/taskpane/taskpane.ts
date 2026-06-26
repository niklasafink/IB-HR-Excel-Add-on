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
  fetchUsage,
  YEAR_FEATURES,
  type ReportOptions,
  type ReportSummary,
  type TargetMode,
} from "../lib/report";
import {
  readTable,
  detectMapping,
  fillTable,
  columnLetter,
  TARGETS,
  NONE,
  NEW_COLUMN,
  type Mapping,
  type TableInfo,
  type TargetDef,
  type TargetKey,
} from "../lib/detect";

interface CompanyEntry {
  name: string;
  checked: boolean;
}

let companies: CompanyEntry[] = [];

Office.onReady((info) => {
  if (info.host !== Office.HostType.Excel) return;
  byId("app").classList.remove("hidden");

  byId<HTMLInputElement>("proxyUrl").value = proxyBaseUrl();
  byId<HTMLInputElement>("userToken").value = userToken();
  bindSettingsEvents();
  void testConnection(false);
  void refreshCredits();

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "detect") {
    initDetectView();
  } else {
    renderFeatureSelect();
    applyFeatureFromUrl();
    renderYearQuick();
    bindEvents();
    void refreshCompanies();
  }
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
}

/** Proxy/Token/Test – in beiden Modi (Report & Erkennen) verfügbar. */
function bindSettingsEvents(): void {
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
  // Leeres Feld + "+" -> die aktuell in Excel markierte Zelle übernehmen.
  if (!name) {
    void refreshCompanies();
    return;
  }
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
    updateCompanyTitle();
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
      updateCompanyTitle();
    });
  });
  container.querySelectorAll<HTMLButtonElement>("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.remove);
      companies.splice(index, 1);
      renderCompanyList();
    });
  });
  updateCompanyTitle();
}

/** Zeigt die aktuelle(n) Firma(en) als Titel unter „Gordon". */
function updateCompanyTitle(): void {
  const el = byId("companyTitle");
  const checked = selectedCompanies();
  const names = checked.length ? checked : companies.map((entry) => entry.name);
  if (!names.length) {
    el.textContent = "";
    return;
  }
  el.textContent = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

/** Holt den Credit-Stand vom Proxy und zeigt ihn oben rechts an. */
async function refreshCredits(): Promise<void> {
  const el = byId("credits");
  const usage = await fetchUsage();
  if (!usage) {
    el.innerHTML = "";
    return;
  }
  const fmt = (n: number): string => n.toLocaleString("de-DE");
  const remaining = usage.creditsRemaining === null ? "–" : fmt(usage.creditsRemaining);
  el.innerHTML = `<div><b>${remaining}</b> Credits</div><div>${fmt(usage.totalCredits)} verbraucht</div>`;
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
    void refreshCredits();
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

// ---- Erkennen-Modus (Spaltenzuordnung) ----------------------------------

let detectTable: TableInfo | null = null;
let detectMappingState: Mapping | null = null;

function initDetectView(): void {
  byId("reportView").classList.add("hidden");
  byId("detectView").classList.remove("hidden");
  byId("detectRescan").addEventListener("click", () => void rescanTable());
  byId("fillData").addEventListener("click", () => void runFill());
  void rescanTable();
}

async function rescanTable(): Promise<void> {
  setDetectStatus("lese Auswahl …");
  try {
    detectTable = await readTable();
    detectMappingState = detectMapping(detectTable.headers);
    byId("detectRange").textContent =
      `Tabelle ${detectTable.address} · ${detectTable.rowCount} Firmen, ${detectTable.colCount} Spalten`;
    renderMapping();
    setDetectStatus("");
  } catch (err) {
    detectTable = null;
    detectMappingState = null;
    byId("mappingList").innerHTML = "";
    byId("detectRange").textContent = "";
    setDetectStatus((err as Error).message, "err");
  }
}

function renderMapping(): void {
  if (!detectTable || !detectMappingState) return;
  const table = detectTable;
  const mapping = detectMappingState;

  byId("mappingList").innerHTML = TARGETS.map(
    (target) => `
      <div class="mapping-row">
        <span class="mapping-label">${escapeHtml(target.label)}</span>
        <select data-target="${target.key}">${mappingOptions(target, table, mapping[target.key])}</select>
      </div>`
  ).join("");

  byId("mappingList")
    .querySelectorAll<HTMLSelectElement>("select[data-target]")
    .forEach((select) => {
      select.addEventListener("change", () => {
        const key = select.dataset.target as TargetKey;
        if (detectMappingState) detectMappingState[key] = Number(select.value);
      });
    });
}

function mappingOptions(target: TargetDef, table: TableInfo, current: number): string {
  const options: string[] = [];
  const sel = (value: number): string => (value === current ? " selected" : "");
  if (target.output) options.push(`<option value="${NONE}"${sel(NONE)}>— nicht schreiben</option>`);
  for (let i = 0; i < table.colCount; i++) {
    const label = `${columnLetter(table.startCol + i)}: ${table.headers[i] || "(leer)"}`;
    options.push(`<option value="${i}"${sel(i)}>${escapeHtml(label)}</option>`);
  }
  if (target.output) options.push(`<option value="${NEW_COLUMN}"${sel(NEW_COLUMN)}>+ neue Spalte rechts</option>`);
  return options.join("");
}

async function runFill(): Promise<void> {
  if (!detectTable || !detectMappingState) {
    setDetectStatus("Bitte zuerst eine Tabelle einlesen.", "err");
    return;
  }
  const button = byId<HTMLButtonElement>("fillData");
  button.disabled = true;
  setDetectStatus("starte …");
  try {
    const summary = await fillTable(detectTable, detectMappingState, (p) => {
      setDetectStatus(`Firma ${p.done}/${p.total}: ${p.company} …`);
    });
    const failed = summary.failed.length
      ? ` ${summary.failed.length} fehlgeschlagen: ${summary.failed.map((f) => f.company).join(", ")}`
      : "";
    setDetectStatus(`${summary.filled} Zeile(n) gefüllt.${failed}`, summary.filled ? "ok" : "err");
  } catch (err) {
    setDetectStatus((err as Error).message, "err");
  } finally {
    button.disabled = false;
    void refreshCredits();
  }
}

function setDetectStatus(message: string, kind: "" | "ok" | "err" = ""): void {
  const el = byId("detectStatus");
  el.textContent = message;
  el.className = `status ${kind}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
}
