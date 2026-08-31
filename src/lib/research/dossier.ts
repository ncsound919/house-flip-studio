import { fetchCountyTaxRecord } from "./sources/countyTax";
import { fetchDeedRecords } from "./sources/deeds";
import { fetchLiens } from "./sources/liens";
import { fetchPermits } from "./sources/permits";
import { fetchForeclosureNotices } from "./sources/courts";
import { fetchRentcastProperty } from "./sources/rentcast";
import type { SourceResult } from "./sources/types";

export interface DossierInput {
  dealId: string;
  address: string;
  pin?: string;
  profile: { minAssessed: number; maxAssessed: number };
}

export interface Dossier {
  dealId: string;
  sources: SourceResult<unknown>[];
  compiledAt: string;
}

// Compiles a research dossier from every configured source. Each source is
// independently recorded (ok/error + fetchedAt). A failing source never blocks
// the others, and no source result is ever fabricated.
export async function compileDossier(input: DossierInput): Promise<Dossier> {
  const profile = input.profile;
  const pin = input.pin ?? "";
  const sources: SourceResult<unknown>[] = [
    await fetchCountyTaxRecord(pin, profile),
    await fetchDeedRecords(input.address),
    await fetchLiens(pin),
    await fetchPermits(input.address),
    await fetchForeclosureNotices(input.address),
    await fetchRentcastProperty(input.address),
  ];
  return { dealId: input.dealId, sources, compiledAt: new Date().toISOString() };
}