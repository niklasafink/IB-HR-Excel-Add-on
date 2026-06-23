/* global Office, document, window, performance */

// Admin-/Entwickler-Sidebar: Verbindungsstatus, Firmensuche-Debug und
// persistente Konfiguration (wird von den Ribbon-Buttons gelesen).

import { health, proxyBaseUrl, autocomplete, callEndpoint, getUsage, resetUsage } from "../lib/api";
import { debugResolve } from "../lib/loader";
import { ENDPOINTS, type EndpointDef, type EndpointParam } from "../lib/endpoints";
import {
  FILTER_OP_LABELS,
  eurToCents,
  type FilterFieldDef,
  type FilterOp,
  type FilterCondition,
} from "../lib/filters";
import {
  getConfig,
  saveConfig,
  KENNZAHLEN_FIELDS,
  STAMMDATEN_FIELDS,
  type AdminConfig,
  type ValueScale,
} from "../lib/config";

Office.onReady((info) => {
  if (info.host !== Office.HostType.Excel) return;
  document.getElementById("app")!.classList.remove("hidden");

  loadConfigIntoForm();
  renderInfo();
  renderUsage();
  initApiExplorer();
  
  // Wenn URL-Parameter "endpoint" vorhanden, automatisch laden
  const urlParams = new URLSearchParams(window.location.search);
  const endpointId = urlParams.get("endpoint");
  if (endpointId && ENDPOINTS.find((e) => e.id === endpointId)) {
    byId<HTMLSelectElement>("apiEndpoint").value = endpointId;
    renderEndpointForm();
    // Kleine Verzögerung vor automatischem Request wenn company_id vorhanden
    setTimeout(() => {
      const cidInput = document.querySelector<HTMLInputElement>('#apiParams input[data-param="company_id"]');
      if (cidInput && cidInput.value.trim()) {
        void sendApiRequest();
      }
    }, 100);
  }

  byId("testConn").addEventListener("click", testConnection);
  byId("debugSearch").addEventListener("click", runDebugSearch);
  byId("saveCfg").addEventListener("click", onSave);
  // Usage controls
  const refreshBtn = document.getElementById("refreshUsage");
  if (refreshBtn) refreshBtn.addEventListener("click", () => renderUsage());
  const resetBtn = document.getElementById("resetUsage");
  if (resetBtn) resetBtn.addEventListener("click", async () => {
    setStatus("apiStatus", "lösche…");
    try {
      await resetUsage();
      await renderUsage();
      setStatus("apiStatus", "Usage zurückgesetzt", "success");
    } catch (err) {
      setStatus("apiStatus", (err as Error).message, "error");
    }
  });
});

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function setStatus(id: string, msg: string, kind: "" | "error" | "success" = ""): void {
  const el = byId(id);
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function renderFieldChecks(
  containerId: string,
  defs: Array<{ key: string; label: string }>,
  selected: string[]
): void {
  byId(containerId).innerHTML = defs
    .map((f) => {
      const checked = selected.includes(f.key) ? "checked" : "";
      return `<label><input type="checkbox" data-field="${f.key}" ${checked}/> ${f.label}</label>`;
    })
    .join("");
}

function readFieldChecks(containerId: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`#${containerId} input[data-field]:checked`)
  ).map((el) => el.dataset.field!);
}

function loadConfigIntoForm(): void {
  const cfg = getConfig();
  byId<HTMLInputElement>("proxyUrl").value = cfg.proxyUrl;
  byId<HTMLInputElement>("autoYearCount").value = String(cfg.autoYearCount);
  byId<HTMLSelectElement>("scale").value = cfg.scale;
  byId<HTMLInputElement>("removeEmpty").checked = cfg.removeEmpty;
  byId<HTMLInputElement>("centsToEuro").checked = cfg.centsToEuro;
  renderFieldChecks("kzFields", KENNZAHLEN_FIELDS, cfg.kennzahlenFields);
  renderFieldChecks("stFields", STAMMDATEN_FIELDS, cfg.stammdatenFields);
}

