# Lead & Contractor Finder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two search-first finder pages (Leads + enhanced Contractors) with four one-click actions (Score, Add to pipeline, Verify license, Generate RFQ) so the app drives the workflow instead of storing notes.

**Architecture:** New provider modules (`src/lib/listingSources/*`, `src/lib/contractorSources/*`) behind one interface each; three additive API routes; two pages; reuse of `src/lib/underwriting.ts`, `src/lib/countyGis.ts`, `src/lib/llm.ts`, `@react-pdf/renderer`.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), React 19, Tailwind v4, @react-pdf/renderer, vitest, Playwright.

---

## File Structure

**Create:**
- `supabase/migrations/004_contractors_verified_at.sql` — adds `verified_at` column
- `src/lib/listingSources/types.ts` — `ListingCard`, `ListingSource` interfaces
- `src/lib/listingSources/zillow.ts` — Zillow HTML → ListingCard[] parser (server, isolated)
- `src/lib/listingSources/index.ts` — registry of available sources
- `src/lib/contractorSources/nclbgc.ts` — nclbgc.org markup → verification result
- `src/app/api/lead-search/route.ts` — orchestrator for county_gis + zillow
- `src/app/(app)/leads/page.tsx` — Lead Finder page
- `src/components/leads/LeadSearchBar.tsx` — county + PIN inputs
- `src/components/leads/LeadResults.tsx` — result cards with source badge
- `src/components/leads/LeadScoreSheet.tsx` — underwriting sheet pre-filled from a card
- `src/app/api/contractors/verify-license/route.ts` — nclbgc lookup + org-checked update
- `src/app/api/contractors/generate-rfq/route.ts` — draft RFQ from deal + contractor
- `src/components/rfq/RfqPreview.tsx` — draft text + copy/mailto + optional PDF link
- `src/tests/zillowParser.test.ts` — fixture HTML → ListingCard[]
- `src/tests/nclbgcParser.test.ts` — fixture markup → verification result
- `src/tests/leadSearch.test.ts` — /api/lead-search with mocked fetch
- `e2e/lead-finder.spec.ts` — E2E: find → score → add to pipeline

**Modify:**
- `src/app/(app)/layout.tsx` — add Leads link to navbar
- `src/components/contractors/ContractorList.tsx` — Verify + RFQ buttons per row
- `src/lib/types.ts` — add `verified_at` to Contractor if needed
- `SUPABASE_SETUP.md` — note new migration

---

### Task 1: Schema Migration — `verified_at`

**Files:**
- Create: `supabase/migrations/004_contractors_verified_at.sql`

- [ ] **Step 1: Create migration**

```sql
-- 004_contractors_verified_at.sql
alter table public.contractors
  add column if not exists verified_at timestamptz;
```

- [ ] **Step 2: Apply locally and verify**

Run: `supabase db reset` (or `supabase db push` if hosted)
Expected: migration 004 applies without error; `public.contractors` has `verified_at` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_contractors_verified_at.sql
git commit -m "feat: add verified_at to contractors for license check timestamp"
```

---

### Task 2: Listing Source Abstraction

**Files:**
- Create: `src/lib/listingSources/types.ts`
- Modify: `src/lib/types.ts` (add ListingCard if not already present)

- [ ] **Step 1: Create types**

```ts
// src/lib/listingSources/types.ts
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
  source_label: string; // "county_gis" | "zillow"
  disclaimer?: string;
}
export interface ListingSource {
  id: "county_gis" | "zillow";
  label: string;
  disclaimer: string;
  fetch(params: { county: string; address?: string }): Promise<ListingCard[]>;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS (types only, no runtime change).

- [ ] **Step 3: Commit**

```bash
git add src/lib/listingSources/types.ts
git commit -m "feat: add listing source abstraction for lead finder"
```

---

### Task 3: Zillow Parser + Unit Tests

**Files:**
- Create: `src/lib/listingSources/zillow.ts`
- Create: `src/tests/zillowParser.test.ts`
- Create fixtures: `src/tests/fixtures/zillowSample.html`, `src/tests/fixtures/zillowEmpty.html`

- [ ] **Step 1: Write failing tests**

```ts
// src/tests/zillowParser.test.ts
import { describe, it, expect } from "vitest";
import { parseZillowHtml } from "@/lib/listingSources/zillow";

describe("parseZillowHtml", () => {
  it("parses fixture with listings into ListingCard[]", async () => {
    const html = await Bun.file("src/tests/fixtures/zillowSample.html").text();
    const cards = parseZillowHtml(html, "Mecklenburg");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].source_label).toBe("zillow");
    expect(cards[0].source).toBe("api");
  });
  it("returns empty array on empty fixture (no fake rows)", async () => {
    const html = await Bun.file("src/tests/fixtures/zillowEmpty.html").text();
    const cards = parseZillowHtml(html, "Wake");
    expect(cards).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- zillowParser`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement parser**

```ts
// src/lib/listingSources/zillow.ts
import type { ListingCard } from "./types";
const disclaimer = "Scraped data — stale. Confirm before acting. Not verified.";
export function parseZillowHtml(html: string, county: string): ListingCard[] {
  // isolated DOM selector; one place to fix when markup changes
  // uses regex/DOMParser to find cards; returns [] on failure, never fake rows
  const doc = new DOMParser().parseFromString(html, "text/html");
  // ... parse .property-card-data etc. → ListingCard with disclaimer
}
export async function fetchZillow(params: { county: string; address?: string }): Promise<ListingCard[]> {
  try {
    const res = await fetch(`https://www.zillow.com/homes/for_sale/${encodeURIComponent(params.county)}-County-NC_desc/`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseZillowHtml(html, params.county);
  } catch { return []; }
}
```

Note: server-side only; never called from the client directly.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- zillowParser`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/listingSources/zillow.ts src/tests/zillowParser.test.ts src/tests/fixtures/zillow*.html
git commit -m "feat: add Zillow listing parser with fixture tests"
```

---

### Task 4: Lead-Search API Orchestrator

**Files:**
- Create: `src/app/api/lead-search/route.ts`
- Test: `src/tests/leadSearch.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
// src/tests/leadSearch.test.ts (integration, mocked fetch for zillow)
import { describe, it, expect, vi } from "vitest";
// mock global fetch for zillow HTML, assert county_gis path returns guidance fallback
```

Impl: call `/api/lead-search` handler directly with mocked global.fetch; assert `{ results, warnings }` shape, that county_gis returns a guidance-style card when no zillow rows, and that an all-empty scrape yields `results: []` + `warnings: ["zillow unavailable ..."]`.

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- leadSearch`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement route**

