import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Server-side client used only inside API routes / server code.
// Bypasses RLS intentionally — callers must enforce their own auth/org checks.
export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return user;
}

// Returns the authenticated user's org_id (from their profile).
export async function requireOrgId(): Promise<{ orgId: string; userId: string }> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (error || !profile?.org_id) {
    throw new Error("No org assigned to this user");
  }

  return { orgId: profile.org_id, userId: user.id };
}
