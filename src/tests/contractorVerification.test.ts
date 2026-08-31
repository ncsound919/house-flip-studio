import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyContractor } from "../lib/contractorVerification";

vi.mock("@/lib/contractorSources/nclbgc", () => ({
  verifyOnNclbgc: vi.fn(),
}));

import { verifyOnNclbgc } from "@/lib/contractorSources/nclbgc";

function makeAdmin(contractor: Record<string, unknown>, updates: Record<string, unknown>[]) {
  return {
    from: (table: string) => {
      const t = table as string;
      return {
        select: () => ({
          eq: (_k: string, _v: string) => ({
            single: async () =>
              t === "contractors" && contractor
                ? { data: contractor, error: null }
                : { data: null, error: { message: "not found" } },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_k: string, _v: string) => {
            updates.push(patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

describe("verifyContractor — honesty guarantees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps verified_at ONLY on a real nclbgc success", async () => {
    vi.mocked(verifyOnNclbgc).mockResolvedValue({ verified: true, detail: "active", licenseTier: "GC" });
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin({ id: "c1", org_id: "org1", license_number: "12345" }, updates) as never;

    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(true);
    const verifiedPatch = updates.find((u) => u.verified_at);
    expect(verifiedPatch).toBeDefined();
    expect(verifiedPatch!.license_checked_at).toBeDefined();
    expect(verifiedPatch!.license_tier).toBe("GC");
  });

  it("never stamps verified_at when nclbgc returns not verified", async () => {
    vi.mocked(verifyOnNclbgc).mockResolvedValue({ verified: false, detail: "inactive" });
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin({ id: "c1", org_id: "org1", license_number: "12345" }, updates) as never;

    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(false);
    const checkPatch = updates.find((u) => u.license_checked_at);
    expect(checkPatch).toBeDefined();
    // Never a new verification timestamp; on a definitive failure it is cleared (null).
    expect(checkPatch!.verified_at).toBeNull();
  });

  it("treats a missing license number as not verified", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin({ id: "c1", org_id: "org1", license_number: null }, updates) as never;
    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(false);
    expect(result.detail).toContain("no license_number");
    expect(verifyOnNclbgc).not.toHaveBeenCalled();
  });

  it("enforces org scoping", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin({ id: "c1", org_id: "other", license_number: "12345" }, updates) as never;
    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(false);
    expect(result.detail).toBe("forbidden");
  });

  it("clears a stale verified_at on a definitive failure (expired/revoked)", async () => {
    vi.mocked(verifyOnNclbgc).mockResolvedValue({ verified: false, detail: "License status: expired" });
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin(
      { id: "c1", org_id: "org1", license_number: "12345", verified_at: "2025-01-01T00:00:00Z" },
      updates
    ) as never;
    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(false);
    const patch = updates.find((u) => u.verified_at === null);
    expect(patch).toBeDefined(); // honest: badge is cleared, not left stale
  });

  it("does NOT clear verified_at when nclbgc was simply unavailable", async () => {
    vi.mocked(verifyOnNclbgc).mockResolvedValue({ verified: false, detail: "nclbgc unavailable, verify manually" });
    const updates: Record<string, unknown>[] = [];
    const admin = makeAdmin(
      { id: "c1", org_id: "org1", license_number: "12345", verified_at: "2025-01-01T00:00:00Z" },
      updates
    ) as never;
    const result = await verifyContractor(admin, "org1", "c1");
    expect(result.verified).toBe(false);
    const clearingPatch = updates.find((u) => u.verified_at === null);
    expect(clearingPatch).toBeUndefined(); // availability ≠ proof license is bad
  });
});