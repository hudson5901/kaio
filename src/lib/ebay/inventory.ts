import { getBaseApiUrl } from "./auth";
import { getUserToken } from "./client";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Item } from "@/lib/db/schema";

/**
 * eBay Inventory API (REST + OAuth) で出品を取り下げる
 *
 * 出品ルートは Trading API に切り替え済み (src/lib/ebay/trading.ts addFixedPriceItem)。
 * このファイルに残しているのは Inventory API ルートで出品した過去アイテム
 * (ebayOfferId が記録されている) を取り下げるためのみ。
 */
export async function removeEbayListing(item: Item): Promise<void> {
  if (!item.ebayOfferId) return;

  const token = await getUserToken();
  const baseUrl = getBaseApiUrl();

  // Offer を取り下げ
  const res = await fetch(
    `${baseUrl}/sell/inventory/v1/offer/${item.ebayOfferId}/withdraw`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok && res.status !== 404) {
    const error = await res.text();
    throw new Error(`Failed to withdraw offer: ${error}`);
  }

  // SKU削除 (mercariId が無いインポート由来は SKU 不明のためスキップ)
  if (item.mercariId) {
    const sku = `KAIO-${item.mercariId}`;
    await fetch(
      `${baseUrl}/sell/inventory/v1/inventory_item/${sku}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  }

  // DB更新
  await db
    .update(schema.items)
    .set({
      ebayStatus: "removed",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.items.id, item.id));
}
