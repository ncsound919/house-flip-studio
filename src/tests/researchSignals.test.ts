import { describe, it, expect } from "vitest";
import { mapParcel } from "../lib/listingSources/countyParcels";

describe("county parcel research signals", () => {
  it("flags multi-parcel owner from ownerCount >= 3", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "PO Box 5", mstate: "NC", ownname: "SMITH JOHN", parno: "123", structyear: "1975", parval: "80000", ownerCount: 3 });
    expect(card.motivation?.multiParcelOwner).toBe(true);
  });

  it("flags tax delinquent when taxDelinquent flag present", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "JONES", parno: "999", structyear: "1975", parval: "80000", taxDelinquent: "Y" });
    expect(card.motivation?.taxDelinquent).toBe(true);
  });

  it("does not flag when signals absent", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "BROWN", parno: "77", structyear: "1975", parval: "80000" });
    expect(card.motivation?.multiParcelOwner).toBe(false);
    expect(card.motivation?.taxDelinquent).toBe(false);
  });
});