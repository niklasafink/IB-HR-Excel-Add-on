import { describe, it, expect } from "vitest";
import { buildExcelModel } from "./excelModel";

const NUM = "#,##0.00";

describe("buildExcelModel – Schlüsselauflösung", () => {
  it("löst publications aus dem 'history'-Schlüssel auf", () => {
    const resp = { history: [{ name: { de: "Eintrag" }, start_date: "2024-01-01" }] };
    const m = buildExcelModel("publications", resp);
    expect(m.tables[0].rows.length).toBe(1);
    expect(m.tables[0].headers).not.toEqual(["Hinweis"]);
  });

  it("zeigt klaren Hinweis bei leeren Daten statt einer 'value'-Spalte", () => {
    const m = buildExcelModel("news", { news: [] });
    expect(m.tables[0].headers).toEqual(["Hinweis"]);
    expect(m.tables[0].rows[0][0]).toBe("Keine Daten verfügbar");
  });
});

describe("buildExcelModel – Bilanz-Gegenüberstellung", () => {
  const fixture = {
    balance_sheet_accounts: [
      {
        year: 2024,
        balance_sheet_accounts: [
          {
            name: { de: "Aktivseite", in_report: "Aktiva" },
            value: 100,
            children: [{ name: { in_report: "A. Anlagevermögen" }, value: 60, children: [] }],
          },
          {
            name: { de: "Passivseite", in_report: "Passiva" },
            value: 100,
            children: [{ name: { in_report: "A. Eigenkapital" }, value: 40, children: [] }],
          },
        ],
      },
    ],
  };

  it("stellt Aktiva links und Passiva rechts gegenüber", () => {
    const t = buildExcelModel("balance_sheet_accounts", fixture).tables[0];
    expect(t.title).toBe("Bilanz 2024");
    expect(t.headers).toEqual(["Aktiva", "Wert", "", "Passiva", "Wert"]);
    expect(t.rows[0]).toEqual(["Aktiva", 100, "", "Passiva", 100]);
    expect(String(t.rows[1][0]).trim()).toBe("A. Anlagevermögen");
    expect(String(t.rows[1][3]).trim()).toBe("A. Eigenkapital");
  });

  it("setzt Zahlenformate nur auf den Wert-Spalten", () => {
    const t = buildExcelModel("balance_sheet_accounts", fixture).tables[0];
    expect(t.formats).toEqual([null, NUM, null, null, NUM]);
  });
});

describe("buildExcelModel – Eigentümer-Features (Objekt-Wrapper)", () => {
  it("entpackt ubos.beneficial_owners", () => {
    const resp = {
      ubos: {
        beneficial_owners: [
          { person: { name: "Max", birth_date: "1990-01-01", location: { home: { city: "Berlin", country: "DEU" } } }, ownership_percentage: 5 },
        ],
      },
    };
    const t = buildExcelModel("ubos", resp).tables[0];
    expect(t.headers).toContain("name");
    expect(t.rows[0][t.headers.indexOf("name")]).toBe("Max");
    expect(t.rows[0][t.headers.indexOf("city")]).toBe("Berlin");
  });

  it("entpackt shareholders.entries inkl. natürlicher Personen", () => {
    const resp = {
      shareholders: {
        entries: [
          { shareholder: { entity_name: "Foo UG" }, contribution: { amount: 100, currency: "EUR" } },
          { shareholder: { first_name: "Max", last_name: "Muster" }, contribution: { amount: 50, currency: "EUR" } },
        ],
      },
    };
    const t = buildExcelModel("shareholders", resp).tables[0];
    const nameCol = t.headers.indexOf("name");
    expect(t.rows[0][nameCol]).toBe("Foo UG");
    expect(t.rows[1][nameCol]).toBe("Max Muster");
  });

  it("entpackt shareholdings.holdings.current", () => {
    const resp = {
      shareholdings: {
        holdings: { current: [{ organization: { name: "Bar GmbH" }, ownership: { percentage: 10, contribution: { amount: 1, currency: "EUR" } }, as_of: "2025" }] },
      },
    };
    const t = buildExcelModel("shareholdings", resp).tables[0];
    expect(t.rows[0][t.headers.indexOf("organization")]).toBe("Bar GmbH");
  });
});

describe("buildExcelModel – GuV-Hierarchie (Plural-Schlüssel)", () => {
  it("erkennt die verschachtelte Liste unter 'profit_and_loss_accounts'", () => {
    const resp = {
      profit_and_loss_account: [
        { year: 2022, profit_and_loss_accounts: [{ name: { in_report: "Umsatzerlöse" }, value: 500, children: [] }] },
      ],
    };
    const t = buildExcelModel("profit_and_loss_account", resp).tables[0];
    expect(t.headers).toEqual(["year", "path", "level", "account", "value"]);
    expect(t.rows[0]).toEqual(["2022", "Umsatzerlöse", 0, "Umsatzerlöse", 500]);
  });
});

describe("buildExcelModel – große Inhalte", () => {
  it("teilt langen Inhalt zeilenweise auf und kappt überlange Zellen", () => {
    const longLine = "X".repeat(40000);
    const resp = { website_content: `Zeile A\nZeile B\n${longLine}` };
    const t = buildExcelModel("website_content", resp).tables[0];
    expect(t.headers).toEqual(["Inhalt"]);
    expect(t.rows.length).toBe(3);
    const maxLen = Math.max(...t.rows.map((r) => String(r[0]).length));
    expect(maxLen).toBeLessThanOrEqual(32002);
  });
});
