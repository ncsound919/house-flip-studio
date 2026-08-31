import { describe, it, expect, vi } from "vitest";
import { hasPendingJob, enqueueJob } from "../lib/agent/queue";

vi.mock("@/lib/apiHelpers", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/apiHelpers";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

let rowCounter = 0;

function makeAdmin(store: Store) {
  const build = (table: string) => {
    let rows: Row[] = [...(store[table] ?? [])];
    let mode: "query" | "insert" = "query";
    let insertRows: Row[] = [];

    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (k: string, v: unknown) => {
      rows = rows.filter((r) => r[k] === v);
      return b;
    };
    b.in = (k: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[k]));
      return b;
    };
    b.single = async () => ({ data: mode === "insert" ? insertRows[0] ?? null : rows[0] ?? null, error: null });
    b.insert = (row: Row) => {
      const toAdd = { ...row, id: row.id ?? `row-${++rowCounter}` };
      store[table] = [...(store[table] ?? []), toAdd];
      insertRows = [toAdd];
      mode = "insert";
      return b;
    };
    b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const result = (async () =>
        mode === "insert" ? { data: insertRows, error: null } : { data: rows, error: null })();
      return result.then(resolve, reject);
    };
    return b;
  };
  return { from: (table: string) => build(table) };
}

describe("agent queue", () => {
  it("dedupes pending jobs of same kind+deal", async () => {
    const store: Store = {
      agent_jobs: [
        {
          id: "j1",
          org_id: "org1",
          deal_id: "d1",
          kind: "fetch_dossier",
          payload: {},
          status: "pending",
          attempts: 0,
          error: null,
          created_at: "2026-08-31T00:00:00Z",
        },
      ],
    };
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const exists = await hasPendingJob("org1", "fetch_dossier", "d1");
    expect(exists).toBe(true);
  });

  it("returns false when no pending job matches", async () => {
    const store: Store = { agent_jobs: [] };
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const exists = await hasPendingJob("org1", "fetch_comps", "d1");
    expect(exists).toBe(false);
  });

  it("enqueues a pending job row", async () => {
    const store: Store = { agent_jobs: [] };
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const res = await enqueueJob("org1", "fetch_dossier", "d1", { address: "1 Main St" });
    expect(res.ok).toBe(true);
    const job = store.agent_jobs[0];
    expect(job?.org_id).toBe("org1");
    expect(job?.kind).toBe("fetch_dossier");
    expect(job?.status).toBe("pending");
    expect((job?.payload as Record<string, unknown>).address).toBe("1 Main St");
  });
});