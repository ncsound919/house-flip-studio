import { describe, it, expect, vi } from "vitest";
import { hasPendingJob, enqueueJob, processJobs } from "../lib/agent/queue";

vi.mock("@/lib/apiHelpers", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/research/dossier", () => ({
  compileDossier: vi.fn(),
}));

import { createAdminClient } from "@/lib/apiHelpers";
import { compileDossier } from "@/lib/research/dossier";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

let rowCounter = 0;

function makeAdmin(store: Store) {
  const build = (table: string) => {
    let rows: Row[] = [...(store[table] ?? [])];
    let mode: "query" | "insert" | "update" | "upsert" = "query";
    let insertRows: Row[] = [];
    let patch: Row = {};

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
    b.order = (col: string, opts?: { ascending?: boolean }) => {
      rows = [...rows].sort((a, z) => {
        const av = a[col] as string | number | null | undefined;
        const zv = z[col] as string | number | null | undefined;
        if (av == null && zv == null) return 0;
        if (av == null) return 1;
        if (zv == null) return -1;
        if (av < zv) return opts?.ascending === false ? 1 : -1;
        if (av > zv) return opts?.ascending === false ? -1 : 1;
        return 0;
      });
      return b;
    };
    b.limit = (n: number) => {
      rows = rows.slice(0, n);
      return b;
    };
    b.single = async () => ({
      data: mode === "insert" ? insertRows[0] ?? null : rows[0] ?? null,
      error: null,
    });
    b.insert = (row: Row | Row[]) => {
      const toAdd = (Array.isArray(row) ? row : [row]).map((r) => ({
        ...r,
        id: r.id ?? `row-${++rowCounter}`,
      }));
      store[table] = [...(store[table] ?? []), ...toAdd];
      insertRows = toAdd;
      mode = "insert";
      return b;
    };
    b.update = (p: Row) => {
      patch = p;
      mode = "update";
      return b;
    };
    b.upsert = (row: Row, opts?: { onConflict?: string }) => {
      const col = opts?.onConflict ?? "id";
      const arr = store[table] ?? [];
      const idx = arr.findIndex((r) => r[col] === row[col]);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
      else arr.push({ ...row });
      store[table] = arr;
      mode = "upsert";
      return b;
    };
    b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const result = (async () => {
        if (mode === "insert") return { data: insertRows, error: null };
        if (mode === "update") {
          for (const r of rows) Object.assign(r, patch);
          return { data: rows, error: null };
        }
        return { data: rows, error: null };
      })();
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

describe("agent queue — processJobs", () => {
  it("marks a fetch_dossier job done and upserts a dossier", async () => {
    const store: Store = {
      agent_jobs: [
        {
          id: "j1",
          org_id: "org1",
          deal_id: "d1",
          kind: "fetch_dossier",
          payload: { address: "1 Main St" },
          status: "pending",
          attempts: 0,
          error: null,
          created_at: "2026-08-31T00:00:00Z",
        },
      ],
    };
    vi.mocked(compileDossier).mockResolvedValue({
      dealId: "d1",
      sources: [{ source: "county_tax", status: "ok", fetchedAt: "x", data: {} }],
      compiledAt: "2026-08-31T01:00:00Z",
    });
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const res = await processJobs("org1", 5);

    expect(res.processed).toBe(1);
    expect(res.errors).toHaveLength(0);
    expect(store.agent_jobs.find((j) => j.id === "j1")?.status).toBe("done");
    expect(store.agent_jobs.find((j) => j.id === "j1")?.finished_at).toBeTruthy();
    expect(store.dossiers?.[0]?.deal_id).toBe("d1");
    expect((store.dossiers?.[0]?.sources as unknown[]).length).toBeGreaterThan(0);
  });

  it("marks a failed job and reports the error", async () => {
    const store: Store = {
      agent_jobs: [
        {
          id: "j1",
          org_id: "org1",
          deal_id: "d1",
          kind: "fetch_dossier",
          payload: { address: "1 Main St" },
          status: "pending",
          attempts: 0,
          error: null,
          created_at: "2026-08-31T00:00:00Z",
        },
      ],
    };
    vi.mocked(compileDossier).mockRejectedValue(new Error("source exploded"));
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);

    const res = await processJobs("org1", 5);

    expect(res.processed).toBe(0);
    expect(res.errors).toContain("source exploded");
    expect(store.agent_jobs.find((j) => j.id === "j1")?.status).toBe("failed");
    expect(store.agent_jobs.find((j) => j.id === "j1")?.error).toBe("source exploded");
  });
});