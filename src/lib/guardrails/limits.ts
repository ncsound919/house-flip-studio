import { z } from "zod";

// Guardrail limits — the near-full-autonomy policy. Folded into org_settings
// under `agent.limits`. HONESTY: every limit defaults to DISABLED so the agent
// auto-approves nothing until the operator explicitly enables it.

export const autoSendOffersSchema = z.object({
  enabled: z.boolean().default(false),
  maxOfferAmount: z.number().default(0),
  dailyCap: z.number().default(0),
});

export const autoSendRfqSchema = z.object({
  enabled: z.boolean().default(false),
  dailyCap: z.number().default(0),
});

export const autoSpendRehabSchema = z.object({
  enabled: z.boolean().default(false),
  monthlyCap: z.number().default(0),
});

export const autoChaseSchema = z.object({
  enabled: z.boolean().default(false),
  dailyCap: z.number().default(0),
});

export const autoScheduleInspectionsSchema = z.object({
  enabled: z.boolean().default(false),
  maxPerDay: z.number().default(0),
});

export const guardrailLimitsSchema = z.object({
  autoSendOffers: autoSendOffersSchema.default({}),
  autoSendRfq: autoSendRfqSchema.default({}),
  autoSpendRehab: autoSpendRehabSchema.default({}),
  autoChase: autoChaseSchema.default({}),
  autoScheduleInspections: autoScheduleInspectionsSchema.default({}),
});

export type GuardrailLimits = z.infer<typeof guardrailLimitsSchema>;

export const DEFAULT_GUARDRAILS: GuardrailLimits = {
  autoSendOffers: { enabled: false, maxOfferAmount: 0, dailyCap: 0 },
  autoSendRfq: { enabled: false, dailyCap: 0 },
  autoSpendRehab: { enabled: false, monthlyCap: 0 },
  autoChase: { enabled: false, dailyCap: 0 },
  autoScheduleInspections: { enabled: false, maxPerDay: 0 },
};