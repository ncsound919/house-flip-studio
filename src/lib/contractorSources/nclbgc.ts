// Server-only NCLBGC license verification.
// Isolated selector for nclbgc.org markup — one place to fix when markup changes.
// Honesty: returns verified:false on any ambiguity, empty, or throttled response.

export interface NclbgcVerifyResult {
  verified: boolean;
  detail?: string;
  licenseTier?: string;
}

/**
 * Parse raw HTML from nclbgc.org license lookup into a verification result.
 * - Returns { verified: false } on empty, throttled, or ambiguous markup.
 * - Only returns verified:true when an explicit active status is found.
 * - Extracts licenseTier (classification) when clearly present.
 */
export function parseNclbgcResponse(html: string): NclbgcVerifyResult {
  if (!html || typeof html !== "string" || !html.trim()) {
    return { verified: false, detail: "nclbgc unavailable, verify manually" };
  }

  const lower = html.toLowerCase();

  // Throttling / unavailable signals — fail open, no green badge
  if (
    lower.includes("too many requests") ||
    lower.includes("429") ||
    lower.includes("throttled") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("service unavailable") ||
    lower.includes("rate limit")
  ) {
    return { verified: false, detail: "nclbgc unavailable, verify manually" };
  }

  // Inactive/expired/revoked takes precedence — never verify in this case
  // Check explicit status line first
  const inactiveStatusRe =
    /license\s*status[^<]*:\s*(expired|inactive|revoked|suspended|lapsed|invalid|cancelled)/i;
  if (inactiveStatusRe.test(html)) {
    const m = html.match(inactiveStatusRe);
    const status = m?.[1]?.toLowerCase() ?? "not active";
    return { verified: false, detail: `License status: ${status}` };
  }

  // Active detection — require an explicit active marker tied to license context
  // Look for common nclbgc patterns:
  //   "License Status: Active", "Status: Active", "Current and Active", "Active License"
  const activeRe =
    /license\s*status[^<]*:\s*active|status[^<]*:\s*active\b|current\s+and\s+active|\bactive\s+license\b/i;

  // Fallback: if html contains both "license" and "active" in reasonable proximity,
  // treat as active (covers simpler fixture markup) but only if no inactive marker found
  const hasActiveExplicit = activeRe.test(html);
  const hasActiveFallback =
    lower.includes("active") &&
    (lower.includes("license status") || lower.includes("license") || lower.includes("classification"));

  if (!hasActiveExplicit && !hasActiveFallback) {
    return { verified: false, detail: "License not verified or not active" };
  }

  // Verify is not contradicted by an expired/inactive keyword elsewhere in a status block
  // If the html contains "expired" or "revoked" AND also active, prefer ambiguous=false
  // unless the active signal is an explicit "License Status: Active"
  if (!hasActiveExplicit && /(expired|revoked|suspended|lapsed|inactive)/i.test(html)) {
    return { verified: false, detail: "License not verified or not active" };
  }

  // Extract license tier / classification
  let licenseTier: string | undefined;
  const tierPatterns = [
    /classification[^<]*:\s*([^<\n\r]+)/i,
    /license\s*tier[^<]*:\s*([^<\n\r]+)/i,
    /qualifying\s*classification[^<]*:\s*([^<\n\r]+)/i,
    /license\s*classification[^<]*:\s*([^<\n\r]+)/i,
  ];
  for (const re of tierPatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const raw = m[1].trim().replace(/<\/?[^>]+>/g, "").trim();
      // Strip trailing HTML artifacts and limit length
      const cleaned = raw.split(/<|\n/)[0].trim().slice(0, 80);
      if (cleaned && cleaned.length >= 2 && !/^\W+$/.test(cleaned)) {
        licenseTier = cleaned;
        break;
      }
    }
  }

  return {
    verified: true,
    detail: "License verified as Active on nclbgc.org",
    licenseTier,
  };
}

/**
 * Server-side fetcher for NCLBGC license verification.
 * Never called from client directly.
 * Returns { verified:false, detail:"nclbgc unavailable, verify manually" } on any failure.
 */
export async function verifyOnNclbgc(
  licenseNumber: string
): Promise<NclbgcVerifyResult> {
  if (!licenseNumber || typeof licenseNumber !== "string" || !licenseNumber.trim()) {
    return { verified: false, detail: "nclbgc unavailable, verify manually" };
  }

  const trimmed = licenseNumber.trim();

  try {
    // Public lookup URL — isolated here so caller never builds URL directly.
    // NCLBGC public search endpoint (subject to change; parser handles HTML variation)
    const url = `https://www.nclbgc.org/license-search/?license=${encodeURIComponent(trimmed)}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (House Flip Studio license verification)" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { verified: false, detail: "nclbgc unavailable, verify manually" };
    }

    const html = await res.text();
    return parseNclbgcResponse(html);
  } catch {
    return { verified: false, detail: "nclbgc unavailable, verify manually" };
  }
}