function renderInfo(): void {
  byId("info").innerHTML = [
    `<div><b>Version:</b> 1.0.0</div>`,
    `<div><b>Aktive Proxy-URL:</b> ${escapeHtml(proxyBaseUrl())}</div>`,
    `<div><b>Add-in-Origin:</b> ${escapeHtml(window.location.origin)}</div>`,
    `<div><b>Plattform:</b> ${escapeHtml(String(Office.context.platform ?? ""))}</div>`,
  ].join("");
}

async function testConnection(): Promise<void> {
  setStatus("connStatus", "teste…");
  // Eventuell geänderte URL zuerst speichern, damit der Test sie nutzt.
  await persist();
  const t0 = performance.now();
  try {
    const res = await health();
    const ms = Math.round(performance.now() - t0);
    if (res.ok) setStatus("connStatus", `OK (${ms} ms)`, "success");
    else setStatus("connStatus", "Antwort ohne ok=true", "error");
  } catch (err) {
    setStatus("connStatus", (err as Error).message, "error");
  }
  renderInfo();
}

async function runDebugSearch(): Promise<void> {
  const name = byId<HTMLInputElement>("debugName").value.trim();
  const ul = byId("debugResults");
  ul.innerHTML = "";
  if (!name) return;
  await persist();
  ul.innerHTML = "<li>suche…</li>";
  try {
    // Roh-Treffer (Reihenfolge der API) + bewertete Auswahl.
    const [raw, ranked] = await Promise.all([autocomplete(name), debugResolve(name)]);
    if (!ranked.length) {
      ul.innerHTML = `<li>Keine Treffer (API lieferte ${raw.results?.length ?? 0}).</li>`;
      return;
    }
    ul.innerHTML = ranked
      .slice(0, 8)
      .map((c) => {
        const cls = c.picked ? "picked" : "";
        const act = c.result.active ? "aktiv" : "inaktiv";
        return `<li class="${cls} clickable" data-cid="${escapeHtml(c.result.company_id)}" title="company_id in den API Explorer übernehmen">${c.picked ? "➤ " : ""}${escapeHtml(c.result.name)}<br>
          <span class="id">${escapeHtml(c.result.company_id)} · ${act} · Score ${c.score}</span></li>`;
      })
      .join("");
    ul.querySelectorAll<HTMLLIElement>("li[data-cid]").forEach((li) => {
      li.addEventListener("click", () => useCompanyId(li.dataset.cid!));
    });
  } catch (err) {
    ul.innerHTML = `<li class="err">${escapeHtml((err as Error).message)}</li>`;
  }
}

/** Übernimmt eine company_id in das company_id-Feld des aktiven Explorer-Endpunkts. */
function useCompanyId(companyId: string): void {
  const input = document.querySelector<HTMLInputElement>('#apiParams input[data-param="company_id"]');
  if (input) {
    input.value = companyId;
    setStatus("apiStatus", `company_id übernommen: ${companyId}`, "success");
  } else {
    setStatus("apiStatus", `Wähle oben einen Endpunkt mit company_id (${companyId}).`);
  }
}

function formValues(): AdminConfig {
  const count = Number(byId<HTMLInputElement>("autoYearCount").value) || 5;
  return {
    proxyUrl: byId<HTMLInputElement>("proxyUrl").value.trim(),
    autoYearCount: Math.min(10, Math.max(1, count)),
    scale: byId<HTMLSelectElement>("scale").value as ValueScale,
    removeEmpty: byId<HTMLInputElement>("removeEmpty").checked,
    centsToEuro: byId<HTMLInputElement>("centsToEuro").checked,
    kennzahlenFields: readFieldChecks("kzFields"),
    stammdatenFields: readFieldChecks("stFields"),
  };
}

async function persist(): Promise<void> {
  await saveConfig(formValues());
}

async function onSave(): Promise<void> {
  setStatus("saveStatus", "speichere…");
  try {
    await persist();
    setStatus("saveStatus", "gespeichert ✓", "success");
    renderInfo();
  } catch (err) {
    setStatus("saveStatus", (err as Error).message, "error");
  }
}

