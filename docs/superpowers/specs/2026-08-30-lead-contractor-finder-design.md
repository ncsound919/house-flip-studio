# Lead & Contractor Finder — Design Spec

**Date:** 2026-08-30
**Status:** Approved
**Authors:** User + opencode (source: brainstorming, operator review)
**Source:** `docs/superpowers/specs` (approved via brainstorming)

---

## 1. Goal & Constraints

Make the NC House Flip Studio **active and useful for non-expert partners**. The
current app is a passive pipeline + trackers ("nothing to do but take notes").
The operator wants real **controls**: search, find, act.

**Chosen structure (Approach B):** keep the Kanban as the home page, bolt the
two finders on as **separate pages** with search-first layouts. The finders
supply one-click actions (score → add → verify → RFQ) so the app *does* the
work instead of asking the operator to remember it.

**Non-expert + autonomous framing:** "autonomous" = *guided + one-click
actions*, not unattended automation. The app watches what is missing or
profitable, surfaces a clear **Do this now** prompt on the result card, and
the action runs when the operator clicks.

**Honesty (operator override, non-negotiable):**

- No fabricated "verified" labels. Scraped data is always marked
  `source: county_gis | api (zillow) | manual` and surfaced with a
  persistent warning: *"Unverified — confirm before making financial
  decisions."*
- County GIS / tax records / nclbgc license lookups are **government public
  records** (defensible to fetch). Zillow (and similar portals) prohibit
  scraping in their ToS — the Zillow tab is labeled **"May break, ToS risk"**
  and results are never presented as stable or verified. If the scrape fails,
  the tab degrades to the same guided GIS flow. No silent fallbacks that
  look like success.
- No fake scores, no invented parcel IDs, no ledger entries that don't exist.

---

## 2. What Is Being Built (in one paragraph)

Two new search-style pages and a thin layer of one-click actions wired
through them and the existing deal detail/rehab/contractor surfaces:

- **`/leads` — Lead Finder.** A search bar (county + address/PIN), tabbed
  results from (a) the existing guided county GIS flow and (b) a server-side
  Zillow listing scrape. Results are cards with the same field set (address,
  price, sqft, beds/baths, year built, source badge). Each card has
  **Score lead** (deterministic underwriting on that parcel) and
  **Add to pipeline** (creates a deal in Kanban Lead).
