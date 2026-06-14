import { NextRequest, NextResponse } from "next/server";
import { getCategorySuggestions, getCategorySubtree } from "@/lib/ebay/taxonomy";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEbayConfigured } from "@/lib/ebay/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/ebay/category-suggestions?q=<query>
 *   → eBay Taxonomy API の getCategorySuggestions 結果を返す
 *
 * GET /api/ebay/category-suggestions?parentId=<id>
 *   → 指定カテゴリ配下の subtree (フラット化) を返す
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isEbayConfigured()) {
    return NextResponse.json(
      { error: "eBay API not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const parentId = searchParams.get("parentId");

  try {
    if (parentId) {
      const nodes = await getCategorySubtree(parentId);
      return NextResponse.json({ nodes });
    }
    if (!q) {
      return NextResponse.json({ suggestions: [] });
    }
    const suggestions = await getCategorySuggestions(q);
    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
