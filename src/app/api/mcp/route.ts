import { NextResponse } from "next/server";
import { callTool, listTools } from "@/lib/mcp";

// MCP (Model Context Protocol) endpoint for House Flip Studio.
//
// Exposes the lead-hunt surface as JSON-RPC 2.0 so an external orchestrator
// (deterministic-brain's mcp_client, Claude, Cursor, ...) can drive autonomous
// distressed-property sweeps and read the results back.
//
// Transport: HTTP POST with a JSON-RPC body (single object or batch array).
// This is a plain request/response transport; there is no long-lived SSE
// stream. Streaming transports are intentionally out of scope.
//
// Auth: guarded by MCP_SECRET (falls back to CRON_SECRET) when configured, the
// same convention as the scheduled lead hunt in /api/cron/hunt-leads. Callers
// present `Authorization: Bearer <secret>`.

const SERVER_INFO = { name: "house-flip-studio", version: "1.0.0" };
const SUPPORTED_PROTOCOL = "2024-11-05";

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;

function authorized(request: Request): boolean {
  const secret = process.env.MCP_SECRET || process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — local/dev mode
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

async function handleRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  // Notifications carry no id and expect no response.
  if (id === null && req.method?.startsWith("notifications/")) return null;

  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listTools() } };
    case "tools/call": {
      const name = typeof req.params?.name === "string" ? req.params.name : "";
      const args = req.params?.arguments ?? {};
      const outcome = await callTool(name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }) }],
          structuredContent: outcome.ok ? outcome.data : undefined,
          isError: !outcome.ok,
        },
      };
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not found: ${req.method}` } };
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: JSONRPC_PARSE_ERROR, message: "Parse error" } },
      { status: 400 }
    );
  }

  const batch = Array.isArray(payload);
  const requests = (batch ? payload : [payload]) as JsonRpcRequest[];

  if (requests.length === 0) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: JSONRPC_INVALID_REQUEST, message: "Empty batch" } },
      { status: 400 }
    );
  }

  // A non-object or a call missing `method` is not a valid JSON-RPC request.
  if (requests.some((r) => !r || typeof r !== "object" || typeof r.method !== "string")) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid Request" } },
      { status: 400 }
    );
  }

  const responses = (await Promise.all(requests.map(handleRpc))).filter(
    (r): r is JsonRpcResponse => r !== null
  );

  // Every message was a notification — no body to return.
  if (responses.length === 0) {
    return new NextResponse(null, { status: 202 });
  }

  return NextResponse.json(batch ? responses : responses[0]);
}

// Discovery / health probe so an orchestrator can confirm the endpoint and
// read the tool surface before wiring it in.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    server: SERVER_INFO,
    protocolVersion: SUPPORTED_PROTOCOL,
    transport: "http-jsonrpc",
    tools: listTools().map((t) => ({ name: t.name, description: t.description })),
  });
}
