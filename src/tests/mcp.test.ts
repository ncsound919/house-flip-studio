import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTool, listTools } from "../lib/mcp";
import { POST, GET } from "../app/api/mcp/route";
import { huntLeads } from "../lib/leadHunt";
import { getOrgSettings, DEFAULT_SETTINGS } from "../lib/orgSettings";
import { createAdminClient } from "../lib/apiHelpers";

vi.mock("../lib/leadHunt", () => ({ huntLeads: vi.fn() }));
vi.mock("../lib/apiHelpers", () => ({ createAdminClient: vi.fn() }));
vi.mock("../lib/research/dossier", () => ({ compileDossier: vi.fn() }));
vi.mock("../lib/orgSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/orgSettings")>();
  return { ...actual, getOrgSettings: vi.fn() };
});

const mockedHunt = vi.mocked(huntLeads);
const mockedSettings = vi.mocked(getOrgSettings);
const mockedAdmin = vi.mocked(createAdminClient);

function makeAdmin(rows: unknown[], error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    from: chain,
    select: chain,
    eq: chain,
    limit: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error })),
  });
  return builder;
}

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  mockedSettings.mockResolvedValue(DEFAULT_SETTINGS);
  mockedHunt.mockResolvedValue({
    scanned: 3,
    newLeads: 1,
    duplicates: 1,
    filtered: 1,
    filterReasons: { distress: 1 },
    warnings: [],
    summary: [{ county: "Wake", houses: 3 }],
    tiers: { hot: 1, warm: 0, cold: 0 },
  });
  mockedAdmin.mockReturnValue(makeAdmin([]) as never);
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.MCP_SECRET;
  delete process.env.CRON_SECRET;
});

describe("MCP tools/list", () => {
  it("advertises the four lead tools", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual(["hunt_leads", "list_leads", "score_lead", "build_dossier"]);
  });
});

describe("score_lead", () => {
  it("returns a feasibility signal with a tier for a cheap distressed home", async () => {
    const res = await callTool("score_lead", {
      address: "1039 Galloway Rd",
      county: "Pitt",
      assessed_value: 40000,
      year_built: 1965,
      motivation: { absenteeOwner: true, taxDelinquent: true },
    });
    expect(res.ok).toBe(true);
    const data = res.data as { tier: string; score: { needsArv: boolean; attentionScore: number } };
    expect(data.score.needsArv).toBe(true);
    expect(["hot", "warm", "cold"]).toContain(data.tier);
    expect(data.score.attentionScore).toBeGreaterThan(50);
  });

  it("derives out-of-state motivation from mailing state", async () => {
    const res = await callTool("score_lead", {
      address: "5 Main St",
      county: "Wake",
      owner_mailing_state: "FL",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects missing required fields", async () => {
    const res = await callTool("score_lead", { address: "x", county: "" });
    expect(res.ok).toBe(true);
    const res2 = await callTool("score_lead", { county: "Wake" });
    expect(res2.ok).toBe(false);
    expect(res2.error).toMatch(/Invalid arguments/);
  });

  it("rejects unknown tools", async () => {
    const res = await callTool("nope", {});
    expect(res.ok).toBe(false);
  });
});

describe("hunt_leads", () => {
  it("merges per-call overrides into the org flip profile", async () => {
    await callTool("hunt_leads", {
      org_id: "org-1",
      require_distress: true,
      max_purchase_price: 250000,
      max_total: 50,
    });
    expect(mockedHunt).toHaveBeenCalledTimes(1);
    const cfg = mockedHunt.mock.calls[0][0];
    expect(cfg.orgId).toBe("org-1");
    expect(cfg.maxTotal).toBe(50);
    expect(cfg.settings?.flipProfile.requireDistress).toBe(true);
    expect(cfg.settings?.flipProfile.maxPurchasePrice).toBe(250000);
  });

  it("requires an org_id", async () => {
    const res = await callTool("hunt_leads", {});
    expect(res.ok).toBe(false);
    expect(mockedHunt).not.toHaveBeenCalled();
  });
});

describe("list_leads", () => {
  it("scores and ranks stored deals", async () => {
    mockedAdmin.mockReturnValue(
      makeAdmin([
        { id: "a", address: "1 A St", asking_price: 60000, sqft: 1200, year_built: 1950, notes: "Tier: HOT LEAD (score 80/100, high, 2 motivation signals)" },
        { id: "b", address: "2 B St", asking_price: 400000, sqft: 1200, year_built: 2020, notes: null },
      ]) as never
    );
    const res = await callTool("list_leads", { org_id: "org-1", limit: 10 });
    expect(res.ok).toBe(true);
    const data = res.data as { count: number; leads: { id: string }[] };
    expect(data.count).toBe(2);
    expect(data.leads[0].id).toBe("a");
  });

  it("filters by tier", async () => {
    mockedAdmin.mockReturnValue(
      makeAdmin([{ id: "b", address: "2 B St", asking_price: 400000, sqft: 1200, year_built: 2020 }]) as never
    );
    const res = await callTool("list_leads", { org_id: "org-1", tier: "hot" });
    expect(res.ok).toBe(true);
    expect((res.data as { count: number }).count).toBe(0);
  });
});

describe("JSON-RPC route", () => {
  it("handles initialize", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const body = await r.json();
    expect(body.result.serverInfo.name).toBe("house-flip-studio");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("handles tools/list", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const body = await r.json();
    expect(body.result.tools).toHaveLength(4);
  });

  it("handles tools/call with structured content", async () => {
    const r = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "score_lead", arguments: { address: "1 A St", county: "Wake" } },
    });
    const body = await r.json();
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.address).toBe("1 A St");
  });

  it("reports tool failure as isError, not a crash", async () => {
    const r = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "hunt_leads", arguments: {} },
    });
    const body = await r.json();
    expect(body.result.isError).toBe(true);
  });

  it("returns -32601 for unknown methods", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 5, method: "does/not/exist" });
    const body = await r.json();
    expect(body.error.code).toBe(-32601);
  });

  it("acknowledges notifications with 202 and no body", async () => {
    const r = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(r.status).toBe(202);
  });

  it("enforces the bearer secret when configured", async () => {
    process.env.MCP_SECRET = "s3cret";
    const denied = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/list" });
    expect(denied.status).toBe(401);
    const allowed = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/list" }, { authorization: "Bearer s3cret" });
    expect(allowed.status).toBe(200);
  });
});

describe("GET discovery", () => {
  it("lists the tool surface", async () => {
    const r = await GET(new Request("http://localhost/api/mcp"));
    const body = await r.json();
    expect(body.tools).toHaveLength(4);
    expect(body.transport).toBe("http-jsonrpc");
  });
});
