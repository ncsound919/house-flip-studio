import type { createAdminClient } from "@/lib/apiHelpers";
import { verifyOnNclbgc } from "@/lib/contractorSources/nclbgc";

// Contractor license verification — shared by the /api/contractors/verify-license
// route and the autonomous agent runner.
//
// HONESTY: `verified_at` is only ever stamped when nclbgc actually returns an
// active license. Every attempt records `license_checked_at`; a failed or
// ambiguous check leaves `verified_at` untouched. The agent therefore never
// claims a contractor is verified when nothing was verified.

export interface ContractorVerificationResult {
  verified: boolean;
  detail?: string;
  licenseTier?: string;
  checkedAt: string;
  licenseNumber?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function verifyContractor(
  admin: Admin,
  orgId: string,
  contractorId: string
): Promise<ContractorVerificationResult> {
  const checkedAt = new Date().toISOString();

  const { data, error } = await admin
    .from("contractors")
    .select("id, org_id, license_number, license_tier")
    .eq("id", contractorId)
    .single();
  if (error || !data) {
    return { verified: false, detail: "contractor not found", checkedAt };
  }
  const contractor = data as {
    id: string;
    org_id: string;
    license_number: string | null;
    license_tier: string | null;
  };
  if (contractor.org_id !== orgId) {
    return { verified: false, detail: "forbidden", checkedAt };
  }

  const licenseNumber = (contractor.license_number ?? "").trim();
  if (!licenseNumber) {
    await recordContractorCheck(admin, contractorId, { verified: false, definitive: false });
    return { verified: false, detail: "no license_number on contractor", checkedAt };
  }

  let result: { verified: boolean; detail?: string; licenseTier?: string };
  try {
    result = await verifyOnNclbgc(licenseNumber);
  } catch {
    result = { verified: false, detail: "nclbgc unavailable, verify manually" };
  }

  // "unavailable" means nclbgc couldn't be reached — NOT proof the license is
  // bad. Only a definitive result (inactive/expired/revoked) clears a prior
  // verified_at; an availability failure leaves it untouched.
  const definitive =
    result.verified || !String(result.detail ?? "").toLowerCase().includes("unavailable");

  await recordContractorCheck(admin, contractorId, {
    verified: result.verified,
    licenseTier: result.licenseTier,
    definitive,
  });

  return {
    verified: result.verified,
    detail: result.detail,
    licenseTier: result.licenseTier,
    checkedAt,
    licenseNumber,
  };
}

// Stamp the check. `license_checked_at` is always written; `verified_at` +
// `license_tier` only on a real success. A definitive failure clears a stale
// `verified_at` so the badge is never a lie. Iteratively strips the optional
// column if the migration hasn't been applied to the production DB yet.
export async function recordContractorCheck(
  admin: Admin,
  contractorId: string,
  opts: { verified: boolean; licenseTier?: string; definitive?: boolean }
): Promise<{ error?: { message: string } | null }> {
  const patch: Record<string, unknown> = {
    license_checked_at: new Date().toISOString(),
  };
  if (opts.verified) {
    patch.verified_at = new Date().toISOString();
    if (opts.licenseTier) patch.license_tier = opts.licenseTier;
  } else if (opts.definitive) {
    patch.verified_at = null;
  }
  const tryUpdate = async (row: Record<string, unknown>) => {
    return admin.from("contractors").update(row).eq("id", contractorId);
  };
  let { error } = await tryUpdate(patch);
  if (error && /Could not find the 'license_checked_at' column/i.test(error.message)) {
    const fallback: Record<string, unknown> = {};
    if (opts.verified) fallback.verified_at = patch.verified_at;
    else if (opts.definitive) fallback.verified_at = null;
    if (opts.licenseTier) fallback.license_tier = patch.license_tier;
    const retry = await tryUpdate(fallback);
    error = retry.error;
  }
  return { error };
}