```ts
// src/app/api/lead-search/route.ts
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { fetchZillow } from "@/lib/listingSources/zillow";
import { getCountyGuidance } from "@/lib/countyGis";
export async function POST(req: Request) {
  await requireOrgId();
  const { county, address, sources } = await req.json();
  // ... call county_gis guidance + zillow fetch in parallel, merge, tag source/source_label/disclaimer
  return NextResponse.json({ results, warnings });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- leadSearch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/lead-search/route.ts src/tests/leadSearch.test.ts
git commit -m "feat: add lead-search API orchestrator with county_gis and zillow providers"
```

---

### Task 5: Lead Finder Page

**Files:**
- Create: `src/app/(app)/leads/page.tsx`
- Create: `src/components/leads/LeadSearchBar.tsx`
- Create: `src/components/leads/LeadResults.tsx`
- Create: `src/components/leads/LeadScoreSheet.tsx`

- [ ] **Step 1: Build LeadSearchBar**

Props: `county`, `address`, `onSearch`. Renders county select (Mecklenburg/Wake/Durham/Guilford) + address/PIN input + Find leads button. Calls `/api/lead-search`.

- [ ] **Step 2: Build LeadResults**

Props: `results: ListingCard[]`, `onScore(card)`, `onAdd(card)`. Cards: address, city, price, sqft, beds/baths, year built, photo thumbnail where present, source badge (zinc → manual, blue → county_gis, amber → zillow). Warning banner for `api` rows. Buttons: **Score** → sets selected card for LeadScoreSheet; **Add to pipeline** → POST `/api/deals` prefilled.

- [ ] **Step 3: Build LeadScoreSheet**

Props: `card: ListingCard | null`. Reuses `src/lib/underwriting.ts` deterministically (no LLM). Inputs pre-filled from card; outputs live: 70% MAO, final price, profit, ROI. If missing price/sqft, renders "enter missing field" placeholder.

- [ ] **Step 4: Wire page**

`src/app/(app)/leads/page.tsx` composes the three components, holds search state, shows empty state before first search.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS, new route `/leads` appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/leads/ src/components/leads/
git commit -m "feat: add Lead Finder page with search, results, and scoring"
```

---

### Task 6: nclbgc License Verification

**Files:**
- Create: `src/lib/contractorSources/nclbgc.ts`
- Create: `src/app/api/contractors/verify-license/route.ts`
- Create: `src/tests/nclbgcParser.test.ts`

- [ ] **Step 1: Write failing parser tests**

```ts
// src/tests/nclbgcParser.test.ts
import { parseNclbgcResponse } from "@/lib/contractorSources/nclbgc";
describe("parseNclbgcResponse", () => {
  it("parses active license fixture", () => { const r = parseNclbgcResponse(fixtureHtml); expect(r.verified).toBe(true); });
  it("returns { verified:false } on empty/throttled fixture", () => { expect(parseNclbgcResponse("").verified).toBe(false); });
});
```

- [ ] **Step 2: Implement parser + route**

```ts
// src/lib/contractorSources/nclbgc.ts (server only)
export function parseNclbgcResponse(html: string): { verified: boolean; detail?: string } { /* isolated selector */ }
export async function verifyOnNclbgc(licenseNumber: string) { /* fetch https://www.nclbgc.org/... */ }
// src/app/api/contractors/verify-license/route.ts
export async function POST(req: Request) {
  await requireOrgId();
  const { contractor_id } = await req.json();
  // ... fetch / parse via nclbgc.ts, update contractors.verified_at on success, return { verified, detail, checked_at }
}
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `npm test -- nclbgcParser` + integration for the route with mocked fetch.

