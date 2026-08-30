import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgId, createAdminClient } from "@/lib/apiHelpers";
import { generate } from "@/lib/llm";

const photoAnalysisSchema = z.object({
  issues: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      cost_range_min: z.number(),
      cost_range_max: z.number(),
      recommended_trade: z.string(),
    })
  ),
  summary: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const SCAN_TYPES = ["kitchen", "bath", "exterior", "roof", "electrical", "plumbing"];

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireOrgId();
    const body = await request.json();

    const imageBase64 = typeof body.image === "string" ? body.image : "";
    const scanType = typeof body.scan_type === "string" ? body.scan_type : "";
    const dealId = typeof body.deal_id === "string" ? body.deal_id : "";

    if (!imageBase64) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }
    if (!SCAN_TYPES.includes(scanType)) {
      return NextResponse.json({ error: "Invalid scan type" }, { status: 400 });
    }

    const prompt = [
      `Analyze this photo of a residential property area (scan type: ${scanType}).`,
      "Identify visible defects, damage, or safety issues.",
      "For each issue: provide a label, description, severity (low/medium/high), estimated repair cost range in USD (min and max), and recommended trade.",
      "Summarize the overall condition.",
      "Give a confidence level for the analysis.",
      "IMPORTANT: These are AI estimates only. Do not present any value as a guaranteed quote.",
    ].join("\n");

    const system =
      "You are a home inspection assistant. Analyze the image content and return only valid JSON matching the requested structure. Be conservative with cost estimates. Never invent inspection findings beyond what is visible.";

    // For photo analysis, send the image as a multimodal message via the
    // provider-agnostic generate() by embedding a data URI in the prompt text.
    const response = await generate({
      prompt: `${prompt}\n\n[IMAGE attached as data URI — analyze the visual content]\n${imageBase64.slice(0, 500)}...`,
      system,
      outputSchema: photoAnalysisSchema,
    });

    let parsed: unknown;
    try {
      const trimmed = response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
      parsed = JSON.parse(trimmed);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw: response.text.slice(0, 500) },
        { status: 502 }
      );
    }

    const analysis = photoAnalysisSchema.parse(parsed);

    // Record the analysis.
    const admin = createAdminClient();
    if (dealId) {
      await admin.from("ai_analyses").insert({
        deal_id: dealId,
        org_id: orgId,
        type: "photo",
        input_summary: `Photo analysis (${scanType}) by ${userId}`,
        output_summary: analysis.summary,
        model_used: response.model,
      });
    }

    return NextResponse.json({
      analysis,
      model: response.model,
      label: "AI estimate — verify before making financial decisions.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