// ---- API Explorer -------------------------------------------------------

function currentEndpoint(): EndpointDef {
  const id = byId<HTMLSelectElement>("apiEndpoint").value;
  return ENDPOINTS.find((e) => e.id === id) ?? ENDPOINTS[0];
}

function initApiExplorer(): void {
  const sel = byId<HTMLSelectElement>("apiEndpoint");
  // Gruppiert als <optgroup> rendern, Reihenfolge wie im Katalog.
  const groups: string[] = [];
  for (const e of ENDPOINTS) if (!groups.includes(e.group)) groups.push(e.group);
  sel.innerHTML = groups
    .map((g) => {
      const opts = ENDPOINTS.filter((e) => e.group === g)
        .map((e) => `<option value="${e.id}">${escapeHtml(e.label)}</option>`)
        .join("");
      return `<optgroup label="${escapeHtml(g)}">${opts}</optgroup>`;
    })
    .join("");

  sel.addEventListener("change", renderEndpointForm);
  byId("apiSend").addEventListener("click", sendApiRequest);
  byId("apiCopy").addEventListener("click", copyApiResult);
  renderEndpointForm();
}

function renderEndpointForm(): void {
  const ep = currentEndpoint();

  byId("apiMeta").innerHTML =
    `<span class="badge ${ep.method === "POST" ? "post" : "get"}">${ep.method}</span>` +
    `<span class="credits">${escapeHtml(ep.credits)} Credits</span>` +
    `<div class="desc">${escapeHtml(ep.description)}</div>`;

  if (ep.search) renderSearchForm(ep);
  else byId("apiParams").innerHTML = ep.params.map(renderParam).join("");

  byId("apiFields").innerHTML =
    "<ul>" + ep.fields.map((f) => `<li>${escapeHtml(f)}</li>`).join("") + "</ul>";

  // Ergebnis der vorherigen Anfrage zurücksetzen.
  setStatus("apiStatus", "");
  hideResult();
}

function renderParam(p: EndpointParam): string {
  const req = p.required ? ' <span class="req">*</span>' : "";
  const hint = p.hint ? `<span class="phint">${escapeHtml(p.hint)}</span>` : "";
  if (p.type === "bool") {
    return `<label class="chk"><input type="checkbox" data-param="${p.name}" /> ${escapeHtml(p.label)}</label>`;
  }
  let field: string;
  if (p.type === "textarea") {
    field = `<textarea data-param="${p.name}" rows="3" placeholder="${escapeHtml(p.placeholder ?? "")}"></textarea>`;
  } else if (p.options && p.options.length > 0) {
    // Select-Dropdown wenn options vorhanden
    const opts = p.options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
    field = `<select data-param="${p.name}">${opts}</select>`;
  } else {
    const inputType = p.type === "number" ? "number" : "text";
    field = `<input type="${inputType}" data-param="${p.name}" placeholder="${escapeHtml(p.placeholder ?? "")}" />`;
  }
  return `<div class="param"><label>${escapeHtml(p.label)}${req}</label>${field}${hint}</div>`;
}

function collectParamValues(ep: EndpointDef): Record<string, string | boolean> {
  const vals: Record<string, string | boolean> = {};
  for (const p of ep.params) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `#apiParams [data-param="${p.name}"]`
    );
    if (!el) continue;
    if (p.type === "bool") vals[p.name] = (el as HTMLInputElement).checked;
    else vals[p.name] = el.value.trim();
  }
  return vals;
}

