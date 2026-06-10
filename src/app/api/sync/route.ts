import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, ne } from "drizzle-orm";
import { checkMercariAvailability } from "@/lib/mercari/scraper";
import { removeEbayListing } from "@/lib/ebay/inventory";
import { v4 as uuid } from "uuid";
import { createNotification } from "@/lib/notifications";

/**
 * 在庫同期: メルカリの在庫状態をチェックしてeBay出品を更新
 * 売り切れアイテムは通知を作成
 */
export async function POST() {
  const results = {
    checked: 0,
    soldOnMercari: 0,
    deletedOnMercari: 0,
    removedFromEbay: 0,
    errors: [] as string[],
  };

  // メルカリで"available"のアイテムを取得
  const activeItems = await db
    .select()
    .from(schema.items)
    .where(
      and(
        eq(schema.items.mercariStatus, "available"),
        ne(schema.items.ebayStatus, "removed")
      )
    );

  for (const item of activeItems) {
    try {
      results.checked++;

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const status = await checkMercariAvailability(item.mercariId!);

      if (status !== "available") {
        // ステータス更新
        await db
          .update(schema.items)
          .set({
            mercariStatus: status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, item.id));

        if (status === "sold") {
          results.soldOnMercari++;
          // 売り切れ通知
          await db.insert(schema.notifications).values({
            id: uuid(),
            type: "sold",
            title: "メルカリで売り切れ",
            message: `「${item.mercariTitle}」(¥${item.mercariPrice.toLocaleString()}) がメルカリで売り切れました`,
            itemId: item.id,
          });
        } else {
          results.deletedOnMercari++;
          await db.insert(schema.notifications).values({
            id: uuid(),
            type: "deleted",
            title: "メルカリから削除",
            message: `「${item.mercariTitle}」がメルカリから削除されました`,
            itemId: item.id,
          });
        }

        // eBayに出品中なら取り下げ
        if (item.ebayStatus === "listed") {
          try {
            await removeEbayListing(item);
            results.removedFromEbay++;
          } catch (err) {
            results.errors.push(`eBay removal failed for ${item.mercariId}: ${err}`);
          }
        }
      }
    } catch (err) {
      results.errors.push(`Check failed for ${item.mercariId}: ${err}`);
    }
  }

  // エラー通知
  if (results.errors.length > 0) {
    await createNotification("error", "同期エラー", `${results.errors.length}件のエラー: ${results.errors[0].slice(0, 150)}`);
  }

  return NextResponse.json(results);
}
