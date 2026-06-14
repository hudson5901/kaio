import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getItemStats, isTradingApiConfigured } from "@/lib/ebay/trading";

export const dynamic = "force-dynamic";

/**
 * POST /api/ebay/refresh-stats
 *
 * ebayStatus=listed のすべてのアイテムについて eBay Trading API GetItem で
 * HitCount / WatchCount を取得し DB を更新する。
 *
 * クエリ ?itemId=<id> を指定すると単一アイテムだけリフレッシュ。
 *
 * eBay には呼び出し頻度制限があるので 1 件ずつ順次実行 (並列なし)。
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isTradingApiConfigured()) {
    return NextResponse.json(
      { error: "eBay Trading API not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const onlyItemId = searchParams.get("itemId");

  const targets = await db
    .select({
      id: schema.items.id,
      ebayListingId: schema.items.ebayListingId,
    })
    .from(schema.items)
    .where(
      onlyItemId
        ? eq(schema.items.id, onlyItemId)
        : and(
            eq(schema.items.ebayStatus, "listed"),
            isNotNull(schema.items.ebayListingId),
          ),
    );

  const filtered = targets.filter((t) => !!t.ebayListingId);

  let updated = 0;
  let failed = 0;
  const errors: Array<{ id: string; message: string }> = [];
  const now = new Date().toISOString();

  for (const t of filtered) {
    try {
      const stats = await getItemStats(t.ebayListingId!);
      await db
        .update(schema.items)
        .set({
          ebayHitCount: stats.hitCount,
          ebayWatchCount: stats.watchCount,
          ebayStatsUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.items.id, t.id));
      updated++;
    } catch (e) {
      failed++;
      errors.push({
        id: t.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    failed,
    total: filtered.length,
    errors: errors.slice(0, 10),
  });
}
