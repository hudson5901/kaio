/**
 * eBay リスティングインポート
 *
 * 既存の eBay 出品情報を取得してデータベースにインポート
 */

import { v4 as uuid } from "uuid";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  ebayFetch,
  isEbayConfigured,
  isEbayUserTokenConfigured,
} from "./client";

// eBay Inventory API のレスポンス型
interface EbayInventoryItem {
  sku: string;
  locale?: string;
  product?: {
    title?: string;
    description?: string;
    imageUrls?: string[];
    aspects?: Record<string, string[]>;
  };
  condition?: string;
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
}

interface EbayInventoryResponse {
  href?: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  inventoryItems: EbayInventoryItem[];
}

// eBay Offer の型
interface EbayOffer {
  offerId: string;
  sku: string;
  marketplaceId: string;
  format: string;
  listingDescription?: string;
  availableQuantity?: number;
  pricingSummary?: {
    price?: {
      value: string;
      currency: string;
    };
  };
  status?: string; // ACTIVE, ENDED, etc.
  listing?: {
    listingId?: string;
  };
}

interface EbayOffersResponse {
  href?: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  offers: EbayOffer[];
}

// eBay Fulfillment API のレスポンス型
interface EbayOrderLineItem {
  lineItemId: string;
  legacyItemId?: string;
  title: string;
  sku?: string;
  quantity: number;
  lineItemCost?: {
    value: string;
    currency: string;
  };
}

interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus: string;
  lineItems: EbayOrderLineItem[];
  creationDate: string;
  pricingSummary?: {
    total?: {
      value: string;
      currency: string;
    };
  };
}

interface EbayOrdersResponse {
  href?: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  orders: EbayOrder[];
}

/**
 * アクティブなインベントリアイテムを全件取得
 */
export async function fetchActiveListings(): Promise<EbayInventoryItem[]> {
  const allItems: EbayInventoryItem[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const res = await ebayFetch(
      `/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to fetch inventory items: ${res.status} ${error}`);
    }

    const data: EbayInventoryResponse = await res.json();
    allItems.push(...(data.inventoryItems || []));

    // ページネーション: next がなければ終了
    if (!data.next || allItems.length >= data.total) {
      break;
    }
    offset += limit;
  }

  return allItems;
}

/**
 * SKU に対する Offer 情報を取得
 */
async function fetchOffersForSku(sku: string): Promise<EbayOffer[]> {
  const res = await ebayFetch(
    `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&limit=100`
  );

  if (!res.ok) {
    // 404 は Offer なしとして扱う
    if (res.status === 404) return [];
    const error = await res.text();
    throw new Error(`Failed to fetch offers for SKU ${sku}: ${res.status} ${error}`);
  }

  const data: EbayOffersResponse = await res.json();
  return data.offers || [];
}

/**
 * 未完了/処理中のオーダー（売れたアイテム）を取得
 */
