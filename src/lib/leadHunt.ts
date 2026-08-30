import { fetchZillow } from "@/lib/listingSources/zillow";
import { getCountyGuidance } from "@/lib/countyGis";
import { scoreLead } from "@/lib/leadScoring";
import type { ListingCard } from "@/lib/listingSources/types";
import { createAdminClient } from "@/lib/apiHelpers";

export interface HuntConfig {
  orgId: string;
  counties: string[];
  maxPerCounty: number;
}

export interface HuntResult {
  scanned: number;
  newLeads: number;
  duplicates: number;
  warnings: string[];
}

export interface ScoredLead extends ListingCard {
  score: ReturnType<typeof scoreLead>;
}

const SUPPORTED_COUNTIES = ["Mecklenburg", "Wake", "Durham", "Guilford"];

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

export async function scoreListings(county: string, listings: ListingCard[]): Promise<ScoredLead[]> {
  return listings.map((l) => ({ ...l, score: scoreLead(l) }));
}

// Hunt for leads: fetch from sources, score, dedupe against existing deals,
// and insert new ones as deals in the Lead stage. Runs on schedule or on demand.
export async function huntLeads(config: HuntConfig): Promise<HuntResult> {
  const admin = createAdminClient();
  const result: HuntResult = { scanned: 0, newLeads: 0, duplicates: 0, warnings: [] };

  // Existing addresses in this org, to avoid re-adding the same property.
  const { data: existing } = await admin
    .from("deals")
    .select("address")
    .eq("org_id", config.orgId);
  const known = new Set((existing ?? []).map((d: { address: string }) => normalizeAddress(d.address)));

  for (const county of config.counties) {
    if (!SUPPORTED_COUNTIES.includes(county)) {
      result.warnings.push(`Unsupported county: ${county}`);
      continue;
    }

    let listings: ListingCard[] = [];
    try {
      listings = await fetchZillow({ county });
    } catch {
      result.warnings.push(`Zillow unavailable for ${county} — check county GIS manually`);
    }

    // County guidance is the honest fallback signal even when scrape fails.
    const guidance = getCountyGuidance(county);
    if (guidance) {
      listings = listings.slice(0, config.maxPerCounty);
    }

    for (const listing of listings) {
      result.scanned++;
      const key = normalizeAddress(listing.address);
      if (!key) continue;
      if (known.has(key)) {
        result.duplicates++;
        continue;
      }
      known.add(key);

      const scored = scoreLead(listing);

      const { error } = await admin.from("deals").insert({
        org_id: config.orgId,
        address: listing.address,
        city: listing.city ?? null,
        state: "NC",
        photo_url: listing.photo_url ?? null,
        stage: "Lead",
        source: listing.source === "county_gis" ? "county_gis" : "api",
        asking_price: listing.price ?? null,
        sqft: listing.sqft ?? null,
        beds: listing.beds ?? null,
        baths: listing.baths ?? null,
        year_built: listing.year_built ?? null,
        notes: [
          `Auto-found by lead hunt (${listing.source_label}).`,
          scored.flags.length ? `Flags: ${scored.flags.join("; ")}` : "",
          scored.needsArv ? "No ARV known — score is a feasibility signal, not a verdict." : "",
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

  return result;
}
