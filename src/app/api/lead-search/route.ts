import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { fetchZillow } from "@/lib/listingSources/zillow";
import { getCountyGuidance, lookupPropertyByAddress } from "@/lib/countyGis";
import type { ListingCard } from "@/lib/listingSources/types";

export async function POST(req: Request) {
  try {
    await requireOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const county = typeof body.county === "string" ? body.county.trim() : "";
  const address = typeof body.address === "string" ? body.address : undefined;
  const rawSources = Array.isArray(body.sources) ? body.sources : [];
  const sources = rawSources.filter(
    (s): s is "county_gis" | "zillow" => s === "county_gis" || s === "zillow"
  );

  if (!county) {
    return NextResponse.json({ error: "County is required" }, { status: 400 });
  }

  const results: ListingCard[] = [];
  const warnings: string[] = [];

  const tasks: Promise<void>[] = [];

  if (sources.includes("county_gis")) {
    tasks.push(
      (async () => {
        const guidance = getCountyGuidance(county);
        if (!guidance) {
          warnings.push(`Unsupported county: ${county}`);
          return;
        }
        const trimmedAddress = address?.trim();
        if (trimmedAddress) {
          const lookup = await lookupPropertyByAddress(trimmedAddress, county);
          if (lookup) {
            results.push({
              address: lookup.address,
              county: lookup.county,
              source: "county_gis",
              source_label: "county_gis",
              disclaimer: `${lookup.guidance} Portal: ${lookup.portalUrl}`,
            });
            return;
          }
        }
        // No address or lookup failed — guidance fallback card
        // Use address placeholder from guidance or county name
        results.push({
          address: trimmedAddress || `${guidance.county} County — see portal guidance`,
          county: guidance.county,
          source: "county_gis",
          source_label: "county_gis",
          disclaimer: `${guidance.searchInstructions} Portal: ${guidance.portalUrl}`,
        });
      })()
    );
  }

  if (sources.includes("zillow")) {
    tasks.push(
      (async () => {
        try {
          const cards = await fetchZillow({ county, address });
          if (cards.length === 0) {
            warnings.push(
              "zillow unavailable — no listings found or service unavailable. Showing county guidance fallback."
            );
          } else {
            results.push(...cards);
          }
        } catch {
          warnings.push(
            "zillow unavailable — fetch failed. Showing county guidance fallback."
          );
        }
      })()
    );
  }

  await Promise.all(tasks);

  return NextResponse.json({ results, warnings });
}