async function sendApiRequest(): Promise<void> {
  const ep = currentEndpoint();

  let req: { path: string; method: "GET" | "POST"; body?: unknown };
  try {
    if (ep.search) {
      req = { path: ep.search.path, method: "POST", body: buildSearchPayload(ep) };
    } else {
      const vals = collectParamValues(ep);
      const missing = ep.params.filter((p) => p.required && !String(vals[p.name] ?? "").trim());
      if (missing.length) {
        setStatus("apiStatus", `Pflichtfeld fehlt: ${missing.map((m) => m.label).join(", ")}`, "error");
        return;
      }
      req = ep.build!(vals);
    }
  } catch (err) {
    setStatus("apiStatus", (err as Error).message, "error");
    return;
  }

  // Eventuell geänderte Proxy-URL vor dem Call speichern.
  await persist();
  setStatus("apiStatus", "lade…");
  hideResult();
  const t0 = performance.now();
  try {
    const data = await callEndpoint(req.path, req.method, req.body);
    const ms = Math.round(performance.now() - t0);
    showResult(data);
    setStatus("apiStatus", `OK (${ms} ms) · ${ep.method} ${req.path}`, "success");
  } catch (err) {
    setStatus("apiStatus", (err as Error).message, "error");
  }
}

let lastApiResponse: unknown = null;

function showResult(data: unknown): void {
  lastApiResponse = data;
  byId<HTMLPreElement>("apiResult").textContent = JSON.stringify(data, null, 2);
  byId("apiResult").classList.remove("hidden");
  byId("apiResultHead").classList.remove("hidden");
  
  // Feld-Filter anzeigen, wenn selectableFields vorhanden
  const ep = currentEndpoint();
  const filterBox = byId("apiFieldFilterBox");
  if (ep.selectableFields && ep.selectableFields.length > 0) {
    const filterDiv = byId("apiFieldFilter");
    filterDiv.innerHTML = ep.selectableFields
      .map((f) => `<label class="chk"><input type="checkbox" data-field="${escapeHtml(f.key)}" checked /> ${escapeHtml(f.label)}</label>`)
      .join("");
    filterDiv.querySelectorAll<HTMLInputElement>("input[data-field]").forEach((inp) => {
      inp.addEventListener("change", applyFieldFilter);
    });
    filterBox.classList.remove("hidden");
  } else {
    filterBox.classList.add("hidden");
  }
}

function hideResult(): void {
  byId("apiResult").classList.add("hidden");
  byId("apiResultHead").classList.add("hidden");
  byId("apiFieldFilterBox").classList.add("hidden");
}

function applyFieldFilter(): void {
  if (!lastApiResponse) return;
  const ep = currentEndpoint();
  if (!ep.selectableFields) return;
  
  const selectedFields = Array.from(
    document.querySelectorAll<HTMLInputElement>("#apiFieldFilter input[data-field]:checked")
  ).map((inp) => inp.dataset.field!);
  
  const filtered = filterResponseByFields(lastApiResponse, selectedFields);
  byId<HTMLPreElement>("apiResult").textContent = JSON.stringify(filtered, null, 2);
}

function filterResponseByFields(data: unknown, selectedFields: string[]): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => filterResponseByFields(item, selectedFields));
  }
  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Top-level keys, arrays, und "company_id" immer einbinden
      if (key === "ubos" && Array.isArray(value)) {
        result[key] = value.map((ubo) => filterResponseByFields(ubo, selectedFields));
      } else if (key === "company_id" || selectedFields.includes(key)) {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
}

function copyApiResult(): void {
  const text = byId<HTMLPreElement>("apiResult").textContent ?? "";
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => setStatus("apiStatus", "JSON kopiert ✓", "success"),
    () => setStatus("apiStatus", "Kopieren nicht möglich.", "error")
  );
}

// ---- Filter-Builder (erweiterte Suche) ----------------------------------

