import type { DeedRecord, SourceResult } from "./types";

// Phase 2 will implement county deed-record comps. This stub keeps the
// dossier contract stable so compileDossier can be built now.
export async function fetchDeedRecords(
  _address: string
): Promise<SourceResult<DeedRecord[]>> {
  return {
    source: "deeds",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "deed source not implemented (Phase 2)",
  };
}