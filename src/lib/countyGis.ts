// NC County GIS property lookup.
//
// HONESTY NOTE: v1 does NOT scrape county GIS portals. County sites are
// inconsistent, change often, and scraping may violate terms of service.
// Instead we return *guidance*: which public portal to visit, what fields to
// enter, and a typed result the user fills in manually. No parcel ID, tax
// assessment, or other value is fabricated — data is always user-entered.

export interface PropertyLookupResult {
  address: string;
  county: string;
  source: "county_gis";
  portalUrl: string;
  // Guidance text for the user.
  guidance: string;
  // Fields to look up manually. Values start empty.
  data: {
    taxAssessment?: string;
    parcelId?: string;
    yearBuilt?: string;
    lotSize?: string;
    ownerName?: string;
  };
}

export interface CountyGuidance {
  county: string;
  portalUrl: string;
  searchInstructions: string;
  fields: string[];
}

const COUNTIES: Record<string, CountyGuidance> = {
  Mecklenburg: {
    county: "Mecklenburg",
    portalUrl: "https://polaris3g.mecklenburgcountync.gov/",
    searchInstructions:
      "Open the portal, use the property search, and enter the street address (or parcel PIN). Note the tax assessment, parcel ID, year built, lot size, and owner from the public record.",
    fields: ["taxAssessment", "parcelId", "yearBuilt", "lotSize", "ownerName"],
  },
  Wake: {
    county: "Wake",
    portalUrl: "https://maps.wake.gov/imaps/",
    searchInstructions:
      "Open iMaps, search by address or PIN, and copy the tax assessment, parcel ID, year built, and lot size from the property record.",
    fields: ["taxAssessment", "parcelId", "yearBuilt", "lotSize", "ownerName"],
  },
  Durham: {
    county: "Durham",
    portalUrl: "https://maps.durhamnc.gov/",
    searchInstructions:
      "Open the Durham GIS map, search by address, and copy the tax assessment, parcel ID, year built, and lot size from the property record.",
    fields: ["taxAssessment", "parcelId", "yearBuilt", "lotSize", "ownerName"],
  },
  Guilford: {
    county: "Guilford",
    portalUrl: "https://gis.guilfordcountync.gov/",
    searchInstructions:
      "Open the Guilford County GIS portal, search by address, and copy the tax assessment, parcel ID, year built, and lot size from the property record.",
    fields: ["taxAssessment", "parcelId", "yearBuilt", "lotSize", "ownerName"],
  },
};

export function getCountyGuidance(county: string): CountyGuidance | null {
  return COUNTIES[county.trim()] ?? null;
}

export function listSupportedCounties(): string[] {
  return Object.keys(COUNTIES);
}

export async function lookupPropertyByAddress(
  address: string,
  county: string
): Promise<PropertyLookupResult | null> {
  const trimmedAddress = address.trim();
  const guidance = getCountyGuidance(county);
  if (!trimmedAddress || !guidance) return null;

  // No fabricated values. Data is intentionally empty; the user fills it in.
  return {
    address: trimmedAddress,
    county: guidance.county,
    source: "county_gis",
    portalUrl: guidance.portalUrl,
    guidance: guidance.searchInstructions,
    data: {},
  };
}
