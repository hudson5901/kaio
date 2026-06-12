/**
 * eBay 出品中アイテムの文言を一括 AI 再生成する。
 *
 * POST  /api/items/regenerate-listings-batch
 *   body: { ids?: string[], pushToEbay?: boolean }
 *
 *   - ids 省略時: ebayStatus === "listed" の全アイテムを対象
 *   - pushToEbay (default true): "listed" アイテムは ReviseFixedPriceItem で eBay 側にも反映
 *
 *   serverless timeout 内に終わらない可能性があるため、フロントは小バッチ (10件等) で
 *   ids を渡して呼び出すこと。
 */

import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";

export const maxDuration = 300;

const SINGLE_ITEM_TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids : undefined;
  const pushToEbay: boolean = body.pushToEbay !== false; // default true

  // 対象アイテム取得
  let targets: { id: string; ebayStatus: string; ebayListingId: string | null }[];
  if (ids && ids.length > 0) {
    targets = await db
      .select({
        id: schema.items.id,
        ebayStatus: schema.items.ebayStatus,
        ebayListingId: schema.items.ebayListingId,
      })
      .from(schema.items)
      .where(inArray(schema.items.id, ids));
  } else {
    targets = await db
      .select({
        id: schema.items.id,
        ebayStatus: schema.items.ebayStatus,
        ebayListingId: schema.items.ebayListingId,
      })
      .from(schema.items)
      .where(eq(schema.items.ebayStatus, "listed"));
  }

  const baseUrl = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") ?? "";

  const results: {
    id: string;
    status: "regenerated" | "regenerated_and_pushed" | "failed";
    reason?: string;
  }[] = [];

  for (const t of targets) {
    try {
      // 1. AI 文言再生成 (既存ルートを呼び出す)
      const genCtrl = new AbortController();
      const genTimer = setTimeout(() => genCtrl.abort(), SINGLE_ITEM_TIMEOUT_MS);
      let genRes: Response;
      try {
        genRes = await fetch(`${baseUrl}/api/items/${t.id}/generate`, {
          method: "POST",
          headers: { cookie },
          signal: genCtrl.signal,
        });
      } finally {
        clearTimeout(genTimer);
      }
      if (!genRes.ok) {
        const txt = await genRes.text().catch(() => "");
        results.push({
          id: t.id,
          status: "failed",
          reason: `generate HTTP ${genRes.status}: ${txt.slice(0, 200)}`,
        });
        continue;
      }

      // 2. listed なら ReviseFixedPriceItem で eBay 側を更新
      if (pushToEbay && t.ebayStatus === "listed" && t.ebayListingId) {
        try {
          // 最新の DB 状態を読んで title/description/aspects を取得
          const fresh = await db.query.items.findFirst({
            where: eq(schema.items.id, t.id),
          });
          if (!fresh) {
            results.push({ id: t.id, status: "failed", reason: "アイテムが見つからない" });
            continue;
          }
          const { reviseFixedPriceItem, isTradingApiConfigured } = await import("@/lib/ebay/trading");
          const { mapItemToEbayListing } = await import("@/lib/ebay/mapping");
          if (!isTradingApiConfigured()) {
            results.push({
              id: t.id,
              status: "regenerated",
              reason: "DB更新済 (Trading API 未設定のため eBay 反映スキップ)",
            });
            continue;
          }
          const listing = mapItemToEbayListing(fresh);
          await reviseFixedPriceItem({
            itemId: t.ebayListingId,
            title: listing.title,
            description: listing.description,
            aspects: listing.aspects,
          });
          results.push({ id: t.id, status: "regenerated_and_pushed" });
        } catch (e) {
          results.push({
            id: t.id,
            status: "regenerated",
            reason: `revise 失敗: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } else {
        results.push({ id: t.id, status: "regenerated" });
      }
    } catch (e) {
      results.push({
        id: t.id,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const summary = {
    total: targets.length,
    regenerated: results.filter((r) => r.status === "regenerated").length,
    regeneratedAndPushed: results.filter((r) => r.status === "regenerated_and_pushed").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  return NextResponse.json({ summary, results });
}
