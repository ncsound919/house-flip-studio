// Learning sync engine — turns calibration output into recorded outcomes,
// distilled lessons, and trend snapshots. Idempotent: outcomes dedupe on
// (org_id, event_key), so running sync repeatedly never double-counts evidence.

import { createAdminClient } from "@/lib/apiHelpers";
import { loadCalibrationForOrg } from "@/lib/finance/loadCalibration";
import type { DealCalibration } from "@/lib/finance/calibration";
import { distillLessons, type LearningOutcomeInput } from "@/lib/learning/lessons";
import { snapshotMarketInsights } from "@/lib/learning/trends";

interface OutcomeRow extends LearningOutcomeInput {
  org_id: string;
  agent_id: string;
  event_key: string;
}

function outcomesFromDeal(d: DealCalibration): OutcomeRow[] {
  const out: OutcomeRow[] = [];
  const money = (n: number) => n.toLocaleString("en-US");
  const base = { org_id: d.dealId, agent_id: "flip-system", kind: "calibration" };

  if (d.arv) {
    out.push({
      ...base,
      summary: "ARV accuracy",
      detail: `${d.address}: projected $${money(d.arv.projected)} actual $${money(d.arv.actual)} (${d.arv.accuracyPct}%)`,
      success: d.arv.accuracyPct >= 85 && d.arv.accuracyPct <= 115,
      event_key: `calibration:${d.dealId}:arv`,
    });
  }
  if (d.rehab) {
    out.push({
      ...base,
      summary: "Rehab cost",
      detail: `${d.address}: projected $${money(d.rehab.projected)} actual $${money(d.rehab.actual)} (${d.rehab.variancePct}% variance)`,
      success: Math.abs(d.rehab.variancePct) <= 15,
      event_key: `calibration:${d.dealId}:rehab`,
    });
  }
  if (d.profit) {
    out.push({
      ...base,
      summary: "Profit accuracy",
      detail: `${d.address}: projected $${money(d.profit.projected)} realized $${money(d.profit.actual)} (${d.profit.accuracyPct}%)`,
      success: d.profit.accuracyPct >= 85 && d.profit.accuracyPct <= 115,
      event_key: `calibration:${d.dealId}:profit`,
    });
  }
  return out;
}

export interface SyncResult {
  recordedOutcomes: number;
  lessons: number;
  insights: number;
}

export async function syncLearning(orgId: string, baselineRehabPerSqft?: number): Promise<SyncResult> {
  const admin = createAdminClient();
  const { deals, market } = await loadCalibrationForOrg(orgId, baselineRehabPerSqft);

  // 1. Record outcomes for every calibration point (idempotent).
  const outcomes = deals.flatMap(outcomesFromDeal);
  let recordedOutcomes = 0;
  if (outcomes.length > 0) {
    const { error } = await admin
      .from("learning_outcomes")
      .upsert(outcomes, { onConflict: "org_id,event_key", ignoreDuplicates: true });
    if (error) throw error;
    recordedOutcomes = outcomes.length;
  }

  // 2. Distill lessons from ALL recorded outcomes for this org.
  const { data: stored } = await admin
    .from("learning_outcomes")
    .select("kind, summary, detail, success")
    .eq("org_id", orgId);
  const lessons = distillLessons(
    (stored ?? []).map((o) => ({
      kind: o.kind,
      summary: o.summary,
      detail: o.detail,
      success: o.success,
    }))
  );
  if (lessons.length > 0) {
    await admin.from("learning_lessons").upsert(
      lessons.map((l) => ({
        id: l.id,
        org_id: orgId,
        agent_id: l.agent_id,
        pattern: l.pattern,
        lesson: l.lesson,
        evidence_count: l.evidence_count,
        last_seen: new Date().toISOString(),
      })),
      { onConflict: "org_id,id" }
    );
  }

  // 3. Append a market-insights snapshot per metric.
  const insights = snapshotMarketInsights(deals, market);
  if (insights.length > 0) {
    await admin.from("market_insights").insert(
      insights.map((i) => ({
        org_id: orgId,
        metric: i.metric,
        value: i.value,
        sample_size: i.sample_size,
        source: i.source,
        window_start: i.window_start,
      }))
    );
  }

  return { recordedOutcomes, lessons: lessons.length, insights: insights.length };
}
