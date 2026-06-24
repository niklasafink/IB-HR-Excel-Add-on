import { describe, it, expect, beforeAll } from "vitest";

process.env.TENANTS_FILE = "/tmp/gordon-tenants-unit-test.json";
process.env.HANDELSREGISTER_API_KEY = "DEFAULTKEY";

let tenants: typeof import("./tenants.js");
let requestContext: typeof import("./context.js")["requestContext"];

beforeAll(async () => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.TENANTS_FILE!, JSON.stringify({ tenants: [] }));
  tenants = await import("./tenants.js");
  requestContext = (await import("./context.js")).requestContext;
});

describe("tenants – Mandanten & Keys", () => {
  it("erzeugt automatisch den Default-Mandanten", () => {
    expect(tenants.listTenants().find((t) => t.id === "default")).toBeTruthy();
  });

  it("effectiveApiKey: eigener Mandanten-Key schlägt den Default-Key", () => {
    const own = tenants.createTenant("Kunde A", "OWNKEY123");
    expect(own.hasOwnKey).toBe(true);
    expect(own.apiKeyHint).toBe("…Y123");
    expect(tenants.effectiveApiKey(tenants.getTenant(own.id))).toBe("OWNKEY123");
    // Default-Mandant ohne eigenen Key -> Default-Key aus der Umgebung
    expect(tenants.effectiveApiKey(tenants.getTenant("default"))).toBe("DEFAULTKEY");
  });

  it("listTenants zeigt nie den Klartext-Key", () => {
    const t = tenants.createTenant("Kunde B", "SECRETKEY");
    const pub = tenants.listTenants().find((x) => x.id === t.id);
    expect(JSON.stringify(pub)).not.toContain("SECRETKEY");
    expect(pub?.hasOwnKey).toBe(true);
  });

  it("bucht Verbrauch auf den Mandanten über den Kontext", () => {
    const t = tenants.createTenant("Kunde C", "");
    requestContext.run({ userId: "u", tenantId: t.id, apiKey: "k" }, () => tenants.chargeCurrentTenant(7));
    expect(tenants.listTenants().find((x) => x.id === t.id)?.creditsUsed).toBe(7);
  });

  it("aktualisiert den Key und setzt den Verbrauch zurück", () => {
    const t = tenants.createTenant("Kunde D", "OLD");
    tenants.updateTenant(t.id, { apiKey: "NEW" });
    expect(tenants.effectiveApiKey(tenants.getTenant(t.id))).toBe("NEW");
    requestContext.run({ userId: "u", tenantId: t.id, apiKey: "k" }, () => tenants.chargeCurrentTenant(3));
    tenants.resetTenant(t.id);
    expect(tenants.listTenants().find((x) => x.id === t.id)?.creditsUsed).toBe(0);
  });

  it("der Default-Mandant ist nicht löschbar, andere schon", () => {
    expect(tenants.deleteTenant("default")).toBe(false);
    const t = tenants.createTenant("Weg", "");
    expect(tenants.deleteTenant(t.id)).toBe(true);
  });
});
