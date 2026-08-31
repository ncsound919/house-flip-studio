// Research source contracts — every external source returns a SourceResult with
// an explicit status. Nothing is ever fabricated: a source either returns real
// data (ok) or an honest error.

export type SourceStatus = "ok" | "error";

export interface SourceResult<T> {
  source: string;
  status: SourceStatus;
  fetchedAt: string;
  data?: T;
  error?: string;
}

export interface DeedRecord {
  grantor?: string;
  grantee?: string;
  salePrice?: number;
  saleDate?: string;
  propertyAddress?: string;
  pin?: string;
}