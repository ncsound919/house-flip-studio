import { z } from "zod";
import { createAdminClient } from "@/lib/apiHelpers";
import { guardrailLimitsSchema, DEFAULT_GUARDRAILS, type GuardrailLimits } from "@/lib/guardrails/limits";

// Org settings — the operator's strategy, stored per-org and read by the
// planner, runner, lead hunt, and underwriting. Replaces hardcoded constants
// so the business config lives in the app, not in code.
//
// Every field has a documented default equal to the previous hardcoded value,
// so an org with no settings row behaves exactly like before.

export const flipProfileSchema = z.object({
  minAssessed: z.number().default(30_000),
  maxAssessed: z.number().default(150_000),
  statewide: z.boolean().default(true),
  counties: z.array(z.string()).default([]),
  maxHuntPerRun: z.number().default(200),
});

export const underwritingSchema = z.object({
  rehabPerSqft: z.number().default(40),
  holdingMonths: z.number().default(6),
  downPaymentPct: z.number().default(20),
  interestRate: z.number().default(10),
  loanPoints: z.number().default(0),
});

export const agentSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  huntOnCycle: z.boolean().default(true),
  maxHuntPerCycle: z.number().default(100),
  limits: guardrailLimitsSchema.default({}),
});

export const llmSettingsSchema = z.object({
  generateScopes: z.boolean().default(true),
});

export const orgSettingsSchema = z.object({
  flipProfile: flipProfileSchema.default({}),
  underwriting: underwritingSchema.default({}),
  agent: agentSettingsSchema.default({}),
  llm: llmSettingsSchema.default({}),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export type FlipProfile = z.infer<typeof flipProfileSchema>;
export type UnderwritingSettings = z.infer<typeof underwritingSchema>;
export type AgentSettings = z.infer<typeof agentSettingsSchema>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const DEFAULT_SETTINGS: OrgSettings = {
  flipProfile: {
    minAssessed: 30_000,
    maxAssessed: 150_000,
    statewide: true,
    counties: [],
    maxHuntPerRun: 200,
  },
  underwriting: {
    rehabPerSqft: 40,
    holdingMonths: 6,
    downPaymentPct: 20,
    interestRate: 10,
    loanPoints: 0,
  },
  agent: {
    enabled: true,
    huntOnCycle: true,
    maxHuntPerCycle: 100,
    limits: DEFAULT_GUARDRAILS,
  },
  llm: {
    generateScopes: true,
  },
};

export function parseOrgSettings(raw: unknown): OrgSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  // Per-section recovery: a corrupt section resets to its defaults, but valid
  // sections are preserved — a single bad field must never wipe the whole config.
  return {
    flipProfile: parseSection(flipProfileSchema, obj.flipProfile),
    underwriting: parseSection(underwritingSchema, obj.underwriting),
    agent: parseSection(agentSettingsSchema, obj.agent),
    llm: parseSection(llmSettingsSchema, obj.llm),
  };
}

function parseSection<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const res = schema.safeParse(value ?? {});
  return res.success ? res.data : schema.parse({});
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_settings")
    .select("data")
    .eq("org_id", orgId)
    .single();
  if (!data?.data) return DEFAULT_SETTINGS;
  return parseOrgSettings((data as { data: unknown }).data);
}

// Merge a partial patch into stored settings. Returns the merged result.
// HONESTY: an invalid patch is rejected and stored settings are left untouched —
// never silently reset to defaults and persisted over the operator's config.
export async function saveOrgSettings(
  orgId: string,
  patch: DeepPartial<OrgSettings>
): Promise<OrgSettings> {
  const admin = createAdminClient();
  const current = await getOrgSettings(orgId);
  const merged = deepMerge(current, patch);
  const parsed = orgSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error("Invalid settings patch — values must be numbers, booleans, or string arrays.");
  }
  const { error } = await admin
    .from("org_settings")
    .upsert({ org_id: orgId, data: parsed.data, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Failed to save settings: ${error.message}`);
  return parsed.data;
}

// Shallow merge at each known top-level key; nested objects merge by key.
function deepMerge(
  base: OrgSettings,
  patch: DeepPartial<OrgSettings>
): OrgSettings {
  return {
    flipProfile: {
      ...base.flipProfile,
      ...(patch.flipProfile ?? {}),
      counties: Array.isArray(patch.flipProfile?.counties)
        ? patch.flipProfile.counties.filter((c): c is string => typeof c === "string")
        : base.flipProfile.counties,
    },
    underwriting: { ...base.underwriting, ...(patch.underwriting ?? {}) },
    agent: {
      ...base.agent,
      ...(patch.agent ?? {}),
      limits: {
        autoSendOffers: { ...base.agent.limits.autoSendOffers, ...(patch.agent?.limits?.autoSendOffers ?? {}) },
        autoSendRfq: { ...base.agent.limits.autoSendRfq, ...(patch.agent?.limits?.autoSendRfq ?? {}) },
        autoSpendRehab: { ...base.agent.limits.autoSpendRehab, ...(patch.agent?.limits?.autoSpendRehab ?? {}) },
        autoChase: { ...base.agent.limits.autoChase, ...(patch.agent?.limits?.autoChase ?? {}) },
        autoScheduleInspections: { ...base.agent.limits.autoScheduleInspections, ...(patch.agent?.limits?.autoScheduleInspections ?? {}) },
      },
    },
    llm: { ...base.llm, ...(patch.llm ?? {}) },
  };
}

// Convenience accessors used by callers that only need one slice.
export function flipProfileFor(settings: OrgSettings): FlipProfile {
  return settings.flipProfile;
}

export function underwritingFor(settings: OrgSettings): UnderwritingSettings {
  return settings.underwriting;
}