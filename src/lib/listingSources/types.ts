export interface ListingCard {
  address: string;
  city?: string;
  county: string;
  price?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  year_built?: number;
  photo_url?: string;
  source: "county_gis" | "api";
  source_label: string; // "county_gis" | "zillow" | "wake_tax_parcel"
  disclaimer?: string;
  parcel?: {
    pin?: string;
    owner?: string;
    assessedValue?: number;
    landValue?: number;
    buildingValue?: number;
    acreage?: number;
    lastSaleDate?: string;
  };
}
export interface ListingSource {
  id: "county_gis" | "zillow";
  label: string;
  disclaimer: string;
  fetch(params: { county: string; address?: string }): Promise<ListingCard[]>;
}
