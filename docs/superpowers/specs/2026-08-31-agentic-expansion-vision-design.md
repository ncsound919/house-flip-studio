# House Flip — Agentic Expansion Vision (4-Phase)

Date: 2026-08-31
Status: Draft (operator review pending)

## Goal

Expand NC House Flip Studio from a deal tracker + scheduled agent into a deeper
research system and a more complete agentic operator for the business: richer
lead research with real public/paid data, comps-derived ARV, near-full autonomy
within operator-configured guardrails, and deal/portfolio-level finance + KPIs.

Approach: **A — extend in-place**. Keep the Next.js app, Supabase, planner/runner
architecture, audit log, and money-gate flow. Add modules per phase. No rewrite
of the working core.

## Guiding principles (inherited)

- **HONESTY**: never claim work was done that wasn't. Heuristic values stay
  labeled heuristic. Real numbers only from real DB rows / real API responses.
  Every source fetch is recorded per-source with status; failures are `error`,
  never fabricated. Auto-approvals log the rule + evidence that fired.
- **DETERMINISM FIRST**: all math deterministic. LLM is embellishment only,
  never the source of truth for money numbers.
- **AUDITABLE**: everything lands in `agent_runs` / `agent_actions` / `agent_jobs`.
- **GUARDRAILED AUTONOMY**: agent auto-approves money actions within configured
  limits; everything over a limit or in new territory escalates to the operator.
  Kill-switches per category.

## Architecture map

```
src/lib/
  research/          NEW  — data-source adapters + per-lead dossiers (Phase 1)
    sources/               countyTax, deeds, liens, permits, rentcast, courts
    dossier.ts            compileDossier(dealId, settings) → dossiers row
  guardrails/        NEW  — limits → auto-approve | escalate (engine built P1, live P3)
    limits.ts             zod schema for limits in org_settings (agent.limits)
    evaluate.ts           canAutoApprove(action, limits, state)
  agent/             EXISTING — planner.ts + runner.ts extended
    runner.ts             gains: dossier dispatch, guardrail evaluation, job queue
  finance/           NEW  — deal P&L, draws, financing (Phase 4)
  arvEstimate.ts     EXTEND — accepts real comps (Phase 2)
  leadHunt.ts        EXTEND — new research signals: absentee, tax-delinquent,
                               multi-parcel, out-of-state (Phase 1)
```

New DB tables (one migration per phase): `dossiers`, `research_sources`,
`payments`, `finance`, `agent_jobs`. Guardrail limits fold into the existing
`org_settings` JSON (`agent.limits`), consistent with the current settings
pattern — no new settings table. Existing tables (`agent_runs`,
`agent_actions`, `deals`, `comps`, `underwriting`, `rfq_drafts`, `documents`,
`contractors`, `rehab_items`, `org_settings`) remain the spine.

## Guardrail engine (core of near-full autonomy)

Every action the runner plans passes `guardrails/evaluate.ts`:

1. Non-money → execute (as today).
2. Money action **within a configured limit** → **auto-approve**, logged with
   rule + evidence. New `agent_actions` status `auto_approved`.
3. Money action **over a limit or new territory** → `pending_approval` (today's
   behavior).
4. Over-cap / over-spend → `blocked` + `info` action explaining why.
5. Kill-switches per category; global `agent.enabled` unchanged.

Defaults = current conservative behavior. Operator flips limits on in settings.

## Phase 1 — Research depth

### (a) Richer hunt-time signals (leadHunt.ts / listingSources)

Derive from county tax records:
- **Absentee owner**: owner mailing address ≠ property address.
- **Tax-delinquent**: county tax lien/delinquency flag where available.
- **Multi-parcel owner**: same owner across ≥3 parcels in feed.
- **Out-of-state owner**: keep (already partial).
- New signals feed `leadScoring` flags + `notes`.

### (b) Research dossiers

- `dossiers` table (`deal_id`, `sources` jsonb, `compiled_at`).
- `research/dossier.ts` `compileDossier(dealId, settings)` pulls real data:
  - County tax & deed records (free, NC public) — ownership history, last sale
    price/date, assessed value.
  - Liens — county/UCC + court records where free feeds exist.
  - Code violations & permits — county permit portals with public
    API/ArcGIS endpoints (per-county, best-effort, labeled).
  - Rentcast (paid) — owner/occupancy, property details, sales comps cross-check.
  - Foreclosure notices — NC legal-notice/public feeds where available.
- Each source result stored with `source` + `fetched_at`; failures `error` per
  source. Triggered automatically by the agent for hot/warm leads + on-demand UI.

### (c) Guardrail foundation (engine skeleton)