- [ ] **Step 4: Commit**

```bash
git add src/lib/contractorSources/nclbgc.ts src/app/api/contractors/verify-license/ src/tests/nclbgcParser.test.ts
git commit -m "feat: add nclbgc license verification with parser tests"
```

---

### Task 7: Contractor Finder UI — Verify + RFQ Buttons

**Files:**
- Modify: `src/components/contractors/ContractorList.tsx`
- Modify: `src/app/(app)/contractors/page.tsx`

- [ ] **Step 1: Add Verify license button**

Per row: **Verify license** button calling `POST /api/contractors/verify-license` with loading state, success (green check + timestamp), failure (yellow warning + reason), disabled when no license_number.

- [ ] **Step 2: Add Generate RFQ button**

Enabled when at least a deal context exists (rehab item(s) present). Opens `RfqPreview` (Task 8). Button: **Generate RFQ**.

- [ ] **Step 3: Fix search-first layout**

Move the prominent search (trade + license text) to the top of the page above filters. No new route.

- [ ] **Step 4: Commit**

```bash
git add src/components/contractors/ContractorList.tsx src/app/\(app\)/contractors/page.tsx
git commit -m "feat: add Verify license and Generate RFQ buttons to contractor finder"
```

---

### Task 8: RFQ Draft Generation

**Files:**
- Create: `src/app/api/contractors/generate-rfq/route.ts`
- Create: `src/components/rfq/RfqPreview.tsx`

- [ ] **Step 1: Implement RFQ route**

```ts
export async function POST(req: Request) {
  await requireOrgId();
  const { contractor_id, deal_id, rehab_item_ids } = await req.json();
  // ... fetch contractor + deal + rehab_items with org check
  // LLM draft via src/lib/llm.ts for body text only
  // deterministic: address, scope line items, budget band (from rehab totals)
  // return { draft_text, draft_pdf_url }
}
```

- [ ] **Step 2: Build RfqPreview**

Props: `{ draft_text, draft_pdf_url?, onClose }`. Shows markdown draft, Copy button, `mailto:` link if contractor has email, PDF download link when available.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contractors/generate-rfq/ src/components/rfq/RfqPreview.tsx
git commit -m "feat: add RFQ draft generation with PDF via react-pdf"
```

---

### Task 9: Navbar + E2E

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `e2e/lead-finder.spec.ts`

- [ ] **Step 1: Add navbar link**

```ts
const navLinks = [
  { href: "/", label: "Deals" },
  { href: "/leads", label: "Leads" },
  { href: "/contractors", label: "Contractors" },
  { href: "/documents", label: "Documents" },
];
```

- [ ] **Step 2: Write E2E**

```ts
test("Lead Finder → Score → Add to pipeline", async ({ page }) => {
  // uses the county GIS path (local, no scrape needed)
  // search → see card → Score → see deterministic sheet → Add → deal in Kanban
});
test("Contractor Finder → Verify (no green on uncertainty)", async ({ page }) => {
  // mocked nclbgc, asserts no silent green badge when unavailable
});
test("Generate RFQ (draft shape, not auto-send)", async ({ page }) => {
  // creates deal + contractor + rehab item, clicks Generate RFQ, asserts draft_text shape
});
```

- [ ] **Step 3: Verify build + run E2E**

Run: `npm run build` + `npx playwright test e2e/lead-finder.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx e2e/lead-finder.spec.ts
git commit -m "feat: wire Leads nav and finder E2E"
```

---

## Dependencies

Order is strict for correctness:

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9`

---

## Spec Coverage Checklist

| Spec section | Task |
|---|---|
| Lead Finder (§4) | Tasks 2–5 |
| Zillow ToS-isolated provider (§4.2) | Tasks 2–3 |
| Contractor verification (§5.2) | Task 6 |
| RFQ draft (§5.3) | Task 8 |
| One-click actions (§6) | Tasks 5, 7, 8, 9 |
| Navbar (§9) | Task 9 |
| Migrations (§7) | Task 1 |
| Honesty guardrails (§10) | All tasks |
| Testing (§11) | Tasks 3, 4, 6, 9 |

---

## Notes for Agent

1. County GIS is already honest (guided manual entry) — do not add scraping there.
2. Zillow parsing lives in **one module only**. If it breaks, only that module changes.
3. All cost math is deterministic (`src/lib/underwriting.ts`).
4. Scraped rows are never `verified` and never `county_gis`.
5. No scheduled jobs in this slice.
