// Agent types — shared contracts for the autonomous flip operator.
//
// The agent is a scheduled, deterministic orchestrator. It reads real DB state,
// plans what to do across every deal, and executes only non-money actions
// autonomously. Money actions (advance to Offer Made / Under Contract / Rehab,
// send RFQ, etc.) are recorded as PENDING_APPROVAL and executed only when the
// operator approves. Everything is logged to agent_runs + agent_actions so
// "autonomous" is documented, not opaque.

export type AgentRunTrigger = "scheduled" | "manual";

export type AgentRunStatus = "completed" | "failed" | "partial";

export type AgentActionKind =
  | "hunt_leads" // ran the lead hunt and ingested new leads
  | "arv_estimate" // wrote ARV estimate to a deal (non-money)
  | "underwrite" // computed underwriting for a deal (non-money)
  | "advance_stage" // stage move — money ones require approval
  | "generate_scope" // drafted rehab scope (LLM, non-money, reviewable)
  | "generate_document" // generated a document (non-money)
  | "chase_document" // emailed/marked a follow-up (non-money)
  | "draft_rfq" // drafted RFQ (non-money, no send)
  | "verify_contractor" // license verification (non-money)
  | "send_rfq" // MONEY GATE — requires approval
  | "send_offer" // MONEY GATE — requires approval
  | "start_rehab" // MONEY GATE — requires approval
  | "info"; // diagnostic / skipped / blocked

export type AgentActionStatus = "done" | "skipped" | "blocked" | "failed" | "pending_approval" | "approved";

export interface AgentAction {
  id: string;
  run_id: string;
  org_id: string;
  deal_id: string | null;
  kind: AgentActionKind;
  status: AgentActionStatus;
  title: string;
  detail: string;
  requires_approval: boolean;
  approved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentRunSummary {
  runs: number;
  actions: number;
  byKind: Record<string, number>;
  byStatus: Record<string, number>;
  moneyGatesAwaiting: number;
  lastRunAt: string | null;
}

// Approval: the "execute now" payload recorded on a money-gate action.
// When the operator approves, the runner re-applies this.
export interface ApprovalPayload {
  dealId: string;
  toStage?: string; // advance_stage payload
  emailTo?: string; // send_rfq / chase payload
  emailSubject?: string;
  emailBody?: string;
  documentId?: string;
}
