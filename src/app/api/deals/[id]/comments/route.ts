import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

export interface DealComment {
  id: string;
  deal_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: { display_name: string | null } | null;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    // Verify the deal belongs to this org.
    const { data: deal } = await admin.from("deals").select("org_id").eq("id", id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("deal_comments")
      .select("*, profiles(display_name)")
      .eq("deal_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ comments: data as DealComment[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { orgId, userId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    const { data: deal } = await admin.from("deals").select("org_id").eq("id", id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("deal_comments")
      .insert({ deal_id: id, user_id: userId, content })
      .select("*, profiles(display_name)")
      .single();

    if (error) throw error;
    return NextResponse.json({ comment: data as DealComment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
