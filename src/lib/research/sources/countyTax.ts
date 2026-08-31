import { fetchCountyParcels } from "@/lib/listingSources/countyParcels";
import type { SourceResult, TaxRecord } from "./types";

export async function fetchCountyTaxRecord(
  pin: string,
  profile: { minAssessed: number; maxAssessed: number }
): Promise<SourceResult<TaxRecord>> {
  const r = await fetchCountyParcels({ max: 10, minAssessed: profile.minAssessed, maxAssessed: profile.maxAssessed });
  if (r.error || r.cards.length === 0) {
    return { source: "county_tax", status: "error", fetchedAt: new Date().toISOString(), error: r.error ?? "no parcels returned" };
  }
  const match = r.cards.find((c) => c.parcel?.pin && normalizePin(c.parcel.pin) === normalizePin(pin));
  const card = match ?? r.cards[0];
  return {
    source: "county_tax",
    status: "ok",
    fetchedAt: new Date().toISOString(),
    data: {
      pin: card.parcel?.pin,
      owner: card.parcel?.owner,
      assessedValue: card.parcel?.assessedValue,
      landValue: card.parcel?.landValue,
      buildingValue: card.parcel?.buildingValue,
      acreage: card.parcel?.acreage,
      lastSaleDate: card.parcel?.lastSaleDate,
      mailingAddress: card.parcel?.mailingAddress,
      mailingState: card.parcel?.mailingState,
      multiParcelOwner: card.motivation?.multiParcelOwner,
      taxDelinquent: card.motivation?.taxDelinquent,
    },
  };
}

function normalizePin(pin: string): string {
  return pin.replace(/[^a-z0-9]/gi, "").toLowerCase();
}