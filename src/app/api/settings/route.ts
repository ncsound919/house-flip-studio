import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { getOrgSettings, saveOrgSettings, type DeepPartial, type OrgSettings } from "@/lib/orgSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const settings = await getOrgSettings(orgId);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { orgId } = await requireOrgId();
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a settings patch object" }, { status: 400 });
    }
    const settings = await saveOrgSettings(orgId, body as unknown as DeepPartial<OrgSettings>);
    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const invalid = message.startsWith("Invalid settings patch");
    return NextResponse.json(
      { error: message },
      { status: invalid ? 400 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}