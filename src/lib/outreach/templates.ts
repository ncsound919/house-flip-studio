// Outreach message templates — DETERMINISTIC personalization from real county
// data (owner name, address, assessed value). No LLM in the core path: the
// operator edits before sending. LLM polish is a separate, optional embellisher.

export interface OutreachContext {
  owner?: string | null;
  address: string;
  assessedValue?: number | null;
  signature: string; // operator name / company line
  phone?: string | null;
}

const money = (n: number | null | undefined) =>
  n == null
    ? ""
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function ownerName(owner?: string | null): string {
  if (!owner) return "Homeowner";
  // "GARNER, LYNN G & PAUL F TRUSTEE" → "the GARNER family" (keep simple, no guessing of gender)
  const lastName = owner.split(",")[0]?.trim();
  return lastName ? `the ${lastName} family` : "Homeowner";
}

export function buildOfferEmail(ctx: OutreachContext): { subject: string; body: string } {
  const name = ownerName(ctx.owner);
  const subject = `Offer to purchase ${ctx.address} — quick cash, no fees`;
  const body = [
    `Hello ${name},`,
    ``,
    `I'm reaching out about your property at ${ctx.address}. I buy homes directly — no agents, no repairs, no fees on your side, and I can close on your timeline.`,
    ctx.assessedValue != null
      ? `\nI've reviewed the public tax record for this property (assessed value ${money(ctx.assessedValue)}).`
      : ``,
    `\nIf selling this property is something you'd consider, I'd love to talk. I respond quickly, and there's no obligation to accept.`,
    ``,
    `Best,`,
    ctx.signature,
    ctx.phone ? ctx.phone : "",
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");
  return { subject, body };
}

export function buildFollowUpEmail(
  ctx: OutreachContext,
  sequenceNumber: number
): { subject: string; body: string } {
  const name = ownerName(ctx.owner);
  const subject = sequenceNumber === 1 ? `Re: ${ctx.address}` : `One more note on ${ctx.address}`;
  const body = [
    `Hello ${name},`,
    ``,
    `I wanted to follow up on my note about ${ctx.address}. My offer to purchase the property directly — cash, no fees, close on your timeline — still stands.`,
    ``,
    `If now isn't the right time, just say so and I'll leave you alone. If you'd like to talk, the fastest way to reach me is below.`,
    ``,
    `Best,`,
    ctx.signature,
    ctx.phone ? ctx.phone : "",
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");
  return { subject, body };
}