`guardrails/limits.ts` zod schema + `evaluate.ts` wired into runner as a
pass-through that auto-approves nothing money-related yet (matches today) but
logs evaluations. Phase 3 flips limits on. No behavior change.

Honest constraint: lien/code-violation data is per-county and inconsistent in NC;
dossiers carry what each county exposes, labeled. Absentee/tax-delinquent/
multi-parcel reliable from tax data.

## Phase 2 — Real comps & ARV

### Comps acquisition

- `research/sources/deeds.ts`: county deed-transfer records (free) — actual sale
  price + date for target property (prior sale) and neighborhood comps (similar
  sqft band, same/adjacent tract, recent 6–12 months).
- Rentcast sales comps (paid) as fallback/enrichment + owner/occupancy cross-check.
- `comps` table extended: `source`, `sale_date`, `distance/score`. Planner already
  reads comps.

### ARV logic (arvEstimate.ts)

- ≥2 real comps → ARV = median sale price (or $/sqft × median where supported),
  source `"comps"`, confidence medium/high by count + recency.
- <2 comps → existing heuristic, labeled.
- Planner `info` ("add comps") stays; agent can now fetch comps itself.

### Underwriting

Math unchanged; feed comps-based ARV. 70% rule + max offer become trustworthy
when ARV is real.

Honest boundaries: comps are sold prices from deeds/API, never scraped listings
(Zillow scraping already deprecated). Where neither deeds nor Rentcast exist,
ARV stays heuristic and labeled.

## Phase 3 — Agent automation breadth + guardrails live

### Guardrails go live

Limits in `org_settings` (zod):
- `autoSendOffers: { enabled, maxOfferAmount, dailyCap }`
- `autoSendRfq: { enabled, dailyCap }`
- `autoSpendRehab: { enabled, monthlyCap }`
- `autoChase: { enabled, dailyCap }`
- `autoScheduleInspections: { enabled, maxPerDay }`

Auto-approvals → status `auto_approved` (rule + evidence + amount + timestamp).
Escalation → `pending_approval`. Over-cap → `blocked` + info.

### New action kinds

- `fetch_dossier` — build dossiers for hot/warm leads (research, not money).
- `fetch_comps` — pull real comps pre-underwriting when ARV heuristic.
- `schedule_inspection` — propose inspection windows; auto-schedule within caps.
- `record_payment` / `approve_payment` — rehab spend ledger; auto-approve under
  `autoSpendRehab`, escalate above.
- `recommend_list_price` — comps-based list price recommendation (not money;
  listing approval stays).
- `predict_exit` — timeline + projected proceeds vs carrying costs (informational).

### Post-contract depth

Extends `planForRehab`: permit tracking per county, schedule tracking,
payment/draw ledger per deal. Existing doc-chase + RFQ flows continue.

### Job queue

`agent_jobs` table processed by cron; research/comps fetches are async so the
30s route budget isn't blown. Planner emits intent; queue executes.

## Phase 4 — Business operations & KPIs

### Deal-level P&L (finance/ module, `finance` + `payments` tables)

- Costs: actual rehab spend (draws), acquisition, holding (real months), financing
  interest, selling costs — vs `underwriting` projections.
- Realized P&L from Closed deals; projected P&L for open deals, labeled.

### Financing & draws

- Lender, draw amounts, interest accrual (settings: rate, points, months).
- Draw approvals ride the guardrail engine (`autoSpendRehab` / manual).

### Portfolio KPIs (dashboard + CommandCenter "Business pulse")

- Cash flow: closes vs draws/payments by month (real ledger).
- Pipeline value: sum projected profit across open deals.
- Cycle time: Lead→Closed median; dwell per stage.
- Hit rate: offers → closed conversion.
- ROI/ROE: realized return on invested capital per deal + portfolio.
- Agent telemetry: by-kind success, auto-approved vs escalated money actions.

Honesty: realized figures only from Closed deals with actuals; anything else
labeled projected/heuristic.

## Testing

Per-phase unit tests:
- P1: dossier compilation (mocked fetch), new signal derivation, guardrail
  evaluate pass-through.
- P2: deeds source parsing (mocked fetch), comps ARV, underwriting feed.
- P3: guardrail evaluate (auto/escalate/block), new action kinds, job queue.
- P4: P&L math (realized vs projected), draw ledger, dashboard aggregation.

Update affected tests for signature changes. Keep all existing tests green.

## Out of scope

- MLS listing data without a broker relationship.
- Skip-tracing / owner phone+email enrichment (paid; would need explicit budget).
- Multi-user RBAC beyond current owner model.
- External alerting (email/SMS push) beyond existing chase emails.
- Statewide automated foreclosure feed where no free county feed exists.