function renderSearchForm(ep: EndpointDef): void {
  const s = ep.search!;
  const locHtml = s.location
    ? `<details class="loc">
         <summary>Umkreissuche (optional)</summary>
         <div class="param"><label>Breitengrad (latitude)</label><input id="locLat" type="number" placeholder="52.5200" /></div>
         <div class="param"><label>Längengrad (longitude)</label><input id="locLng" type="number" placeholder="13.4050" /></div>
         <div class="param"><label>Radius (km)</label><input id="locRadius" type="number" placeholder="10" /></div>
       </details>`
    : "";
  byId("apiParams").innerHTML = `
    <div class="param">
      <label>Suchbegriff (Name)</label>
      <input id="searchQuery" type="text" placeholder="optional – z. B. Descartes" />
      <span class="phint">Freitextsuche über aktuelle &amp; frühere Namen.</span>
    </div>
    <div class="filter-builder">
      <div class="fb-head"><span>Filter · UND-verknüpft</span><button id="addFilter" class="secondary small" type="button">+ Filter</button></div>
      <div id="filterRows"></div>
    </div>
    ${locHtml}
    <div class="param two">
      <div><label>Seite</label><input id="pgPage" type="number" placeholder="1" /></div>
      <div><label>pro Seite</label><input id="pgPer" type="number" placeholder="10" /></div>
    </div>`;
  byId("addFilter").addEventListener("click", () => addFilterRow(s.fields));
  addFilterRow(s.fields); // mit einer leeren Zeile starten
}

function fieldDef(fields: FilterFieldDef[], field: string): FilterFieldDef {
  return fields.find((f) => f.field === field) ?? fields[0];
}

function addFilterRow(fields: FilterFieldDef[]): void {
  const row = document.createElement("div");
  row.className = "filter-row";
  const fieldOpts = fields
    .map((f) => `<option value="${f.field}">${escapeHtml(f.label)}${f.enterprise ? " ★" : ""}</option>`)
    .join("");
  row.innerHTML = `
    <div class="fr-top">
      <select class="f-field">${fieldOpts}</select>
      <select class="f-op"></select>
      <button class="rm secondary small" type="button" title="Filter entfernen">✕</button>
    </div>
    <div class="f-val"></div>`;
  byId("filterRows").appendChild(row);

  row.querySelector<HTMLSelectElement>(".f-field")!.addEventListener("change", () => syncRowOps(row, fields));
  row.querySelector<HTMLSelectElement>(".f-op")!.addEventListener("change", () => renderRowValue(row, fields));
  row.querySelector<HTMLButtonElement>(".rm")!.addEventListener("click", () => row.remove());
  syncRowOps(row, fields);
}

function syncRowOps(row: HTMLElement, fields: FilterFieldDef[]): void {
  const def = fieldDef(fields, row.querySelector<HTMLSelectElement>(".f-field")!.value);
  row.querySelector<HTMLSelectElement>(".f-op")!.innerHTML = def.ops
    .map((op) => `<option value="${op}">${escapeHtml(FILTER_OP_LABELS[op])}</option>`)
    .join("");
  renderRowValue(row, fields);
}

function renderRowValue(row: HTMLElement, fields: FilterFieldDef[]): void {
  const def = fieldDef(fields, row.querySelector<HTMLSelectElement>(".f-field")!.value);
  const op = row.querySelector<HTMLSelectElement>(".f-op")!.value as FilterOp;
  row.querySelector<HTMLElement>(".f-val")!.innerHTML = valueInputsHtml(def, op);
}

/** Einzelnes, typgerechtes Eingabefeld für ein Filterfeld. */
function fieldInput(def: FilterFieldDef, cls: string): string {
  if (def.kind === "bool" || def.kind === "enum") {
    const opts = (def.options ?? []).map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
    const empty = def.kind === "enum" ? '<option value="">– wählen –</option>' : "";
    return `<select class="${cls}">${empty}${opts}</select>`;
  }
  if (def.kind === "money") return `<input class="${cls}" type="number" step="0.01" placeholder="EUR" />`;
  if (def.kind === "number") return `<input class="${cls}" type="number" placeholder="Zahl" />`;
  if (def.kind === "date") return `<input class="${cls}" type="text" placeholder="DD-MM-YYYY" />`;
  return `<input class="${cls}" type="text" placeholder="Wert" />`;
}

