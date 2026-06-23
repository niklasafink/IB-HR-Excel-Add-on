import { describe, it, expect, beforeAll } from "vitest";

// Isolierte Datei + Admin-Token, bevor das Modul geladen wird.
process.env.USERS_FILE = "/tmp/gordon-users-test.json";
process.env.ADMIN_TOKEN = "test-admin";

let users: typeof import("./users.js");

beforeAll(async () => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.USERS_FILE!, JSON.stringify({ users: [] }));
  users = await import("./users.js");
});

describe("users – Verwaltung & Auth", () => {
  it("authEnabled ist true bei gesetztem ADMIN_TOKEN", () => {
    expect(users.authEnabled()).toBe(true);
    expect(users.isAdminToken("test-admin")).toBe(true);
    expect(users.isAdminToken("falsch")).toBe(false);
  });

  it("legt Nutzer an und authentifiziert per Token", () => {
    const { user, token } = users.createUser("Max", 50);
    expect(user.creditLimit).toBe(50);
    expect(user.creditsUsed).toBe(0);
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    const auth = users.authenticateUser(token);
    expect(auth?.id).toBe(user.id);
    expect(users.authenticateUser("ungueltig")).toBeNull();
  });

  it("erzwingt das Limit und bucht Verbrauch über den Kontext", () => {
    const { user, token } = users.createUser("Limit-Test", 10);
    // Verbrauch im Nutzer-Kontext buchen
    users.userContext.run({ userId: user.id }, () => users.chargeCurrentUser(8));
    expect(users.checkAccess(token).check.ok).toBe(true); // 8 < 10
    users.userContext.run({ userId: user.id }, () => users.chargeCurrentUser(5)); // -> 13
    const blocked = users.checkAccess(token);
    expect(blocked.check.ok).toBe(false);
    expect(blocked.check.status).toBe(402);
  });

  it("hebt das Limit per 'unlimited' vorübergehend auf", () => {
    const { user, token } = users.createUser("Unlimited-Test", 1);
    users.userContext.run({ userId: user.id }, () => users.chargeCurrentUser(5)); // über Limit
    expect(users.checkAccess(token).check.ok).toBe(false);
    users.updateUser(user.id, { unlimited: true });
    expect(users.checkAccess(token).check.ok).toBe(true); // Limit aufgehoben
    users.updateUser(user.id, { unlimited: false });
    expect(users.checkAccess(token).check.ok).toBe(false); // wieder aktiv
  });

  it("sperrt und entsperrt Nutzer", () => {
    const { user, token } = users.createUser("Sperr-Test", 100);
    users.updateUser(user.id, { disabled: true });
    expect(users.checkAccess(token).check.status).toBe(403);
    users.updateUser(user.id, { disabled: false });
    expect(users.checkAccess(token).check.ok).toBe(true);
  });

  it("setzt Verbrauch zurück", () => {
    const { user, token } = users.createUser("Reset-Test", 10);
    users.userContext.run({ userId: user.id }, () => users.chargeCurrentUser(10));
    expect(users.checkAccess(token).check.ok).toBe(false);
    users.resetUser(user.id);
    expect(users.checkAccess(token).check.ok).toBe(true);
  });

  it("macht den alten Token bei Rotation ungültig", () => {
    const { user, token } = users.createUser("Rotate-Test", 10);
    const rotated = users.rotateToken(user.id);
    expect(users.authenticateUser(token)).toBeNull();
    expect(users.authenticateUser(rotated!.token)?.id).toBe(user.id);
  });
});
