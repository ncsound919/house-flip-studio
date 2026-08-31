import type { PermitRecord, SourceResult } from "./types";

export async function fetchPermits(
  _address: string
): Promise<SourceResult<PermitRecord[]>> {
  // Permit feeds are per-county; where none is configured we return an honest
  // error rather than a fabricated "no permits" clean sheet.
  return {
    source: "permits",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured permit source for this county",
  };
}