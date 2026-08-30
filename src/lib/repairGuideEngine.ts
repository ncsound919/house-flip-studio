import { z } from "zod";
import { generate } from "@/lib/llm";
import { getCitationForTrade } from "@/lib/ncCodeCitations";

export interface PropertyDetails {
  address?: string;
  yearBuilt?: number;
  sqft?: number;
}

export const repairGuideSchema = z.object({
  title: z.string(),
  trade: z.string(),
  problem_diagnosis: z.string(),
  root_causes: z.array(z.string()),
  risk_factors: z.array(z.string()),
  nc_code_citations: z.array(
    z.object({
      section: z.string(),
      citation_verified: z.boolean(),
    })
  ),
  permit_required: z.boolean(),
  permit_type: z.string(),
  diy_feasibility: z.enum([
    "DIY-Friendly",
    "Handyman Feasible",
    "Licensed Trade Required",
    "NC GC Required",
  ]),
  estimated_labor_hours: z.number(),
  estimated_material_cost: z.number(),
  estimated_labor_cost: z.number(),
  total_estimated_cost: z.number(),
  required_tools: z.array(
    z.object({ name: z.string(), category: z.string(), approximate_cost: z.number() })
  ),
  required_materials: z.array(
    z.object({ name: z.string(), quantity: z.string(), unit_cost: z.number() })
  ),
  safety_ppe: z.array(z.string()),
  critical_pitfalls: z.array(z.string()),
  pro_tips: z.array(z.string()),
  execution_phases: z.array(
    z.object({
      phase_number: z.number(),
      phase_name: z.string(),
      description: z.string(),
      steps: z.array(
        z.object({
          step_number: z.number(),
          title: z.string(),
          instruction: z.string(),
          tolerance_metric: z.string().optional(),
          inspection_gate: z.boolean(),
        })
      ),
    })
  ),
  disclaimer: z
    .string()
    .default(
      "AI-generated draft. Verify all information before use. NC code citations should be confirmed against current NC Residential Code."
    ),
});

export type RepairGuide = z.infer<typeof repairGuideSchema>;

export const REPAIR_TRADES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "Structural",
  "Roofing",
  "General",
] as const;

export const ROOM_ZONES = [
  "Kitchen",
  "Bathroom",
  "Living Room",
  "Bedroom",
  "Hallway",
  "Basement",
  "Attic",
  "Exterior",
  "Roof",
] as const;

export const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"] as const;

/**
 * Generate a structured repair guide via the LLM.
 *
 * NC code citations are cross-checked against the curated lookup table
 * (src/lib/ncCodeCitations.ts). Citations not found in that table are flagged
 * `citation_verified: false` — they are NOT assumed to be real.
 */
export async function generateRepairGuide(params: {
  property: PropertyDetails;
  task: string;
  trade: string;
  roomZone: string;
  severity: string;
}): Promise<RepairGuide> {
  const { property, task, trade, roomZone, severity } = params;

  const curated = getCitationForTrade(trade);
  const curatedSections = curated.map((c) => c.section);

  const systemPrompt = [
    "You are a residential remodeling estimator for North Carolina houses.",
    "You produce step-by-step repair guides with cost estimates.",
    "Use only the following pre-verified NC code citations (from the curated lookup table):",
    curatedSections.length
      ? curatedSections.map((s) => `- ${s}`).join("\n")
      : "- (none available for this trade; leave citations empty)",
    "Do NOT invent or guess code sections. If a citation is not in the curated list, omit it.",
    "Return ONLY valid JSON matching the requested structure.",
  ].join("\n");

  const prompt = [
    `Property: ${property.address || "Not specified"}`,
    property.yearBuilt ? `Year built: ${property.yearBuilt}` : "",
    property.sqft ? `Sqft: ${property.sqft}` : "",
    `Task/problem: ${task}`,
    `Trade: ${trade}`,
    `Room/zone: ${roomZone}`,
    `Severity: ${severity}`,
    "",
    "Produce the repair guide JSON. For nc_code_citations, you may reference only the curated sections provided.",
    "Provide estimated_labor_hours, estimated_material_cost, estimated_labor_cost, and total_estimated_cost as numbers.",
    "Provide required_tools with name, category, and approximate_cost.",
    "Provide required_materials with name, quantity, and unit_cost.",
    "Provide execution_phases with numbered steps, each with instruction, optional tolerance_metric, and inspection_gate.",
  ].filter(Boolean).join("\n");

  const raw = await generate({
    prompt,
    system: systemPrompt,
    outputSchema: repairGuideSchema,
  });

  // Parse + validate the LLM's JSON output.
  let parsed: unknown;
  try {
    const trimmed = raw.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("LLM returned invalid JSON for repair guide");
  }

  const guide = repairGuideSchema.parse(parsed);

  // Cross-check citations against the curated table.
  guide.nc_code_citations = guide.nc_code_citations.map((c) => ({
    ...c,
    citation_verified: curatedSections.some((s) =>
      s.toLowerCase() === c.section.toLowerCase() ||
      s.toLowerCase().startsWith(c.section.toLowerCase())
    ),
  }));

  // Total cost should be internally consistent; recompute if LLM was off.
  guide.total_estimated_cost =
    Math.round(
      (guide.estimated_material_cost + guide.estimated_labor_cost) * 100
    ) / 100;

  return guide;
}