function valueInputsHtml(def: FilterFieldDef, op: FilterOp): string {
  let inner: string;
  if (op === "values") {
    inner = `<input class="v-values" type="text" placeholder="Wert1, Wert2, …" />`;
  } else if (op === "keywords") {
    inner = `<input class="v-keywords" type="text" placeholder="wort1, wort2, …" />`;
  } else if (op === "range") {
    inner = `<div class="range"><span>min</span>${fieldInput(def, "v-min")}<span>max</span>${fieldInput(def, "v-max")}</div>`;
  } else {
    inner = fieldInput(def, "v-value");
  }
  const hint = def.hint ? `<span class="phint">${escapeHtml(def.hint)}</span>` : "";
  const enumHint =
    op === "values" && def.options ? `<span class="phint">Optionen: ${escapeHtml(def.options.join(", "))}</span>` : "";
  return inner + hint + enumHint;
}

function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function readFilterRows(fields: FilterFieldDef[]): FilterCondition[] {
  const out: FilterCondition[] = [];
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("#filterRows .filter-row"))) {
    const field = row.querySelector<HTMLSelectElement>(".f-field")!.value;
    const def = fields.find((f) => f.field === field);
    if (!def) continue;
    const op = row.querySelector<HTMLSelectElement>(".f-op")!.value as FilterOp;
    const conv = (raw: string): string => (def.kind === "money" ? eurToCents(raw) : raw.trim());
    const cond: FilterCondition = { field };

    if (op === "values") {
      const vs = splitList(qVal(row, ".v-values")).map(conv).filter(Boolean);
      if (!vs.length) continue;
      cond.values = vs;
    } else if (op === "keywords") {
      const ks = splitList(qVal(row, ".v-keywords"));
      if (!ks.length) continue;
      cond.keywords = ks;
    } else if (op === "range") {
      const min = conv(qVal(row, ".v-min"));
      const max = conv(qVal(row, ".v-max"));
      if (min) cond.min = min;
      if (max) cond.max = max;
      if (cond.min === undefined && cond.max === undefined) continue;
    } else {
      const v = conv(qVal(row, ".v-value"));
      if (!v) continue;
      cond.value = v;
    }
    out.push(cond);
  }
  return out;
}

function qVal(row: HTMLElement, sel: string): string {
  const el = row.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
  return el ? el.value.trim() : "";
}

function buildSearchPayload(ep: EndpointDef): unknown {
  const s = ep.search!;
  const body: Record<string, unknown> = {};

  const q = byId<HTMLInputElement>("searchQuery").value.trim();
  if (q) body.query = { value: q };

  const filters = readFilterRows(s.fields);
  if (filters.length) body.filters = filters;

  if (s.location) {
    const lat = byId<HTMLInputElement>("locLat").value.trim();
    const lng = byId<HTMLInputElement>("locLng").value.trim();
    const rad = byId<HTMLInputElement>("locRadius").value.trim();
    if (lat && lng) {
      body.location = { latitude: Number(lat), longitude: Number(lng), ...(rad ? { radius: Number(rad) } : {}) };
    } else if (lat || lng) {
      throw new Error("Umkreissuche braucht latitude UND longitude.");
    }
  }

  const page = byId<HTMLInputElement>("pgPage").value.trim();
  const per = byId<HTMLInputElement>("pgPer").value.trim();
  if (page || per) {
    body.pagination = { ...(page ? { page: Number(page) } : {}), ...(per ? { per_page: Number(per) } : {}) };
  }

  if (!body.query && !body.filters && !body.location) {
    throw new Error("Bitte mindestens einen Suchbegriff, Filter oder eine Umkreissuche angeben.");
  }
  return body;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function renderUsage(): Promise<void> {
  try {
    const u = (await getUsage()) as any;
    const total = Number(u?.total ?? 0);
    const totalEl = document.getElementById("usageTotal");
    if (totalEl) totalEl.textContent = `${total} Credits`;
    const breakdown = document.getElementById("usageBreakdown");
    if (breakdown) {
      const by = u?.byEndpoint ?? {};
      const rows = Object.entries(by)
        .map(([k, v]) => `<div class="ub-row"><span class="ub-endpoint">${escapeHtml(k)}</span><span class="ub-credits">${v}</span></div>`)
        .join("");
      breakdown.innerHTML = rows || "<div>keine Daten</div>";
    }
  } catch (err) {
    setStatus("apiStatus", (err as Error).message, "error");
  }
}
