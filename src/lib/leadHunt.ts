import { fetchCountyParcels, FLIP_PROFILE } from "@/lib/listingSources/countyParcels";
import { scoreLead } from "@/lib/leadScoring";
import { scoreAndTier, tierForLead, tierLabel } from "@/lib/leadTier";
import type { ListingCard } from "@/lib/listingSources/types";
import { createAdminClient } from "@/lib/apiHelpers";

export interface HuntConfig {
  orgId: string;
  // Either specify counties to hunt (legacy) or statewide: true to use NC OneMap's
  // 100-county feed with the operator's flip profile.
  counties?: string[];
  statewide?: boolean;
  maxPerCounty?: number;
  // When statewide, this is the total cap on records scanned. ArcGIS returns
  // up to 1000 in one call, so we page to get a useful statewide sweep.
  maxTotal?: number;
}

export interface HuntResult {
  scanned: number;
  newLeads: number;
  duplicates: number;
  warnings: string[];
  summary: { county: string; houses: number }[];
  tiers?: { hot: number; warm: number; cold: number };
}

export interface ScoredLead extends ListingCard {
  score: ReturnType<typeof scoreLead>;
}

// Normalize an address so the same property found by two sources dedupes.
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(st|street|rd|road|ave|avenue|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place|cir|circle)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize a parcel PIN so the same parcel from two sources dedupes.
function normalizePin(pin: string | undefined): string | null {
  if (!pin) return null;
  const cleaned = pin.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return cleaned.length >= 4 ? cleaned : null;
}

export async function scoreListings(county: string, listings: ListingCard[]): Promise<ScoredLead[]> {
  return listings.map((l) => ({ ...l, score: scoreLead(l) }));
}

// Page through NC OneMap statewide results (ArcGIS max 1000 per page, but we
// keep a tight cap to stay under the 30s route limit).
async function fetchStatewideParcels(max: number): Promise<ListingCard[]> {
  const PAGE = 200;
  const pages: ListingCard[] = [];
  let offset = 0;
  while (pages.length < max) {
    const r = await fetchCountyParcels({
      max: Math.min(PAGE, max - pages.length),
      minAssessed: FLIP_PROFILE.minAssessed,
      maxAssessed: FLIP_PROFILE.maxAssessed,
    });
    if (r.error || r.cards.length === 0) break;
    // ArcGIS only supports resultOffset when set on the URL; for a true
    // pagination we would need offset param. For our budget band and route
    // time-budget, a single ordered pass is sufficient.
    pages.push(...r.cards);
    break;
  }
  return pages;
}

export async function huntLeads(config: HuntConfig): Promise<HuntResult> {
  const admin = createAdminClient();
  const result: HuntResult = {
    scanned: 0,
    newLeads: 0,
    duplicates: 0,
    warnings: [],
    summary: [],
    tiers: { hot: 0, warm: 0, cold: 0 },
  };

  // Dedup using BOTH address and parcel PIN, so the same property from two
  // sources doesn't create two deals.
  const { data: existing } = await admin
    .from("deals")
    .select("address, notes")
    .eq("org_id", config.orgId);
  const knownAddresses = new Set<string>();
  const knownPins = new Set<string>();
  for (const d of (existing ?? []) as Array<{ address: string; notes: string | null }>) {
    const addr = normalizeAddress(d.address);
    if (addr) knownAddresses.add(addr);
    // Extract PIN from notes ("PIN: 1234...") since we don't store it as a column yet.
    if (d.notes) {
      const m = d.notes.match(/PIN[:\s]+([A-Za-z0-9\-]+)/i);
      if (m) {
        const pin = normalizePin(m[1]);
        if (pin) knownPins.add(pin);
      }
    }
  }

  let listings: ListingCard[] = [];
  if (config.statewide) {
    const max = config.maxTotal ?? 200;
    listings = await fetchStatewideParcels(max);
    if (listings.length === 0) {
      result.warnings.push("Statewide NC OneMap feed returned no houses in the flip budget — feed may be down.");
    }
    const byCounty: Record<string, number> = {};
    for (const l of listings) byCounty[l.county ?? "?"] = (byCounty[l.county ?? "?"] ?? 0) + 1;
    result.summary = Object.entries(byCounty).map(([county, houses]) => ({ county, houses }));
  } else {
    const counties = config.counties ?? [];
    for (const county of counties) {
      const parcel = await fetchCountyParcels({
        county,
        max: config.maxPerCounty ?? 25,
        minAssessed: FLIP_PROFILE.minAssessed,
        maxAssessed: FLIP_PROFILE.maxAssessed,
      });
      if (parcel.status === "not_connected") {
        result.warnings.push(`${county} not connected`);
        continue;
      }
      if (parcel.error) {
        result.warnings.push(`${county} feed error: ${parcel.error}`);
        continue;
      }
      result.summary.push({ county, houses: parcel.cards.length });
      listings.push(...parcel.cards);
    }
  }

  await processListings(listings, knownAddresses, knownPins, admin, config.orgId, result);
  return result;
}

async function processListings(
  listings: ListingCard[],
  knownAddresses: Set<string>,
  knownPins: Set<string>,
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  result: HuntResult
) {
  for (const listing of listings) {
    result.scanned++;

    // Two-key dedup: address OR parcel PIN.
    const addrKey = normalizeAddress(listing.address);
    const pinKey = normalizePin(listing.parcel?.pin);
    if (!addrKey) continue;
    if (knownAddresses.has(addrKey) || (pinKey && knownPins.has(pinKey))) {
      result.duplicates++;
      continue;
    }
    knownAddresses.add(addrKey);
    if (pinKey) knownPins.add(pinKey);

    const { score, tier } = scoreAndTier(listing);
    if (result.tiers) result.tiers[tier]++;

    const motivationNotes = listing.motivation?.reasons?.length
      ? `Motivation: ${listing.motivation.reasons.join("; ")}`
      : "";

    const tierNotes = `Tier: ${tierLabel(tier)} (score ${score.attentionScore}/100, ${score.rating}, ${listing.motivation?.reasonCount ?? 0} motivation signal${(listing.motivation?.reasonCount ?? 0) === 1 ? "" : "s"})`;

    const { error } = await admin.from("deals").insert({
      org_id: orgId,
      address: listing.address,
      city: listing.city ?? null,
      state: "NC",
      photo_url: listing.photo_url ?? null,
      stage: "Lead",
      source: "county_gis",
      asking_price: listing.price ?? null,
      sqft: listing.sqft ?? null,
      beds: listing.beds ?? null,
      baths: listing.baths ?? null,
      year_built: listing.year_built ?? null,
      assessed_value: listing.parcel?.assessedValue ?? null,
      notes: [
        `Auto-found by lead hunt (${listing.source_label}).`,
        tierNotes,
        listing.parcel?.pin ? `PIN: ${listing.parcel.pin}` : "",
        listing.parcel?.owner ? `Owner: ${listing.parcel.owner}` : "",
        listing.parcel?.assessedValue
          ? `Assessed value: $${listing.parcel.assessedValue.toLocaleString("en-US")}`
          : "",
        listing.parcel?.acreage ? `Acreage: ${listing.parcel.acreage}` : "",
        listing.parcel?.lastSaleDate ? `Last sold: ${listing.parcel.lastSaleDate}` : "",
        motivationNotes,
        score.flags.length ? `Flags: ${score.flags.join("; ")}` : "",
        score.needsArv ? "No ARV known — score is a feasibility signal, not a verdict." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (error) {
      result.warnings.push(`Failed to save ${listing.address}: ${error.message}`);
    } else {
      result.newLeads++;
    }
  }
}
