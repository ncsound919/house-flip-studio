import type { SourceResult } from "./types";

export interface DeedComp {
  sale_price: number;
  sale_date?: string;
  address?: string;
  sqft?: number;
  source: "deeds";
  distance_score?: number;
}

// NC county registers of deeds publish transfer records. We target county
// ArcGIS/JSON endpoints; the exact endpoint is configured per-county. Where
// none is configured, we return an honest error (no fabricated comps).
const DEED_ENDPOINTS: Record<string, string> = {
  // e.g. Wake: "https://maps.raleighnc.gov/arcgis/rest/services/.../query"
};

export function parseDeedComps(raw: { records?: unknown[] }, neighborhood: string): DeedComp[] {
  const records = Array.isArray(raw?.records) ? raw.records : [];
  const comps: DeedComp[] = [];
  for (const r of records) {
    const rec = r as Record<string, unknown>;
    const price = Number(rec.salePrice ?? rec.sale_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const address = String(rec.propertyAddress ?? rec.address ?? "").trim();
    const sqft = Number(rec.sqft) > 0 ? Number(rec.sqft) : undefined;
    comps.push({
      sale_price: Math.round(price),
      sale_date: rec.saleDate ? String(rec.saleDate) : undefined,
      address: address || undefined,
      sqft,
      source: "deeds",
      distance_score: address.toLowerCase().includes(neighborhood.toLowerCase()) ? 1 : undefined,
    });
  }
  return comps;
}

export async function fetchDeedComps(
  address: string,
  opts: { timeoutMs?: number } = {}
): Promise<SourceResult<DeedComp[]>> {
  const endpoint = process.env.NC_DEEDS_ENDPOINT;
  if (!endpoint) {
    return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: "NC_DEEDS_ENDPOINT not configured" };
  }
  try {
    const res = await fetch(`${endpoint}?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: `deeds feed returned ${res.status}` };
    }
    const j = await res.json();
    const neighborhood = address.split(",")[0]?.trim() ?? "";
    const comps = parseDeedComps(j, neighborhood);
    return { source: "deeds", status: "ok", fetchedAt: new Date().toISOString(), data: comps };
  } catch (e) {
    return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "deeds feed unreachable" };
  }
}

export const fetchDeedRecords = fetchDeedComps; // backward-compatible with dossier contract