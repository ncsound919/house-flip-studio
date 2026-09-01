import { describe, it, expect } from "vitest";
import { nextOutreachAction, type CadenceRecord } from "../lib/outreach/cadence";

const cfg = { initialFollowUpDays: 7, followUpDays: 14, maxFollowUps: 3 };

const sent = (over: Partial<CadenceRecord> & { kind: string; sent_at: string }): CadenceRecord => ({
  kind: over.kind,
  direction: over.direction ?? "outbound",
  status: over.status ?? "sent",
  response: over.response ?? "none",
  sent_at: over.sent_at,
});

describe("nextOutreachAction", () => {
  const NOW = "2026-09-01T00:00:00Z";

  it("proposes an initial offer for a never-contacted lead", () => {
    const d = nextOutreachAction([], NOW, cfg);
    expect(d.next).toBe("initial_offer");
  });

  it("waits inside the first offer window", () => {
    const d = nextOutreachAction([sent({ kind: "initial_offer", sent_at: "2026-08-28T00:00:00Z" })], NOW, cfg);
    expect(d.next).toBeNull();
  });

  it("follows up when the initial offer is unanswered past the interval", () => {
    const d = nextOutreachAction([sent({ kind: "initial_offer", sent_at: "2026-08-20T00:00:00Z" })], NOW, cfg);
    expect(d.next).toBe("follow_up");
    expect(d.reason).toBe("initial_offer_unanswered");
  });

  it("marks cold after maxFollowUps unanswered follow-ups", () => {
    const records = [
      sent({ kind: "initial_offer", sent_at: "2026-06-01T00:00:00Z" }),
      sent({ kind: "follow_up", sent_at: "2026-06-10T00:00:00Z" }),
      sent({ kind: "follow_up", sent_at: "2026-06-25T00:00:00Z" }),
      sent({ kind: "follow_up", sent_at: "2026-07-10T00:00:00Z" }),
    ];
    const d = nextOutreachAction(records, NOW, cfg);
    expect(d.next).toBe("mark_cold");
  });

  it("hands control to the operator on any inbound response", () => {
    const records = [
      sent({ kind: "initial_offer", sent_at: "2026-08-20T00:00:00Z" }),
      sent({ kind: "note", direction: "inbound", response: "counter", sent_at: "2026-08-25T00:00:00Z" }),
    ];
    const d = nextOutreachAction(records, NOW, cfg);
    expect(d.next).toBeNull();
    expect(d.reason).toBe("awaiting_operator");
  });

  it("ignores drafts and failures — only real sent rows drive the cadence", () => {
    const records = [sent({ kind: "initial_offer", status: "draft", sent_at: "2026-08-20T00:00:00Z" })];
    const d = nextOutreachAction(records, NOW, cfg);
    expect(d.next).toBe("initial_offer"); // still treated as never contacted
  });
});
