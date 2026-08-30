import type { ListingCard } from "./types";

// REAL public-record lead source: NC county tax-parcel data via public ArcGIS
// REST endpoints. These are government public records (owner, assessed value,
// year built, heated area, last sale) — defensible to query, no ToS risk.
//
// HONESTY: only counties with a verified, reachable endpoint return real rows.
// Others return an empty array with a `state` explaining why, so the UI can
// say "not connected" instead of showing fake data.

export interface CountyParcelSource {
  county: string;
  connected: boolean;
  baseUrl?: string;
  status: "connected" | "not_connected";
}

const COUNTIES: Record<string, CountyParcelSource> = {
  Wake: {
    county: "Wake",
    connected: true,
    baseUrl:
      "https://maps.wake.gov/arcgis/rest/services/Property/Parcels/FeatureServer/0/query",
    status: "connected",
  },
  Mecklenburg: { county: "Mecklenburg", connected: false, status: "not_connected" },
  Durham: { county: "Durham", connected: false, status: "not_connected" },
  Guilford: { county: "Guilford", connected: false, status: "not_connected" },
};

export function parcelSourceForCounty(county: string): CountyParcelSource {
  return COUNTIES[county] ?? { county, connected: false, status: "not_connected" };
}

// ArcGIS JSON → ListingCard
export function mapParcel(a: Record<string, unknown>): ListingCard {
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const address = String(a.SITE_ADDRESS ?? a.ADDR1 ?? "").trim();
  const saleDateMs = toNum(a.SALE_DATE);
  return {
    address,
    city: String(a.CITY_DECODE ?? "").trim() || undefined,
    county: "Wake",
    price: toNum(a.TOTSALPRICE) ?? undefined,
    sqft: toNum(a.HEATEDAREA) ?? undefined,
    year_built: toNum(a.YEAR_BUILT) ?? undefined,
    source: "county_gis",
    source_label: "wake_tax_parcel",
    disclaimer: "County tax record — public data. Verify details before relying on it.",
    // Extra fields travel via a side channel for the detail view.
    parcel: {
      pin: String(a.PIN_NUM ?? ""),
      owner: String(a.OWNER ?? ""),
      assessedValue: toNum(a.TOTAL_VALUE_ASSD),
      landValue: toNum(a.LAND_VAL),
      buildingValue: toNum(a.BLDG_VAL),
      acreage: toNum(a.CALC_AREA) ?? toNum(a.DEED_ACRES),
      lastSaleDate: saleDateMs ? new Date(saleDateMs).toISOString().slice(0, 10) : undefined,
    },
  };
}

export async function fetchCountyParcels(params: {
  county: string;
  address?: string;
  max?: number;
}): Promise<{ cards: ListingCard[]; status: "connected" | "not_connected"; error?: string }> {
  const src = parcelSourceForCounty(params.county);
  if (!src.connected || !src.baseUrl) {
    return { cards: [], status: "not_connected" };
  }

  const max = Math.min(params.max ?? 25, 25);
  const where = params.address
    ? `UPPER(SITE_ADDRESS) LIKE UPPER('%${params.address.replace(/'/g, "").trim()}%')`
    : "1=1";

  const outFields = [
    "OBJECTID", "PIN_NUM", "SITE_ADDRESS", "OWNER", "CITY_DECODE",
    "TOTAL_VALUE_ASSD", "LAND_VAL", "BLDG_VAL", "YEAR_BUILT",
    "HEATEDAREA", "TOTSALPRICE", "SALE_DATE", "CALC_AREA", "DEED_ACRES",
  ].join(",");

  try {
    const url = `${src.baseUrl}?where=${encodeURIComponent(where)}&outFields=${outFields}&returnGeometry=false&resultRecordCount=${max}&f=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      return { cards: [], status: "connected", error: `County API returned ${res.status}` };
    }
    const j = await res.json();
    if (j.error) {
      return { cards: [], status: "connected", error: j.error.message ?? "County API error" };
    }
    const cards = (j.features ?? [])
      .map((f: { attributes: Record<string, unknown> }) => mapParcel(f.attributes))
      .filter((c: ListingCard) => c.address);
    return { cards, status: "connected" };
  } catch (e) {
    return {
      cards: [],
      status: "connected",
      error: e instanceof Error ? e.message : "County API unreachable",
    };
  }
}
