export const DEAL_STAGES = [
  "Lead",
  "Inspecting",
  "Underwriting",
  "Offer Made",
  "Under Contract",
  "Rehab",
  "Listed",
  "Closed",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  org_id: string;
  address: string;
  city: string | null;
  state: string;
  zip: string | null;
  photo_url: string | null;
  stage: DealStage;
  stage_changed_at: string;
  source: "manual" | "county_gis" | "api";
  asking_price: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  year_built: number | null;
  lot_size: string | null;
  assessed_value: number | null;
  arv_estimate: number | null;
  arv_method: string | null;
  arv_estimate_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type NewDeal = Partial<
  Pick<Deal, "address" | "city" | "state" | "zip" | "photo_url" | "source">
> & {
  asking_price?: number | null;
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  lot_size?: string | null;
};

export const REHAB_TRADES = [
  "Structural",
  "Mechanical",
  "Interior",
  "Roofing",
  "Electrical",
  "Plumbing",
  "Exterior",
  "General",
] as const;

export type RehabTrade = (typeof REHAB_TRADES)[number];

export type RehabStatus = "estimated" | "contracted" | "in_progress" | "completed";

export type ChangeOrderStatus = "approved" | "pending" | "rejected";

export interface Contractor {
  id: string;
  name: string;
  trade: string;
  phone?: string;
  status: "active" | "available" | "completed";
}

export interface RehabItem {
  id: string;
  deal_id: string;
  org_id?: string;
  trade: string;
  description: string;
  contractor_id: string | null;
  estimated_cost: number;
  actual_cost: number;
  status: RehabStatus;
  notes: string | null;
  created_at: string;
  contractors?: { name: string } | null;
}

export interface ChangeOrder {
  id: string;
  rehab_item_id: string;
  description: string;
  cost_impact: number;
  reason: string | null;
  status: ChangeOrderStatus;
  created_at: string;
}
