import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { fetchCountyParcels } from "@/lib/listingSources/countyParcels";
import { getCountyGuidance } from "@/lib/countyGis";
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
    (s): s is "county_gis" | "tax_records" =>
      s === "county_gis" || s === "tax_records"
  );

  if (!county) {
    return NextResponse.json({ error: "County is required" }, { status: 400 });
  }

  const results: ListingCard[] = [];
  const warnings: string[] = [];

  const tasks: Promise<void>[] = [];

  if (sources.includes("tax_records")) {
    tasks.push(
      (async () => {
        const parcel = await fetchCountyParcels({ county, address, max: 25 });
        if (parcel.status === "not_connected") {
          warnings.push(
            `${county} county tax-record feed is not connected yet. Use county GIS manual entry for now.`
          );
        } else if (parcel.error) {
          warnings.push(`County tax-record feed error: ${parcel.error}`);
        } else if (parcel.cards.length === 0) {
          warnings.push(`No tax parcels found matching "${address ?? "all"}" in ${county} County.`);
        } else {
          results.push(...parcel.cards);
        }
      })()
    );
  }

  if (sources.includes("county_gis")) {
    tasks.push(
      (async () => {
        const guidance = getCountyGuidance(county);
        if (!guidance) {
          warnings.push(`Unsupported county: ${county}`);
          return;
        }
        const trimmedAddress = address?.trim();
        // Guidance card so users always have a manual-entry path.
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

  await Promise.all(tasks);

  return NextResponse.json({ results, warnings });
}
