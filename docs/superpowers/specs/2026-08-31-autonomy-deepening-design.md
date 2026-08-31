# House Flip — Autonomy Deepening Design

Date: 2026-08-31
Status: Approved (operator)

## Goal

Turn NC House Flip Studio into a deeper autonomous operator for a single internal
business: configure the operator's strategy in-app instead of in code, make the
autonomous agent do real work (not theater), consume real comps where they exist,
and surface business KPIs + agent telemetry.

## Guiding principles (inherited from codebase)

- **HONESTY**: never claim work was done that wasn't. Money-gated actions stay
  gated. Heuristic values stay labeled heuristic. Verification only stamps on a
  real success.
- **DETERMINISM FIRST**: all math is deterministic. LLM output is embellishment
  only, never the source of truth for money numbers.
- **AUDITABLE**: everything the agent does lands in `agent_runs` / `agent_actions`.

## Tranche 1 — Operator settings layer (foundation)

### Schema (migration `006_org_settings_and_autonomy.sql`)

```sql
create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

Settings shape (zod, `src/lib/orgSettings.ts`), all with defaults matching today's
hardcoded values so existing behavior is preserved:

- `flipProfile.minAssessed` (30000), `flipProfile.maxAssessed` (150000)
- `flipProfile.statewide` (true), `flipProfile.counties` ([])
- `flipProfile.maxHuntPerRun` (200)
- `underwriting.rehabPerSqft` (40), `holdingMonths` (6), `downPaymentPct` (20),
  `interestRate` (10), `loanPoints` (0)
- `agent.enabled` (true), `agent.huntOnCycle` (true), `agent.maxHuntPerCycle` (100)
- `llm.generateScopes` (true)

### API + UI

- `GET /api/settings` (org-scoped), `PATCH /api/settings` (merge + upsert)
- `FlipProfileForm` client component on `/settings` page

### Wire-ins (all fall back to defaults if no row)

- `leadHunt.ts` — accepts settings; replaces `FLIP_PROFILE` constant as sole source
- `cron/hunt-leads`, `cron/agent`, `leads/hunt`, `lead-search` — load per-org settings
- `runner.applyUnderwrite` — uses `underwriting` settings
- `leadScoring` assessed-value tier bands — uses `flipProfile` min/max

## Tranche 2 — Autonomy core + honesty fixes

### 2a. Real contractor verification

- New `src/lib/contractorVerification.ts`:
  `verifyContractor(admin, orgId, contractorId)` → loads contractor, calls
  `verifyOnNclbgc`, updates `license_checked_at` on every attempt, `verified_at` +
  `license_tier` only on a real `verified:true`. Returns `{verified, detail, licenseTier}`.
- Migration: `contractors.license_checked_at timestamptz`
- `verify-license` route becomes thin (calls the shared lib).
- `runner.applyVerifyContractor` calls the lib; records `done` only on real verify,
  `failed` otherwise. Never stamps `verified_at` on failure.
- Planner: gate rechecks — plan `verify_contractor` only if `license_checked_at` is
  null/older than 24h (and not verified), or verified but stale >30d.

### 2b. Real RFQ drafting

- Extract `buildDeterministicRfq` (+ helpers) into `src/lib/rfqBuilder.ts`; the
  `generate-rfq` route reuses it.
- Migration: `rfq_drafts` table
  (`id, org_id, deal_id, contractor_id, rehab_item_ids jsonb, draft_text text,
  status 'draft'|'sent', created_at, sent_at`).
- Planner: for deals in Rehab with verified contractor(s) + rehab items + no
  existing draft → emit `draft_rfq` (no approval needed; draft-only).
- Runner `applyDraftRfq`: builds deterministic draft, persists to `rfq_drafts`,
  records `done`.

### 2c. Real statewide pagination + rotation

- `fetchCountyParcels` gains `offset` → ArcGIS `resultOffset`.
- `leadHunt.fetchStatewideParcels`: page until `maxTotal` or empty; rotate
  `orderByFields` deterministically by day (`parval` asc on even day-of-year,
  `saledate desc` on odd) so successive runs surface different properties.
  Hard cap on pages to respect the 30s route budget.

### 2d. LLM rehab scope generation

- New `src/lib/agent/scope.ts`: `generateScopeForDeal(deal, settings)` →
  deterministic scope seeds (from sqft/year) + LLM enrichment (only when
  `llm.generateScopes` and key present), always labeled by source.
- Planner: deals in Inspecting/Underwriting with no rehab items → emit
  `generate_scope` (kind exists, never wired).
- Runner `applyGenerateScope`: inserts `rehab_items` rows (status `estimated`).

## Tranche 3 — Real ARV via comps

- `estimateArv` accepts optional `comps`; if ≥2 comps, ARV = median sale price,
  source `"comps"`, confidence `"medium"`.
- Planner loads comps per deal from existing `comps` table and passes them in;
  metadata + `arv_method` distinguish `comps` vs heuristic.
- Honest boundary: no free automated comp feed exists. Planner emits an `info`
  action ("add comps to upgrade ARV") for Inspecting/Underwriting deals missing
  comps.

## Tranche 4 — Observability + KPIs

- `/api/dashboard` extended: per-stage dwell, projected-profit sum, ARV sum,
  hot/warm/cold lead counts, agent actions by kind/status, money-gates awaiting,
  last run status/time.
- CommandCenter: "Business pulse" section.
- `getAgentSummary`: per-kind success rate + top error messages.
- Money-gate pileup becomes a red flag; failed runs visible with manual retry in
  AgentPane. No external alerting infra is added (out of scope).

## Testing

- New unit tests: orgSettings defaults/merge, rfqBuilder, scope planning,
  comps ARV, pagination rotation, verification lib (mocked fetch).
- Update affected tests (agentPlanner, leadHunt, leadSearch) for settings-aware
  signatures.
- Keep all existing tests green.

## Out of scope

- External alerting (email/SMS push)
- Automated comp acquisition (no reliable free feed)
- Multi-user permissions beyond current owner model