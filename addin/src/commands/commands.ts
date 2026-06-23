/* global Office, window */

// Ribbon-Commands: je Button ein Datenblock. Jeder Button lädt seinen Block für
// die markierten Firmen und schreibt/aktualisiert das Mandanten-Blatt
// (benannt nach dem Mandanten). Mehrere Buttons nacheinander ergänzen das Blatt.

import { readSelectedCompanyNames, writeSheet, readExistingBlocks, sanitizeSheetName } from "../lib/excel";
import { loadAllCompanies } from "../lib/loader";
import { buildSheetModel, extractAvailableYears } from "../lib/mapping";
import { getConfig } from "../lib/config";
import type { DataBlock } from "../lib/types";

function notify(text: string): void {
  // Kleiner, kurzlebiger Hinweis (nur für Meldungen/Fehler). Kein Konfig-Popup.
  const url = new URL(window.location.href).origin + "/notify.html?msg=" + encodeURIComponent(text);
  Office.context.ui.displayDialogAsync(url, { height: 28, width: 26, promptBeforeOpen: false }, () => {
    /* Dialog schließt der Nutzer selbst */
  });
}

async function runBlocks(clicked: Set<DataBlock>, event: Office.AddinCommands.Event): Promise<void> {
  try {
    const names = await readSelectedCompanyNames();
    if (names.length === 0) {
      notify("Bitte zuerst Zellen mit Firmennamen markieren.");
      return;
    }

    // Erst den geklickten Block laden (löst Firmen auf, liefert Mandantennamen).
    let data = await loadAllCompanies(names, clicked, () => {});
    const okIndexes = data.map((d, i) => ({ d, i })).filter((x) => x.d.status === "ok");
    if (okIndexes.length === 0) {
      const why = data[0]?.error ? ` (${data[0].error})` : "";
      notify(`Keine Daten gefunden${why}.`);
      return;
    }

    // Pro Unternehmen das eigene Blatt + die dort schon vorhandenen Blöcke bestimmen.
    const plan: Array<{ index: number; sheetName: string; union: Set<DataBlock> }> = [];
    const globalNeeded = new Set<DataBlock>(clicked);
    for (const { d, i } of okIndexes) {
      const sheetName = sanitizeSheetName(d.matchedName || d.inputName);
      const existing = await readExistingBlocks(sheetName);
      const union = new Set<DataBlock>([...existing, ...clicked]);
      union.forEach((b) => globalNeeded.add(b));
      plan.push({ index: i, sheetName, union });
    }

    // Falls zusätzliche Blöcke nötig sind, alles (Proxy-gecacht) nachladen.
    if (globalNeeded.size > clicked.size) {
      data = await loadAllCompanies(names, globalNeeded, () => {});
    }

    const cfg = getConfig();
    let written = 0;
    // Je Unternehmen ein eigenes Tabellenblatt.
    for (const p of plan) {
      const company = data[p.index];
      if (!company || company.status !== "ok") continue;
      const available = extractAvailableYears([company], cfg.autoYearCount);
      const years = available.length > 0 ? available : [new Date().getFullYear() - 1];
      const model = buildSheetModel([company], p.union, years, {
        removeEmpty: cfg.removeEmpty,
        centsToEuro: cfg.centsToEuro,
        kennzahlenFields: cfg.kennzahlenFields,
        stammdatenFields: cfg.stammdatenFields,
      });
      await writeSheet(model, p.sheetName, { scale: cfg.scale });
      written++;
    }

    if (written === 0) notify("Keine Daten geschrieben.");
  } catch (err) {
    notify(`Fehler: ${(err as Error).message}`);
  } finally {
    event.completed();
  }
}

function loadBilanz(event: Office.AddinCommands.Event): void {
  void runBlocks(new Set<DataBlock>(["aktiva", "passiva"]), event);
}
function loadGuv(event: Office.AddinCommands.Event): void {
  void runBlocks(new Set<DataBlock>(["guv"]), event);
}
function loadKennzahlen(event: Office.AddinCommands.Event): void {
  void runBlocks(new Set<DataBlock>(["kennzahlen"]), event);
}
function loadStammdaten(event: Office.AddinCommands.Event): void {
  void runBlocks(new Set<DataBlock>(["stammdaten"]), event);
}
function loadAlles(event: Office.AddinCommands.Event): void {
  void runBlocks(new Set<DataBlock>(["aktiva", "passiva", "guv", "kennzahlen", "stammdaten"]), event);
}

Office.onReady(() => {
  /* nichts weiter nötig */
});

Office.actions.associate("loadBilanz", loadBilanz as never);
Office.actions.associate("loadGuv", loadGuv as never);
Office.actions.associate("loadKennzahlen", loadKennzahlen as never);
Office.actions.associate("loadStammdaten", loadStammdaten as never);
Office.actions.associate("loadAlles", loadAlles as never);