- **`/contractors` — enhancement.** The existing directory stays, but opens in
  a **search-first** layout (prominent trade / license-number / parcel
  search at the top). New button per card: **Auto-verify license** (server
  lookup against `nclbgc.org` public licensing, updates the contractor's
  verification status in place). New button: **Generate RFQ** (drafts a
  request-for-quote email/text from the current deal's rehab scope + the
  contractor's trade).
- **One-click actions.** Score, add, verify, RFQ — all one tap, all
  deterministic except RFQ body text (LLM-assisted draft, user reviews before
  sending). Nothing auto-sends.

Tags/building blocks reused: `src/lib/underwriting.ts`,
`src/lib/countyGis.ts`, `src/lib/llm.ts`, `src/lib/types.ts`,
`@dnd-kit` Kanban, Supabase RLS, `@react-pdf/renderer` RFQ output, Playwright
E2E. New code lives beside them, not inside the old migrations except where
schema must extend.

Out of scope for this spec: scheduled background scraping/digest emails,
MLS Grid/Canopy licensing, e-notarization, CAD/3D, Stripe billing.

---

## 3. Architecture & Boundaries

```
/leads            → Lead Finder page (client, search-first)
  ├─ LeadSearchBar (county + address/PIN, trigger → /api/lead-search)
  ├─ LeadResults   (cards, source badge, Score / Add buttons)
  └─ LeadScoreSheet (underwriting result sheet, same math as DealDetail)

  /api/lead-search        → orchestrator
    ├─ provider: county_gis (existing, guided)  → CountyGuidance + PropertyLookupResult
    └─ provider: zillow   (new)                 → fetched HTML → parsed ListingCard[]

/contractors      → Contractor Finder (enhanced)
  ├─ ContractorSearch (trade + license query)
  ├─ ContractorList  (existing, now with Verify + RFQ per row)
  └─ Verification  → /api/contractors/verify-license (server checks nclbgc.org)

/api/contractors
  verify-license  → server lookup, no scraping theater, real status update

RFQ
  /api/contractors/generate-rfq/[itemId] or /api/rfq  → @react-pdf/renderer
     draft on click from a rehab item + contractor

One-click actions
  Score lead     → lib/underwriting.ts (client), deterministic, no LLM
  Add            → POST /api/deals (existing)
  Verify license → POST /api/contractors/verify-license
  Generate RFQ   → GET /api/.../rfq/pdf (existing PDF infra)
```

### Boundaries

- Each provider (county_gis, zillow) is isolated behind one interface:
  `ListingSource { id, label, disclaimer, fetch(params): Promise<ListingCard[]> }`.
  No provider knows about another. No caller knows who parsed HTML vs who
  returned guidance.
- Citation / lookup table pattern already used for NC code citations is reused:
  curated data first, LLM never invents what can be looked up.
- Pricing/cost math is **always** `src/lib/underwriting.ts`, never LLM.

---

## 4. Lead Finder — Detailed Behavior

### 4.1 Search inputs (header)

- Inputs: county (Mecklenburg | Wake | Durham | Guilford — same list as
  `countyGis.ts`), address or parcel PIN (text).
- Single primary button: **Find leads**. Calls `POST /api/lead-search`
  with `{ county, address, sources: ["county_gis","zillow"] }`.

### 4.2 Sources

- **county_gis** — reuses `getCountyGuidance` / `lookupPropertyByAddress` from
  `src/lib/countyGis.ts`. Returns the same guidance object:
  portal URL, search instructions, empty `data` fields for manual entry. Rendered
  as a card with source badge `county_gis`.
- **zillow** — new `src/lib/listingSources/zillow.ts`, server-side only.
  Fetches the county's Zillow public listing page by county name + zip scope,
  parses the listing cards (title, price, beds/baths, sqft, photo thumbnail)
  with a DOM selector that is **isolated in one module** and labeled
  with the ToS caveat. Every Zillow result is:

  ```
  { address, city, price, sqft, beds, baths, year_built,
    source: "api", source_label: "zillow",
    disclaimer: "Scraped data — stale. Confirm before acting. Not verified." }
  ```

  If the fetch or selector fails, the tab renders the county's
  guidance fallback. No fake rows are invented.

### 4.3 Result shape

Canonical upstream of both providers:

```ts
type ListingCard = {
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
};
```

### 4.4 Cards & actions

Each card renders: address, city/state, price, sqft, beds/baths, year built
(where available), source badge (color-coded). Actions, left-to-right:

1. **Score lead** — fills the `LeadScoreSheet` from the card's fields.
   The sheet is a compact underwriting calculator (same inputs/outputs as
   `UnderwritingForm`) pre-filled from the card and the property's known
   fields. Outputs shown live: 70% MAO, final price, all-in costs, profit,
   ROI, cash-on-cash. Deterministic. Button: **Score**.
2. **Add to pipeline** — opens the existing `AddDealModal` pre-filled with the
   card's data (county inferred), drops to Kanban Lead on confirm.

Both buttons degrade cleanly: if the source row is missing price or sqft, the
score sheet says *enter missing field* instead of fabricating.

---

## 5. Contractor Finder — Detailed Behavior (enhancement to `/contractors`)

### 5.1 Search-first layout

The existing `/contractors` page keeps its route. The search area moves to
the top (above filters) — trade dropdown + free text (name / license number)
+ a prominent **Verify all** control when a license number is present.

### 5.2 Auto-verify license

Button per card: **Verify license**.

Server route: `POST /api/contractors/verify-license`

```
POST { contractor_id }
→ fetch nclbgc.org public lookup for contractor.license_number
→ parse: license tier, active status (yes/no), workers-comp flag where exposed
→ update contractors.license_tier / notes / workers_comp_verified where clearly
  returned; otherwise leave untouched and return { verified: false, reason }
→ return { verified: boolean, detail, checked_at }
```

Parsing is isolated in `src/lib/contractorSources/nclbgc.ts`, server-side.
No scraping theater: if nclbgc throttles or changes markup, the response is
`{ verified:false, reason:"nclbgc unavailable, verify manually",
 checked_at }`. No silent green badge.

### 5.3 Generate RFQ (one-click draft)

Button per card: **Generate RFQ** (enabled when viewing from a deal's Rehab
context or when at least one rehab item is selected).

Flow:

1. Client sends `{ contractor_id, deal_id, rehab_item_ids?,
     include: ["scope","schedule","budget band","permit note"] }`
   to `POST /api/contractors/generate-rfq`.
2. Server (with Supabase org check) builds an RFQ draft:
   - rehab_items + comps + underwriting + property data for that deal
   - Contractor trade / license tier prefill
   - LLM draft (via existing `src/lib/llm.ts`) for the body text only
   - Deterministic fields (address, scope line items, budget band from
     rehab totals) are never LLM-invented.
3. Returns `{ draft_text, draft_pdf_url? }`.
4. UI shows the draft. The operator **edits then sends** (copy, or open mailto if
   email exists). Nothing auto-emails.

Output format: markdown draft + optional PDF (via `@react-pdf/renderer`,
existing generator, not a new PDF stack).

---

## 6. One-Click Actions — Where They Live

| Action | Lives on | Calls | Deterministic? |
|---|---|---|---|
| Score lead | `/leads` card → `LeadScoreSheet` | `lib/underwriting.ts` | Yes |
| Add to pipeline | `/leads` card | `POST /api/deals` (existing) | Yes |
| Verify contractor | `/contractors` card, also reachable from deal Rehab item contractor chip | `POST /api/contractors/verify-license` | Lookup |
| Generate RFQ | `/contractors` (from deal context) or deal Rehab item's contractor chip | `POST /api/contractors/generate-rfq` | Draft body is LLM, fields are deterministic |

Every action is a real button with a loading state, an empty-state message,
and a failure path that says what failed and what to do next. No cosmetic
spinner that masks a no-op.

---

## 7. Data & Migrations

- No new tables.
- `contractors` extended only if needed: one new column `verified_at` (timestamp of
  last `verify-license` check). Migration:

  ```sql
  alter table public.contractors
    add column if not exists
    verified_at timestamptz;
  ```

- RLS: the same org-member policies from `002_rls_policies.sql` cover
  `contractors.verified_at`.

---

## 8. API Shape (additive, additive-only)

```
POST /api/lead-search
  { county, address?, sources: ("county_gis"|"zillow")[] }
  → { results: ListingCard[], warnings: string[] }

POST /api/contractors/verify-license
  { contractor_id }
  → { verified: boolean, detail?: string, checked_at: string }

POST /api/contractors/generate-rfq
  { contractor_id, deal_id, rehab_item_ids?: string[], include?: string[] }
  → { draft_text: string, draft_pdf_url?: string }
```

All routes share the same org check (`requireOrgId()`) and the same
honesty contract: no imported row is ever tagged `county_gis` or `verified`.

---

## 9. UI Notes

- **Route map unchanged except:** new route `/leads`, existing `/contractors`
  gains the verification + RFQ controls. Home (`/`) stays as the Kanban (per
  Approach B approval).
- **Navbar:** add `Leads` entry between Deals and Contractors. No route group
  change — just a link.
- **Design follows the current stack:** Tailwind v4, lucide-react, motion where
  already used, no new design system. Results are cards, not a heavy grid.
- **Accessibility:** the ContractForm label-wrapping fix noted in the prior
  session (label without `for`/`id`) is addressed as part of the contractor
  verification panel (labels use explicit `htmlFor`/`id` for selects/inputs).

---

## 10. Risk & Honesty

| Risk | Resolution |
|---|---|
| Zillow ToS / scrape fragility | Isolated `zillow.ts` selector module; verified_fail → guidance fallback; UI banner and source badge always visible; no retries that look like a bot |
| nclbgc lookup throttling | Fail open (`verified:false, reason`); no green badge on uncertainty |
| Fake RFQ costs | Budget band is a deterministic range from rehab totals; nothing LLM-invented |
| Auto-v verification theater | License tier only set when clearly returned by the lookup; otherwise left null with timestamped note |

---

## 11. Testing

- **Unit:** `underwriting.ts` (already T, math-only), `ncCodeCitations.ts` already T;
  new: `zillow source parser` unit (fixture HTML → `ListingCard[]`, fixture tests
  that an empty fixture yields `[]` not invented rows), `nclbgc` parser unit (fixture
  response → {verified, detail}).
- **Integration:** `/api/lead-search` (mocked fetch for public listing page),
  `/api/contractors/verify-license` (mocked nclbgc), RFQ draft shape.
- **E2E (Playwright):** `Lead Finder → Score → Add to pipeline` (uses the local
  county GIS path), `Contractor Finder → Verify` (mocked nclbgc, asserts no
  silent green badge), `Generate RFQ` (draft text shape, not auto-send).

E2E is the operator's proof the controls are real, not chrome: if there is no backing
call there is no button.

---

## 12. Implementation Order (for the next plan)

1. **Lead Finder** — `listingSources/` + `/api/lead-search` + `/leads`
2. **Contractor verification** — `contractorSources/nclbgc` + verify route + button
3. **RFQ draft** — RFQ route + button from contractor/rehab context
4. **Navbar + wiring** — link the two new surfaces, wire one-click actions end-to-end

No scheduled tasks, no PWA changes, no standalone-binary work in this slice.

---

## 13. Out of Scope for This Spec

- Daily digest email, cron scraping, background jobs (that's Approach C — deferred)
- MLS Grid / Canopy data-feed integration
- CAD/3D, Stripe/billing, change-to-external-Supabase auth modes
- Touching `supabase/migrations/001`–`003` except the `verified_at` addition above

All spec requirements above are covered by sections 4–8. Nothing in section 4 invents data.

