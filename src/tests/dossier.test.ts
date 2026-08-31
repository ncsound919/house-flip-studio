import { describe, it, expect } from "vitest";
import { compileDossier } from "../lib/research/dossier";

describe("compileDossier", () => {
  it("aggregates source results with per-source status", async () => {
    const d = await compileDossier({
      dealId: "d1",
      address: "123 Test St",
      pin: "123",
    });
    expect(d.dealId).toBe("d1");
    expect(Array.isArray(d.sources)).toBe(true);
    expect(d.sources.length).toBeGreaterThan(0);
    for (const s of d.sources) {
      expect(["ok", "error"]).toContain(s.status);
      expect(s.fetchedAt).toBeTruthy();
    }
  });
});