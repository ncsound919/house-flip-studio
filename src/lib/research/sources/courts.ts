import type { LienRecord, SourceResult } from "./types";

// Foreclosure notices — a distress signal. Graceful error when no county feed
// is configured; never fabricates a clean record.
export async function fetchForeclosureNotices(
  _address: string
): Promise<SourceResult<LienRecord[]>> {
  return {
    source: "courts",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured foreclosure feed for this county",
  };
}