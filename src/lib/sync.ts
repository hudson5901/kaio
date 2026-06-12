/**
 * 在庫同期の共通ロジック
 * sync/route.ts と cron-scheduler.ts の両方から使用
 */
import { db, schema } from "@/lib/db";
import { eq, and, ne, asc } from "drizzle-orm";
import { checkMercariAvailability } from "@/lib/mercari/scraper";
import { removeEbayListing } from "@/lib/ebay/inventory";
import { v4 as uuid } from "uuid";
import { createNotification } from "@/lib/notifications";

export interface SyncResult {
  checked: number;
  soldOnMercari: number;
  deletedOnMercari: number;
  removedFromEbay: number;
  skipped: number;
  errors: string[];
  hasMore: boolean;
}

const DELAY_MS = 1500;

/**
 * バッチ在庫同期
 * @param batchSize 1回に処理するアイテム数（デフォルト20）
 */
export async function runSyncBatch(batchSize = 20): Promise<SyncResult> {
  const results: SyncResult = {
    checked: 0,
    soldOnMercari: 0,
    deletedOnMercari: 0,
    removedFromEbay: 0,
    skipped: 0,
    errors: [],
    hasMore: false,
  };

  // updatedAt の古い順で batchSize 件取得（まだチェックしていないものから）
  const activeItems = await db
    .select()
    .from(schema.items)
    .where(
      and(
        eq(schema.items.mercariStatus, "available"),
        ne(schema.items.ebayStatus, "removed")
      )
    )
    .orderBy(asc(schema.items.updatedAt))
    .limit(batchSize + 1); // +1 で hasMore を判定

  if (activeItems.length > batchSize) {
    results.hasMore = true;
    activeItems.pop();
  }

  for (const item of activeItems) {
    if (!item.mercariId) {
      results.skipped++;
      continue;
    }

    try {
      results.checked++;

      if (results.checked > 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      const status = await checkMercariAvailability(item.mercariId);

      if (status === "unknown") {
        // API エラー時はスキップ（available 扱いしない）
        results.skipped++;
        continue;
      }

      // updatedAt を更新（次バッチでは後回しになる）
      // sold/deleted の場合は decision を "out_of_stock" に自動設定 (パス/未判定とは別ステータス)
      const updates: Partial<typeof schema.items.$inferInsert> = {
        mercariStatus: status,
        updatedAt: new Date().toISOString(),
      };
      if (status === "sold" || status === "deleted") {
        updates.decision = "out_of_stock";
      }
      await db
        .update(schema.items)
        .set(updates)
        .where(eq(schema.items.id, item.id));

      if (status === "sold") {
        results.soldOnMercari++;
        await db.insert(schema.notifications).values({
          id: uuid(),
          type: "sold",
          title: "メルカリで売り切れ",
          message: `「${item.mercariTitle}」(¥${(item.mercariPrice ?? 0).toLocaleString()}) がメルカリで売り切れました`,
          itemId: item.id,
        });
      } else if (status === "deleted") {
        results.deletedOnMercari++;
        await db.insert(schema.notifications).values({
          id: uuid(),
          type: "deleted",
          title: "メルカリから削除",
          message: `「${item.mercariTitle}」がメルカリから削除されました`,
          itemId: item.id,
        });
      }

      // eBay出品中なら取り下げ
      if (status !== "available" && item.ebayStatus === "listed") {
        try {
          if (item.ebayOfferId) {
            await removeEbayListing(item);
          } else if (item.ebayListingId) {
            // Trading API ルート (offerId なし)
            const { endFixedPriceItem } = await import("@/lib/ebay/trading");
            await endFixedPriceItem(item.ebayListingId);
            await db
              .update(schema.items)
              .set({
                ebayStatus: "removed",
                updatedAt: new Date().toISOString(),
              })
              .where(eq(schema.items.id, item.id));
          }
          results.removedFromEbay++;
        } catch (err) {
          results.errors.push(`eBay取り下げ失敗 ${item.mercariId}: ${err}`);
        }
      }
    } catch (err) {
      results.errors.push(`チェック失敗 ${item.mercariId}: ${err}`);
    }
  }

  // エラー通知（まとめて1件）
  if (results.errors.length > 0) {
    await createNotification(
      "error",
      "同期エラー",
      `${results.errors.length}件のエラー: ${results.errors[0].slice(0, 150)}`
    );
  }

  return results;
}
