import type { LienRecord, SourceResult } from "./types";

export async function fetchLiens(
  _pin: string
): Promise<SourceResult<LienRecord[]>> {
  // Per-county public feeds vary; where none is configured we return an
  // honest error rather than fabricating a clean title report.
  return {
    source: "liens",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured lien source for this county",
  };
}