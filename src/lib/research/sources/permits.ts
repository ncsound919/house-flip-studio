import type { PermitRecord, SourceResult } from "./types";

export async function fetchPermits(
  _address: string
): Promise<SourceResult<PermitRecord[]>> {
  // Same graceful-error pattern as liens: per-county public feeds vary and
  // none is configured yet, so we return an honest error rather than a
  // fabricated "no permits" report.
  return {
    source: "permits",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured permit source for this county",
  };
}