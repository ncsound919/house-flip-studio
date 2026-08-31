import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  parseOrgSettings,
  saveOrgSettings,
  flipProfileFor,
  underwritingFor,
} from "../lib/orgSettings";
import { DEFAULT_GUARDRAILS } from "../lib/guardrails/limits";

vi.mock("@/lib/apiHelpers", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/apiHelpers";

function makeAdmin(store: Record<string, unknown>) {
  const builder = {
    from: (table: string) => {
      const tbl = table as string;
      return {
        select: () => ({
          eq: (_k: string, _v: string) => ({
            single: async () => ({ data: store[tbl] ?? null, error: null }),
          }),
        }),
        upsert: async (row: unknown) => {
          store[tbl] = row;
          return { error: null };
        },
      };
    },
  };
  return builder;
}

describe("orgSettings", () => {
  it("defaults match the previous hardcoded behavior", () => {
    expect(DEFAULT_SETTINGS.flipProfile.minAssessed).toBe(30_000);
    expect(DEFAULT_SETTINGS.flipProfile.maxAssessed).toBe(150_000);
    expect(DEFAULT_SETTINGS.flipProfile.statewide).toBe(true);
    expect(DEFAULT_SETTINGS.underwriting.rehabPerSqft).toBe(40);
    expect(DEFAULT_SETTINGS.underwriting.holdingMonths).toBe(6);
    expect(DEFAULT_SETTINGS.underwriting.interestRate).toBe(10);
    expect(DEFAULT_SETTINGS.agent.huntOnCycle).toBe(true);
  });

  it("parseOrgSettings({}) yields defaults", () => {
    expect(parseOrgSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("parseOrgSettings merges a partial patch over defaults", () => {
    const parsed = parseOrgSettings({
      flipProfile: { minAssessed: 50_000 },
      underwriting: { interestRate: 8 },
    });
    expect(parsed.flipProfile.minAssessed).toBe(50_000);
    expect(parsed.flipProfile.maxAssessed).toBe(150_000);
    expect(parsed.underwriting.interestRate).toBe(8);
    expect(parsed.underwriting.rehabPerSqft).toBe(40);
    expect(parsed.llm.generateScopes).toBe(true);
  });

  it("parseOrgSettings degrades to defaults on invalid stored data", () => {
    expect(parseOrgSettings({ flipProfile: "garbage" })).toEqual(DEFAULT_SETTINGS);
  });

  it("accessors slice the right groups", () => {
    const s = parseOrgSettings({ flipProfile: { minAssessed: 1 } });
    expect(flipProfileFor(s).minAssessed).toBe(1);
    expect(underwritingFor(s).holdingMonths).toBe(6);
  });

  it("saveOrgSettings merges patch into stored settings and persists", async () => {
    const store: Record<string, unknown> = {
      org_settings: {
        org_id: "org1",
        data: {
          flipProfile: { minAssessed: 60_000 },
          underwriting: {},
          agent: {},
          llm: {},
        },
        updated_at: "x",
      },
    };
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const saved = await saveOrgSettings("org1", {
      flipProfile: { maxAssessed: 200_000, statewide: false },
    });
    expect(saved.flipProfile.minAssessed).toBe(60_000);
    expect(saved.flipProfile.maxAssessed).toBe(200_000);
    expect(saved.flipProfile.statewide).toBe(false);
    const stored = store.org_settings as { data: typeof DEFAULT_SETTINGS };
    expect(stored.data.flipProfile.maxAssessed).toBe(200_000);
  });

  it("rejects an invalid patch without wiping stored settings", async () => {
    const store: Record<string, unknown> = {
      org_settings: {
        org_id: "org1",
        data: {
          flipProfile: { minAssessed: 60_000, maxAssessed: 150_000 },
          underwriting: {},
          agent: {},
          llm: {},
        },
        updated_at: "x",
      },
    };
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    await expect(
      saveOrgSettings("org1", { underwriting: { interestRate: "8" } } as never)
    ).rejects.toThrow(/Invalid settings patch/);
    // Stored settings untouched — never reset to defaults on a bad patch.
    const stored = store.org_settings as { data: { flipProfile: { minAssessed: number } } };
    expect(stored.data.flipProfile.minAssessed).toBe(60_000);
  });
});

describe("orgSettings — agent.limits", () => {
  it("defaults agent.limits to all-disabled guardrails", () => {
    const s = parseOrgSettings({});
    expect(s.agent.limits).toEqual(DEFAULT_GUARDRAILS);
  });

  it("preserves an explicit limits patch", () => {
    const s = parseOrgSettings({
      agent: { limits: { autoSendOffers: { enabled: true, maxOfferAmount: 40_000, dailyCap: 3 } } },
    });
    expect(s.agent.limits.autoSendOffers.enabled).toBe(true);
  });

  it("DEFAULT_SETTINGS carries limits", () => {
    expect(DEFAULT_SETTINGS.agent.limits).toEqual(DEFAULT_GUARDRAILS);
  });
});