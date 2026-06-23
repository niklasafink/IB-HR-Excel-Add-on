import { describe, it, expect } from "vitest";
import { errorMessageForStatus, extractErrorDetail, checkApiLevelError, UpstreamError } from "./handelsregister.js";

describe("extractErrorDetail", () => {
  it("liest FastAPI-detail-Array (msg)", () => {
    const body = { detail: [{ type: "not_found", msg: "Organization that matches 'Schmidt' does not exist" }] };
    expect(extractErrorDetail(body)).toContain("does not exist");
  });

  it("liest detail-String", () => {
    expect(extractErrorDetail({ detail: "kaputt" })).toBe("kaputt");
  });

  it("liefert leeren String bei unbekannter Struktur", () => {
    expect(extractErrorDetail({ foo: 1 })).toBe("");
  });
});

describe("errorMessageForStatus", () => {
  it("404 enthält den Detail-Grund und einen Hinweis", () => {
    const body = { detail: [{ msg: "Organization that matches 'Schmidt' does not exist" }] };
    const msg = errorMessageForStatus(404, body);
    expect(msg).toContain("does not exist");
    expect(msg).toContain("Rechtsform");
  });

  it("402 meldet fehlende Credits", () => {
    expect(errorMessageForStatus(402, null)).toContain("Credits");
  });
});

describe("checkApiLevelError", () => {
  it("wirft 402 bei 'Insufficient credits' im meta.message", () => {
    const body = { meta: { message: "Insufficient credits to perform this operation.", credits_remaining: 2 } };
    try {
      checkApiLevelError(body);
      throw new Error("sollte werfen");
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      expect((err as UpstreamError).status).toBe(402);
    }
  });

  it("wirft nicht bei normaler Antwort", () => {
    expect(() => checkApiLevelError({ name: "Bayer AG", meta: { request_credit_cost: 1 } })).not.toThrow();
    expect(() => checkApiLevelError({ financial_kpi: [] })).not.toThrow();
  });
});
