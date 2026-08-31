import type { SourceResult } from "./types";

export interface CourtRecord {
  type: "foreclosure" | "lis_pendens" | "bankruptcy";
  caseNumber?: string;
  filedDate?: string;
  description?: string;
}

// Foreclosure / lis pendens notices. Public feeds are per-county and none is
// configured yet — graceful error, never a fabricated "clear" report.
export async function fetchForeclosureNotices(
  _address: string
): Promise<SourceResult<CourtRecord[]>> {
  return {
    source: "courts",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured court/foreclosure feed for this county",
  };
}