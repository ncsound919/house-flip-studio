import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import type { Deal } from "@/lib/types";
import DealDetail from "@/components/deals/DealDetail";

export const metadata = { title: "Deal | NC House Flip Studio" };

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrgId();
  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select("*")
    .eq("id", id)
    .single();

  if (!deal || deal.org_id !== orgId) notFound();

  const [{ data: contractors }, { data: comments }] = await Promise.all([
    admin.from("contractors").select("*").eq("org_id", orgId).order("name"),
    admin
      .from("deal_comments")
      .select("*, profiles(display_name)")
      .eq("deal_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>
      <DealDetail
        deal={deal as Deal}
        contractors={contractors ?? []}
        initialComments={comments ?? []}
      />
    </div>
  );
}
