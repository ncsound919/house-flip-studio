import type { ListingCard } from "./types";

// REAL public-record lead source: NC OneMap statewide parcels.
// One public ArcGIS feed covering ALL 100 NC counties — owner, assessed value,
// structure year, sale date, site + mailing address (absenteed detection), acreage.
// Government public records, defensible to query, no ToS risk.
//
// HONESTY: we only return rows that exist in the public record. Fields are
// sometimes missing on raw parcels (no sale date, no structure year) — we
// surface those as null, never fabricated.

export interface CountyParcelSource {
  county: string;
  connected: boolean;
  baseUrl?: string;
  status: "connected" | "not_connected";
}

// Operator's flip profile — the affordability filter that makes leads actionable.
// Set by the operator: buy budget $30k–$150k assessed, statewide.
export const FLIP_PROFILE = {
  minAssessed: 30_000,
  maxAssessed: 150_000,
};

// NC OneMap statewide parcel service. Public, covers all counties.
const ONEMAP_BASE =
  "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/0";

const COUNTIES: Record<string, CountyParcelSource> = {
  Wake: { county: "Wake", connected: true, baseUrl: ONEMAP_BASE, status: "connected" },
  Mecklenburg: { county: "Mecklenburg", connected: true, baseUrl: ONEMAP_BASE, status: "connected" },
  Durham: { county: "Durham", connected: true, baseUrl: ONEMAP_BASE, status: "connected" },
  Guilford: { county: "Guilford", connected: true, baseUrl: ONEMAP_BASE, status: "connected" },
};

export function parcelSourceForCounty(county: string): CountyParcelSource {
  return COUNTIES[county] ?? { county, connected: true, baseUrl: ONEMAP_BASE, status: "connected" };
}

// Motivation signals computed from the public record. These are the reasons a
// house is cheap at $30k–$150k — the whole point of this budget band.
// Each signal is a documented, editable heuristic — never invented.
export interface Motivation {
  absenteeOwner: boolean; // mailing address differs from site address
  outOfStateOwner: boolean; // mailing state ≠ NC
  longHeld: boolean; // owned > 15 years (low basis, flexible seller)
  olderHome: boolean; // structure year < 1980 (rehab upside, less competition)
  reasonCount: number; // count of active motivation signals (0–4)
  reasons: string[];
}

const NC_STATE_CODES = new Set(["NC", "N.C.", "NORTH CAROLINA"]);

function computeMotivation(a: Record<string, unknown>): Motivation {
  const reasons: string[] = [];

  // 1. Absentee: mailing address differs from site address.
  const absenteeOwner = Boolean(
    a.mailadd && a.siteadd && String(a.mailadd).trim() !== String(a.siteadd).trim()
  );
  if (absenteeOwner) reasons.push("Absentee owner (does not live there)");

  // 2. Out-of-state owner: mailing state is not NC. Strong motivation signal —
  // out-of-state owners are the most motivated sellers for cash/investor offers.
  let outOfStateOwner = false;
  const mailingState = String(a.mstate ?? "").trim().toUpperCase();
  if (mailingState && !NC_STATE_CODES.has(mailingState)) {
    outOfStateOwner = true;
    reasons.push(`Out-of-state owner (${mailingState})`);
  }

  // 3. Long-held: last sale > 15 years ago. Low basis = flexible seller.
  let longHeld = false;
  const saleDate = Number(a.saledate);
  if (Number.isFinite(saleDate) && saleDate > 0) {
    const saleYear = new Date(saleDate).getFullYear();
    longHeld = new Date().getFullYear() - saleYear > 15;
  }
  if (longHeld) {
    const yearStr = Number.isFinite(saleDate) ? new Date(saleDate).getFullYear().toString() : "unknown";
    reasons.push(`Long-held (last sale ${yearStr})`);
  }

  // 4. Older home: built before 1980. Rehab upside, less investor competition.
  const year = Number(a.structyear);
  const olderHome = Number.isFinite(year) && year > 0 && year < 1980;
  if (olderHome) reasons.push(`Older home (built ${year})`);

  return {
    absenteeOwner,
    outOfStateOwner,
    longHeld,
    olderHome,
    reasonCount: reasons.length,
    reasons,
  };
}

