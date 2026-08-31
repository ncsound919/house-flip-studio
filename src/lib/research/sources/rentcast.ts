import type { RentcastProperty, SourceResult } from "./types";

const RENTCAST_URL = "https://api.rentcast.io/v1/properties";

// Paid API — HONESTY: returns a real result or an explicit error. Never
// fabricates owner/occupancy/value. Requires RENTCAST_API_KEY.
export async function fetchRentcastProperty(
  address: string
): Promise<SourceResult<RentcastProperty>> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: "RENTCAST_API_KEY not configured" };
  }
  try {
    const res = await fetch(`${RENTCAST_URL}?address=${encodeURIComponent(address)}`, {
      headers: { accept: "application/json", "X-Api-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: `rentcast returned ${res.status}` };
    }
    const j = await res.json();
    return {
      source: "rentcast",
      status: "ok",
      fetchedAt: new Date().toISOString(),
      data: {
        address: String(j.address?.line1 ?? j.address ?? address),
        ownerName: j.ownerName ?? undefined,
        occupantName: j.occupantName ?? undefined,
        occupancyType: j.occupancyType ?? "unknown",
        yearBuilt: j.yearBuilt ?? undefined,
        sqft: j.squareFootage ?? undefined,
        beds: j.bedrooms ?? undefined,
        baths: j.bathrooms ?? undefined,
        lastSalePrice: j.lastSalePrice ?? undefined,
        lastSaleDate: j.lastSaleDate ?? undefined,
        estimatedValue: j.estimatedValue ?? undefined,
      },
    };
  } catch (e) {
    return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "rentcast unreachable" };
  }
}