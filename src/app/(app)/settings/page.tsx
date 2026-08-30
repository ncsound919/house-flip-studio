import Link from "next/link";
import { Download, Database, Cpu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsForm from "@/components/settings/SettingsForm";

export const metadata = { title: "Settings | NC House Flip Studio" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch the user's profile for display name.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const llmModel = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">
          Account, data export, and integration status.
        </p>
      </div>

      {/* Profile */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Profile</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Signed in as <span className="font-medium text-zinc-700">{user.email}</span>
          {profile?.role ? ` · ${profile.role}` : ""}
        </p>
        <SettingsForm initialDisplayName={profile?.display_name ?? ""} />
      </div>

      {/* Data export */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">Data Export</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Download all of your org's data as JSON. Includes deals, rehab items, change orders,
          documents, contractors, comments, and AI analyses.
        </p>
        <a
          href="/api/export"
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          <Download className="h-4 w-4" /> Export All Data
        </a>
      </div>

      {/* Integrations */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Integrations</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-zinc-400" />
              <div>
                <p className="text-sm font-medium text-zinc-800">Supabase</p>
                <p className="text-xs text-zinc-500">Database, auth, realtime</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                hasSupabase ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {hasSupabase ? "Connected" : "Not configured"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-zinc-400" />
              <div>
                <p className="text-sm font-medium text-zinc-800">OpenRouter (LLM)</p>
                <p className="text-xs text-zinc-500">Model: {llmModel}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                hasOpenRouter ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {hasOpenRouter ? "Connected" : "Not configured"}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          AI features degrade gracefully — core deal tracking works without an LLM key.
        </p>
      </div>

      {/* App info */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">App Info</h2>
        <div className="space-y-1 text-sm text-zinc-600">
          <p>
            Version: <span className="font-medium text-zinc-800">v1.0.0</span>
          </p>
          <p>
            Deployment URL:{" "}
            <span className="font-medium text-zinc-800">
              {process.env.APP_URL || "Not set (running locally)"}
            </span>
          </p>
          <p className="pt-2 text-xs text-zinc-400">
            <Link href="/" className="text-blue-600 hover:text-blue-700">
              ← Back to pipeline
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
