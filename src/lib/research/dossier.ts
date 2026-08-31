import { fetchDeedComps } from "./sources/deeds";
import type { SourceResult } from "./sources/types";

// Research dossier — aggregates per-source results so every lead/deal carries
// a labeled, auditable research record. Each source is independently recorded
// (ok/error + fetchedAt); a failing source never blocks the others, and no
// source result is ever fabricated.
//
// Phase 2 wires the real deed-transfer comps source. Additional sources
// (county tax, liens, permits, courts, rentcast) land with Phase 1's
// source-contract module.

export interface DossierInput {
  dealId: string;
  address: string;
  pin?: string;
}

export interface Dossier {
  dealId: string;
  sources: SourceResult<unknown>[];
  compiledAt: string;
}

export async function compileDossier(input: DossierInput): Promise<Dossier> {
  const sources: SourceResult<unknown>[] = [await fetchDeedComps(input.address)];
  return { dealId: input.dealId, sources, compiledAt: new Date().toISOString() };
}