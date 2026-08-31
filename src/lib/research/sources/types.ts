export type SourceStatus = "ok" | "error";

export interface SourceResult<T> {
  source: string;
  status: SourceStatus;
  fetchedAt: string;
  data?: T;
  error?: string;
}

export interface TaxRecord {
  pin?: string;
  owner?: string;
  assessedValue?: number;
  landValue?: number;
  buildingValue?: number;
  acreage?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  mailingAddress?: string;
  mailingState?: string;
  multiParcelOwner?: boolean;
  taxDelinquent?: boolean;
}

export interface DeedRecord {
  grantor?: string;
  grantee?: string;
  salePrice?: number;
  saleDate?: string;
  propertyAddress?: string;
  pin?: string;
}

export interface LienRecord {
  type: string;
  amount?: number;
  filedDate?: string;
  description?: string;
}

export interface PermitRecord {
  type: string;
  status: string;
  issuedDate?: string;
  description?: string;
}

export interface RentcastProperty {
  address: string;
  ownerName?: string;
  occupantName?: string;
  occupancyType?: "owner" | "tenant" | "vacant" | "unknown";
  yearBuilt?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  estimatedValue?: number;
}