export async function fetchSoldItems(): Promise<EbayOrder[]> {
  const allOrders: EbayOrder[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const filter = encodeURIComponent(
      "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}"
    );
    const res = await ebayFetch(
      `/sell/fulfillment/v1/order?filter=${filter}&limit=${limit}&offset=${offset}`
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to fetch orders: ${res.status} ${error}`);
    }

    const data: EbayOrdersResponse = await res.json();
    allOrders.push(...(data.orders || []));

    if (!data.next || allOrders.length >= data.total) {
      break;
    }
    offset += limit;
  }

  return allOrders;
}

/**
 * eBay リスティングをインポートしてDBにアップサート
 *
 * @returns インポート結果の統計
 */
export async function importEbayListings(): Promise<{
  imported: number;
  updated: number;
  soldMarked: number;
  errors: string[];
}> {
  // 環境変数チェック
  if (!isEbayConfigured()) {
    throw new Error(
      "eBay API が未設定です。EBAY_CLIENT_ID と EBAY_CLIENT_SECRET を設定してください。"
    );
  }
  if (!isEbayUserTokenConfigured()) {
    throw new Error(
      "eBay ユーザートークンが未設定です。EBAY_REFRESH_TOKEN を設定するか、OAuth フローを完了してください。"
    );
  }

  const results = {
    imported: 0,
    updated: 0,
    soldMarked: 0,
    errors: [] as string[],
  };

  // 1. アクティブなインベントリアイテムを取得
  let inventoryItems: EbayInventoryItem[] = [];
  try {
    inventoryItems = await fetchActiveListings();
  } catch (err) {
    results.errors.push(`インベントリ取得エラー: ${err}`);
    return results;
  }

  // 2. 各アイテムをDBにインポート/更新
  for (const invItem of inventoryItems) {
    try {
      const sku = invItem.sku;
      const title = invItem.product?.title || sku;
      const description = invItem.product?.description || "";
      const images = invItem.product?.imageUrls || [];

      // Offer 情報を取得して価格と listingId を取得
      let priceUsd: number | null = null;
      let offerId: string | null = null;
      let listingId: string | null = null;
      let offerStatus: string | null = null;

      try {
        const offers = await fetchOffersForSku(sku);
        if (offers.length > 0) {
          const offer = offers[0]; // 最初のオファーを使用
          offerId = offer.offerId;
          offerStatus = offer.status || null;
          listingId = offer.listing?.listingId || null;

          if (offer.pricingSummary?.price?.value) {
            priceUsd = parseFloat(offer.pricingSummary.price.value);
          }
        }
      } catch (err) {
        // Offer 取得失敗は警告として記録
        results.errors.push(`Offer取得警告 (${sku}): ${err}`);
      }

      // ebayStatus を判定
      const ebayStatus =
        offerStatus === "ACTIVE" ? "listed" :
        offerStatus === "ENDED" ? "removed" :
        "draft";

      // 既存アイテムを SKU (ebayListingId) で検索
      const existing = await db.query.items.findFirst({
        where: eq(schema.items.ebayListingId, sku),
      });

      if (existing) {
        // 更新
        await db
          .update(schema.items)
          .set({
            ebayTitle: title,
            ebayDescription: description,
            ebayPriceUsd: priceUsd,
            ebayOfferId: offerId,
            ebayStatus: ebayStatus,
            mercariImages: images.length > 0 ? JSON.stringify(images) : existing.mercariImages,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, existing.id));
        results.updated++;
      } else {
        // 新規作成
        await db.insert(schema.items).values({
          id: uuid(),
          mercariUrl: "ebay-import",
          mercariTitle: title,
          mercariDescription: description,
          mercariPrice: 0, // eBayインポートではメルカリ価格は不明
          mercariImages: images.length > 0 ? JSON.stringify(images) : null,
          mercariStatus: "available",
          ebayListingId: sku,
          ebayOfferId: offerId,
          ebayTitle: title,
          ebayDescription: description,
          ebayPriceUsd: priceUsd,
          ebayStatus: ebayStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        results.imported++;
      }
    } catch (err) {
      results.errors.push(`アイテムインポートエラー (${invItem.sku}): ${err}`);
    }
  }

  // 3. 売れたアイテムを取得してステータスを更新
  try {
    const orders = await fetchSoldItems();

    for (const order of orders) {
      for (const lineItem of order.lineItems) {
        const sku = lineItem.sku;
        if (!sku) continue;

        try {
          const existing = await db.query.items.findFirst({
            where: eq(schema.items.ebayListingId, sku),
          });

          if (existing && existing.ebayStatus !== "sold") {
            await db
              .update(schema.items)
              .set({
                ebayStatus: "sold",
                updatedAt: new Date().toISOString(),
              })
              .where(eq(schema.items.id, existing.id));
            results.soldMarked++;
          }
        } catch (err) {
          results.errors.push(`売約済み更新エラー (${sku}): ${err}`);
        }
      }
    }
  } catch (err) {
    results.errors.push(`オーダー取得エラー: ${err}`);
  }

  return results;
}
