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
    expect(t.headers).toContain("Name");
    expect(t.rows[0][t.headers.indexOf("Name")]).toBe("Max");
    expect(t.rows[0][t.headers.indexOf("Ort")]).toBe("Berlin");
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
    const nameCol = t.headers.indexOf("Name");
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
    expect(t.rows[0][t.headers.indexOf("Beteiligung an")]).toBe("Bar GmbH");
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
    expect(t.headers).toEqual(["Jahr", "Pfad", "Ebene", "Konto", "Wert"]);
    expect(t.rows[0]).toEqual(["2022", "Umsatzerlöse", 0, "Umsatzerlöse", 500]);
  });
});

describe("buildExcelModel – Bekanntmachungen & Insolvenzen", () => {
  it("kuratiert Bekanntmachungen auf lesbare Spalten", () => {
    const resp = {
      history: [
        {
          name: { en: "Change of address", de: "Adressänderung" },
          description: { short: { de: "Das Unternehmen hat seine Adresse geändert" } },
          start_date: "2018-09-28T00:00:00",
          details: { value: { formatted_address: "Friedrichshafener Straße 1" }, linked_entities: { organization: { name: "OroraTech GmbH" } } },
        },
      ],
    };
    const t = buildExcelModel("publications", resp).tables[0];
    expect(t.title).toBe("Bekanntmachungen");
    expect(t.headers).toEqual(["Datum", "Ereignis", "Beschreibung", "Beteiligte(r)", "Details"]);
    expect(t.rows[0][0]).toBe("28.09.2018");
    expect(t.rows[0][1]).toBe("Adressänderung");
  });

  it("kuratiert Nachrichten (Datum, Titel, Quelle, Link; ohne ID)", () => {
    const resp = {
      news: [
        { id: "abc123", title: "OroraTech wird Partner", source: "it boltwise", publication_date: "2026-06-19", url: "https://example.com/a" },
      ],
    };
    const t = buildExcelModel("news", resp).tables[0];
    expect(t.title).toBe("Nachrichten");
    expect(t.headers).toEqual(["Datum", "Titel", "Quelle", "Link"]);
    expect(t.headers).not.toContain("id");
    expect(t.rows[0]).toEqual(["19.06.2026", "OroraTech wird Partner", "it boltwise", "https://example.com/a"]);
  });

  it("kuratiert Insolvenzbekanntmachungen mit deutschen Spalten", () => {
    const resp = {
      insolvency_publications: [
        { publication_date: "2024-04-24T00:00:00+00:00", insolvency_id: "1542 IN 1308/20", court_city: "München", publication_label: "Entscheidung im Verfahren" },
      ],
    };
    const t = buildExcelModel("insolvency_publications", resp).tables[0];
    expect(t.title).toBe("Insolvenzbekanntmachungen");
    expect(t.headers).toContain("Aktenzeichen");
    expect(t.headers).toContain("Gericht");
    expect(t.rows[0][t.headers.indexOf("Aktenzeichen")]).toBe("1542 IN 1308/20");
    expect(t.rows[0][t.headers.indexOf("Datum")]).toBe("24.04.2024");
  });
});

describe("buildExcelModel – große Inhalte", () => {
  it("teilt langen Inhalt zeilenweise auf und kappt überlange Zellen", () => {
    const longLine = "X".repeat(40000);
    const resp = { name: "Test GmbH", website_content: `Zeile A\nZeile B\n${longLine}` };
    const t = buildExcelModel("website_content", resp).tables.find((x) => x.title === "Website-Inhalt")!;
    expect(t).toBeDefined();
    expect(t.headers).toEqual(["Inhalt"]);
    expect(t.rows.length).toBe(3);
    const maxLen = Math.max(...t.rows.map((r) => String(r[0]).length));
    expect(maxLen).toBeLessThanOrEqual(32002);
  });
});

describe("buildExcelModel – Website/Unternehmensprofil", () => {
  it("baut ein sauberes Profil mit deutschen Labels statt Roh-Dump", () => {
    const resp = {
      entity_id: "abc",
      name: "OroraTech GmbH",
      status: "ACTIVE",
      legal_form: "GmbH",
      registration: { court: "München", register_type: "HRB", register_number: 243843 },
      contact_data: { website: "", phone_number: "", email: "" },
      address: { street: "Sankt-Martin-Straße", house_number: 112, postal_code: 81669, city: "München", state: "Bayern", country: "DEU" },
      registration_date: "2018-09-28T00:00:00+00:00",
      purpose: "Aufbau und Betrieb einer Nanosatellitenkonstellation.",
      industry_classification: { WZ2025: [{ code: "61.10.2", label: "Drahtlose Telekommunikation" }] },
      meta: { request_credit_cost: 5, credits_remaining: 1997 },
    };
    const t = buildExcelModel("website_content", resp).tables[0];
    expect(t.title).toBe("Unternehmensprofil");
    expect(t.headers).toEqual(["Feld", "Wert"]);
    const get = (label: string) => t.rows.find((r) => r[0] === label)?.[1];
    expect(get("Unternehmen")).toBe("OroraTech GmbH");
    expect(get("Status")).toBe("Aktiv");
    expect(get("Gründungsdatum")).toBe("28.09.2018");
    expect(get("Adresse")).toBe("Sankt-Martin-Straße 112, 81669 München");
    expect(get("Branche")).toBe("Drahtlose Telekommunikation");
    // Interne/leere Felder dürfen nicht auftauchen
    expect(get("entity_id")).toBeUndefined();
    expect(get("Website")).toBeUndefined();
    expect(t.rows.some((r) => String(r[0]).toLowerCase().includes("credit"))).toBe(false);
  });
});
