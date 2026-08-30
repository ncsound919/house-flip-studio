import { NextResponse } from "next/server";
import { requireOrgId, createAdminClient } from "@/lib/apiHelpers";
import {
  generateRepairGuide,
  repairGuideSchema,
} from "@/lib/repairGuideEngine";

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const body = await request.json();

    const dealId = typeof body.deal_id === "string" ? body.deal_id : "";
    const task = typeof body.task === "string" ? body.task.trim() : "";
    const trade = typeof body.trade === "string" ? body.trade : "";
    const roomZone = typeof body.room_zone === "string" ? body.room_zone : "";
    const severity = typeof body.severity === "string" ? body.severity : "";
    const property =
      body.property && typeof body.property === "object" ? body.property : {};

    if (!task || !trade || !roomZone || !severity) {
      return NextResponse.json(
        { error: "task, trade, room_zone, and severity are required" },
        { status: 400 }
      );
    }

    const guide = await generateRepairGuide({
      property,
      task,
      trade,
      roomZone,
      severity,
    });

    const admin = createAdminClient();
    if (dealId) {
      await admin.from("ai_analyses").insert({
        deal_id: dealId,
        org_id: orgId,
        type: "repair_guide",
        input_summary: `${trade} — ${task}`,
        output_summary: guide.title,
        model_used: "llm",
      });
    }

    return NextResponse.json({
      guide,
      label: "AI-generated draft — verify all information before use.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
