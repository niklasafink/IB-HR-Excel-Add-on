// Excel-Interaktion: markierte Firmennamen lesen, vorhandene Blöcke eines
// Mandanten-Blatts erkennen und das Ergebnis-Modell schreiben.

/* global Excel */

import type { SheetModel } from "./mapping";
import type { DataBlock } from "./types";

/** Liest die aktuell markierten Zellen und extrahiert eindeutige Firmennamen. */
export async function readSelectedCompanyNames(): Promise<string[]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load("values");
    await context.sync();

    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of range.values) {
      for (const cell of row) {
        if (typeof cell === "string" || typeof cell === "number") {
          const name = String(cell).trim();
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            names.push(name);
          }
        }
      }
    }
    return names;
  });
}

// Sektions-Überschrift (Spalte A) -> Datenblock; für Akkumulations-Erkennung.
const SECTION_TO_BLOCK: Array<[string, DataBlock]> = [
  ["BILANZ – AKTIVA", "aktiva"],
  ["BILANZ – PASSIVA", "passiva"],
  ["GEWINN- UND VERLUSTRECHNUNG", "guv"],
  ["KENNZAHLEN", "kennzahlen"],
  ["STAMMDATEN", "stammdaten"],
];

/** Excel-konformen, eindeutigen Blattnamen aus dem Mandantennamen bilden (≤ 31 Zeichen). */
export function sanitizeSheetName(name: string): string {
  let s = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) s = "Mandant";
  if (s.length > 31) s = s.slice(0, 31).trim();
  return s;
}

/** Liest, welche Datenblöcke in einem bestehenden Mandanten-Blatt schon vorhanden sind. */
export async function readExistingBlocks(sheetName: string): Promise<Set<DataBlock>> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(sheetName);
    sheet.load("name");
    await context.sync();
    const found = new Set<DataBlock>();
    if (sheet.isNullObject) return found;

    const used = sheet.getUsedRangeOrNullObject(true);
    used.load("values");
    await context.sync();
    if (used.isNullObject || !used.values) return found;

    const labels = new Set(used.values.map((r) => String(r[0] ?? "").trim()));
    for (const [label, block] of SECTION_TO_BLOCK) {
      if (labels.has(label)) found.add(block);
    }
    return found;
  });
}

/**
 * Schreibt das SheetModel in das Blatt `sheetName` (ersetzt ein vorhandenes
 * Blatt gleichen Namens vollständig). Aufbau:
 *   Zeile 1: Firmennamen (über ihre Jahresspalten gemerged)
 *   Zeile 2: "Position" + Jahre je Firma
 *   ab Zeile 3: Positionszeilen (Sektionen fett, Unterpositionen eingerückt)
 */
export type ValueScale = "original" | "thousand" | "million";

function scaleFormat(scale: ValueScale): string {
  // Trailing-Commas skalieren die ANZEIGE (Werte bleiben exakt erhalten).
  if (scale === "thousand") return "#,##0,";
  if (scale === "million") return "#,##0,,";
  return "#,##0";
}

function scaleUnitLabel(scale: ValueScale): string {
  if (scale === "thousand") return "Werte in Tsd.";
  if (scale === "million") return "Werte in Mio.";
  return "";
}

export async function writeSheet(
  model: SheetModel,
  sheetName: string,
  opts: { scale?: ValueScale } = {}
): Promise<string> {
  const scale = opts.scale ?? "original";
  return Excel.run(async (context) => {
    // Vorhandenes Blatt gleichen Namens entfernen (Rebuild).
    const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
    existing.load("name");
    await context.sync();
    if (!existing.isNullObject) {
      existing.delete();
      await context.sync();
    }

    const sheet = context.workbook.worksheets.add(sheetName);

    const totalCols = 1 + model.valueColumnCount;
    const headerRow1: (string | number)[] = new Array(totalCols).fill("");
    const headerRow2: (string | number)[] = new Array(totalCols).fill("");

    headerRow2[0] = "Position";
    const unit = scaleUnitLabel(scale);
    if (unit) headerRow1[0] = unit; // Einheit-Hinweis oben links
    for (const span of model.firmSpans) {
      headerRow1[1 + span.startCol] = span.name;
      model.years.forEach((year, yi) => {
        headerRow2[1 + span.startCol + yi] = year;
      });
    }

    const matrix: (string | number)[][] = [headerRow1, headerRow2];
    const sectionRowIndices: number[] = [];

    model.rows.forEach((r) => {
      const indent = r.kind === "section" ? "" : "   ".repeat(Math.max(0, r.depth));
      const line: (string | number)[] = new Array(totalCols).fill("");
      line[0] = indent + r.label;
      r.cells.forEach((cell, i) => {
        line[1 + i] = cell.value === null || cell.value === undefined ? "" : cell.value;
      });
      if (r.kind === "section") sectionRowIndices.push(matrix.length);
      matrix.push(line);
    });

    const rowCount = matrix.length;
    const fullRange = sheet.getRangeByIndexes(0, 0, rowCount, totalCols);
    fullRange.values = matrix as (string | number)[][];
    fullRange.format.wrapText = true;
    fullRange.format.verticalAlignment = Excel.VerticalAlignment.top;

    // Kopfzeilen
    const header = sheet.getRangeByIndexes(0, 0, 2, totalCols);
    header.format.font.bold = true;
    header.format.fill.color = "#D9E1F2";

    for (const span of model.firmSpans) {
      if (span.count > 1) {
        const merge = sheet.getRangeByIndexes(0, 1 + span.startCol, 1, span.count);
        merge.merge(true);
        merge.format.horizontalAlignment = Excel.HorizontalAlignment.center;
      }
    }

    for (const idx of sectionRowIndices) {
      const secRange = sheet.getRangeByIndexes(idx, 0, 1, totalCols);
      secRange.format.font.bold = true;
      secRange.format.fill.color = "#F2F2F2";
    }

    // Zahlenformat für die Wertspalten (deutsches Tausenderformat)
    if (model.valueColumnCount > 0 && rowCount > 2) {
      const valueRange = sheet.getRangeByIndexes(2, 1, rowCount - 2, model.valueColumnCount);
      const fmt = scaleFormat(scale);
      valueRange.numberFormat = Array.from({ length: rowCount - 2 }, () =>
        new Array(model.valueColumnCount).fill(fmt)
      );
      valueRange.format.horizontalAlignment = Excel.HorizontalAlignment.right;
    }

    // Feste Spaltenbreiten (kein Autofit → Zeilenumbruch greift, Zeilenhöhe passt sich an)
    sheet.getRange("A:A").format.columnWidth = 300;
    if (model.valueColumnCount > 0) {
      const valueCols = sheet.getRangeByIndexes(0, 1, 1, model.valueColumnCount);
      valueCols.format.columnWidth = 115;
    }

    sheet.freezePanes.freezeAt(sheet.getRangeByIndexes(0, 0, 2, 1));
    sheet.activate();
    await context.sync();
    return sheetName;
  });
}
