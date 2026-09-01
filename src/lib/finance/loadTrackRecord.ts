// Server-side assembly of the track record from real DB rows. Shares the same
// deterministic computation as the API route so the JSON and the CSV/PDF export
// can never disagree.

import { createAdminClient } from "@/lib/apiHelpers";
import {
  buildTrackRecord,
  computeTrackRecordSummary,
  type TrackRecordDeal,
  type TrackRecordRow,
  type TrackRecordSummary,
  type TrackRecordUnderwriting,
} from "./trackRecord";

export interface TrackRecordPackage {
  rows: TrackRecordRow[];
  summary: TrackRecordSummary;
}

export async function loadTrackRecordForOrg(orgId: string): Promise<TrackRecordPackage> {
  const admin = createAdminClient();

  const { data: deals } = await admin
    .from("deals")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const dealList = (deals ?? []) as TrackRecordDeal[];
  const dealIds = dealList.map((d) => d.id);

  const [{ data: uws }, { data: rehabItems }] = await Promise.all([
    dealIds.length > 0
      ? admin
          .from("underwriting")
          .select(
            "deal_id, purchase_price, acquisition_costs, financing_costs, selling_costs, projected_profit, arv"
          )
          .in("deal_id", dealIds)
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("rehab_items")
      .select("deal_id, actual_cost")
      .eq("org_id", orgId),
  ]);

  const rehabActualByDeal: Record<string, number> = {};
  for (const item of (rehabItems ?? []) as Array<{ deal_id: string; actual_cost: number | null }>) {
    rehabActualByDeal[item.deal_id] =
      (rehabActualByDeal[item.deal_id] ?? 0) + (Number(item.actual_cost) || 0);
  }

  const rows = buildTrackRecord({
    deals: dealList,
    underwriting: (uws ?? []) as TrackRecordUnderwriting[],
    rehabActualByDeal,
  });

  return { rows, summary: computeTrackRecordSummary(rows) };
}
