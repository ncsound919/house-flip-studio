import { describe, it, expect } from "vitest";
import { parseNclbgcResponse } from "@/lib/contractorSources/nclbgc";

const activeFixtureHtml = `
<html>
  <body>
    <div class="license-result">
      <h1>License Search Result</h1>
      <div class="license-number">License Number: 12345</div>
      <div class="holder-name">ABC Construction Inc.</div>
      <div class="license-status">License Status: Active</div>
      <div class="classification">Classification: Building</div>
      <div class="status-detail">Current and Active - Unlimited Building</div>
    </div>
  </body>
</html>
`;

const throttledFixtureHtml = ``;

const inactiveFixtureHtml = `
<html><body>
  <div class="license-result">
    <div class="license-number">License Number: 99999</div>
    <div class="license-status">License Status: Expired</div>
  </div>
</body></html>
`;

describe("parseNclbgcResponse", () => {
  it("parses active license fixture", () => {
    const r = parseNclbgcResponse(activeFixtureHtml);
    expect(r.verified).toBe(true);
    // detail should be present for active
    expect(r.detail).toBeDefined();
  });

  it("returns { verified:false } on empty/throttled fixture", () => {
    expect(parseNclbgcResponse("").verified).toBe(false);
    expect(parseNclbgcResponse(throttledFixtureHtml).verified).toBe(false);
    // throttling / unavailable HTML also returns false
    expect(
      parseNclbgcResponse("<html><body>Too Many Requests - 429 throttled</body></html>").verified
    ).toBe(false);
  });

  it("returns verified:false on inactive/expired license", () => {
    const r = parseNclbgcResponse(inactiveFixtureHtml);
    expect(r.verified).toBe(false);
  });

  it("extracts licenseTier when classification is present", () => {
    const r = parseNclbgcResponse(activeFixtureHtml);
    expect(r.licenseTier).toBeDefined();
    expect(typeof r.licenseTier).toBe("string");
  });
});
