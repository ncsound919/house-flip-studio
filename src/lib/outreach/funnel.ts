// Acquisition funnel — deterministic conversion aggregation.
//
// Stages: lead → contacted → responded → offered → contracted → closed.
// Derived from real deal stages + the outreach log. A deal counts as:
//   contacted — at least one outbound row with status 'sent'
//   responded — at least one row with a real response (any direction)
//   offered   — an outbound offer row, OR the deal advanced to Offer Made+
//   contracted — deal stage is Under Contract / Rehab / Listed / Closed
//   closed    — deal stage is Closed
// Nothing is inferred where data is missing.

export interface FunnelDeal {
  id: string;
  stage: string;
}

export interface FunnelOutreach {
  deal_id: string;
  direction: string;
  status: string;
  kind: string;
  response: string;
}

export interface FunnelInput {
  deals: FunnelDeal[];
  outreach: FunnelOutreach[];
}

export interface AcquisitionFunnel {
  leads: number;
  contacted: number;
  responded: number;
  offered: number;
  contracted: number;
  closed: number;
  conversion: {
    contactedPct: number;
    respondedPct: number;
    offeredPct: number;
    contractedPct: number;
    closedPct: number;
  };
}

const CONTRACTED_STAGES = new Set(["Under Contract", "Rehab", "Listed", "Closed"]);
const OFFER_STAGES = new Set(["Offer Made", "Under Contract", "Rehab", "Listed", "Closed"]);

export function computeAcquisitionFunnel(input: FunnelInput): AcquisitionFunnel {
  const byDeal = new Map<string, FunnelOutreach[]>();
  for (const o of input.outreach) {
    const list = byDeal.get(o.deal_id) ?? [];
    list.push(o);
    byDeal.set(o.deal_id, list);
  }

  let contacted = 0;
  let responded = 0;
  let offered = 0;
  let contracted = 0;
  let closed = 0;

  for (const d of input.deals) {
    const rows = byDeal.get(d.id) ?? [];
    const hasSent = rows.some((r) => r.direction === "outbound" && r.status === "sent");
    const hasResponse = rows.some((r) => r.response !== "none");
    const hasOffer = rows.some(
      (r) =>
        r.direction === "outbound" &&
        r.status === "sent" &&
        (r.kind === "initial_offer" || r.kind === "counter")
    );

    if (hasSent) contacted++;
    if (hasResponse) responded++;
    if (hasOffer || OFFER_STAGES.has(d.stage)) offered++;
    if (CONTRACTED_STAGES.has(d.stage)) contracted++;
    if (d.stage === "Closed") closed++;
  }

  const leads = input.deals.length;
  const pct = (n: number) => (leads > 0 ? Math.round((n / leads) * 100) : 0);

  return {
    leads,
    contacted,
    responded,
    offered,
    contracted,
    closed,
    conversion: {
      contactedPct: pct(contacted),
      respondedPct: pct(responded),
      offeredPct: pct(offered),
      contractedPct: pct(contracted),
      closedPct: pct(closed),
    },
  };
}