// NC OneMap ArcGIS JSON → ListingCard + motivation
export function mapParcel(a: Record<string, unknown>): ListingCard {
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const parval = toNum(a.parval);
  const motivation = computeMotivation(a);
  return {
    address: String(a.siteadd ?? "").trim(),
    city: String(a.scity ?? "").trim() || undefined,
    county: String(a.cntyname ?? "").trim() || "NC",
    price: undefined, // tax records have assessed value, not asking price
    sqft: toNum(a.structyear) ? undefined : undefined, // no heated area on statewide feed
    year_built: toNum(a.structyear),
    source: "county_gis",
    source_label: "nc_onemap_parcel",
    disclaimer: "NC tax record — public data. Assessed value, not asking price. Verify details before acting.",
    parcel: {
      pin: String(a.parno ?? ""),
      owner: String(a.ownname ?? ""),
      assessedValue: parval,
      landValue: toNum(a.landval),
      buildingValue: toNum(a.improvval),
      acreage: toNum(a.gisacres),
      lastSaleDate: toNum(a.saledate)
        ? new Date(Number(a.saledate)).toISOString().slice(0, 10)
        : undefined,
      mailingAddress: String(a.mailadd ?? "") || undefined,
      mailingState: String(a.mstate ?? "").trim() || undefined,
    },
    motivation,
  };
}

export async function fetchCountyParcels(params: {
  county?: string;
  address?: string;
  max?: number;
  minAssessed?: number;
  maxAssessed?: number;
}): Promise<{ cards: ListingCard[]; status: "connected" | "not_connected"; error?: string }> {
  const max = Math.min(params.max ?? 50, 100);
  const minVal = params.minAssessed ?? FLIP_PROFILE.minAssessed;
  const maxVal = params.maxAssessed ?? FLIP_PROFILE.maxAssessed;

  const conditions: string[] = [];
  if (minVal > 0 && maxVal > 0) {
    conditions.push(`parval BETWEEN ${minVal} AND ${maxVal}`);
  }
  if (params.county) conditions.push(`UPPER(cntyname) = UPPER('${params.county}')`);
  if (params.address) {
    conditions.push(`UPPER(siteadd) LIKE UPPER('%${params.address.replace(/'/g, "").trim()}%')`);
  }
  // Exclude empty-address records (land/lots) and require a structure year so
  // we return actual houses, not parcels/lots.
  conditions.push("siteadd IS NOT NULL");
  conditions.push("siteadd <> ''");
  conditions.push("structyear > 0");

  const where = conditions.length ? conditions.join(" AND ") : "1=1";

  const outFields = [
    "parno", "ownname", "siteadd", "scity", "mailadd", "mstate",
    "parval", "landval", "improvval", "gisacres", "saledate", "structyear", "cntyname",
  ].join(",");

  try {
    const url = `${ONEMAP_BASE}/query?where=${encodeURIComponent(where)}&outFields=${outFields}&returnGeometry=false&resultRecordCount=${max}&orderByFields=parval&f=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      return { cards: [], status: "connected", error: `NC OneMap returned ${res.status}` };
    }
    const j = await res.json();
    if (j.error) {
      return { cards: [], status: "connected", error: j.error.message ?? "NC OneMap error" };
    }
    const cards = (j.features ?? [])
      .map((f: { attributes: Record<string, unknown> }) => mapParcel(f.attributes))
      .filter((c: ListingCard | null): c is ListingCard => c !== null && Boolean(c.address) && c.parcel?.assessedValue != null);
    return { cards, status: "connected" };
  } catch (e) {
    return {
      cards: [],
      status: "connected",
      error: e instanceof Error ? e.message : "NC OneMap unreachable",
    };
  }
}
