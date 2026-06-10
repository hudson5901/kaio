import { getBaseApiUrl } from "./auth";
import { getUserToken } from "./client";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Item } from "@/lib/db/schema";
import { generateEnglishTitle, generateEnglishDescription, parseDimensions } from "@/lib/mercari/parser";
import { getCategory, type KabutoCategory } from "@/lib/kabuto/categories";

/**
 * eBay Inventory API でアイテムを出品
 */
export async function createEbayListing(item: Item): Promise<{
  listingId: string;
  offerId: string;
}> {
  const token = await getUserToken();
  const baseUrl = getBaseApiUrl();

  // AI生成済みのタイトル・説明文があればそれを使う、なければフォールバック生成
  let title: string;
  let engDescription: string;
  if (item.ebayTitle && item.ebayDescription) {
    title = item.ebayTitle;
    engDescription = item.ebayDescription;
  } else {
    const description = item.mercariDescription || "";
    const dimensions = parseDimensions(description);
    title = generateEnglishTitle(item.mercariTitle, description);
    engDescription = generateEnglishDescription(item.mercariTitle, description, dimensions);
  }

  // Item Specifics: DB保存済みのaspects → カテゴリデフォルト → ハードコードフォールバック
  let aspects: Record<string, string[]> = {
    Type: ["Kabuto"],
    "Country/Region of Manufacture": ["Japan"],
    "Original/Reproduction": ["Original"],
  };

  if (item.ebayAspects) {
    try {
      aspects = JSON.parse(item.ebayAspects);
    } catch { /* use default */ }
  } else if (item.kabutoCategory) {
    const category = getCategory(item.kabutoCategory as KabutoCategory);
    if (category) {
      aspects = category.defaultAspects;
    }
  }

  // eBayカテゴリID: カテゴリ設定から取得、フォールバックは11644 (Asian Antiques > Japan > Armor)
  let categoryId = "11644";
  if (item.kabutoCategory) {
    const category = getCategory(item.kabutoCategory as KabutoCategory);
    if (category) {
      categoryId = category.ebayCategoryId;
    }
  }

  // コンディション: カテゴリ設定から取得
  let condition = "USED_EXCELLENT";
  if (item.kabutoCategory) {
    const category = getCategory(item.kabutoCategory as KabutoCategory);
    if (category) {
      condition = category.defaultCondition;
    }
  }

  // 加工済み画像のURL
  const processedImages: string[] = item.processedImages
    ? JSON.parse(item.processedImages)
    : [];

  // 1. Inventory Item を作成/更新
  const sku = `KAIO-${item.mercariId}`;

  const inventoryItem = {
    availability: {
      shipToLocationAvailability: {
        quantity: 1,
      },
    },
    condition,
    product: {
      title: title.slice(0, 80),
      description: engDescription,
      imageUrls: processedImages.length > 0
        ? processedImages.filter((p) => p.startsWith("http"))
        : [],
      aspects,
    },
  };

  const createItemRes = await fetch(
    `${baseUrl}/sell/inventory/v1/inventory_item/${sku}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(inventoryItem),
    }
  );

  if (!createItemRes.ok && createItemRes.status !== 204) {
    const error = await createItemRes.text();
    throw new Error(`Failed to create inventory item: ${error}`);
  }

  // 2. Offer を作成
  const offer = {
    sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    listingDescription: engDescription,
    availableQuantity: 1,
    categoryId,
    pricingSummary: {
      price: {
        value: String(item.ebayPriceUsd || 0),
        currency: "USD",
      },
    },
    listingPolicies: {
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: process.env.EBAY_RETURN_POLICY_ID,
    },
    merchantLocationKey: process.env.EBAY_LOCATION_KEY || "default",
  };

  const createOfferRes = await fetch(
    `${baseUrl}/sell/inventory/v1/offer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(offer),
    }
  );

  if (!createOfferRes.ok) {
    const error = await createOfferRes.text();
    throw new Error(`Failed to create offer: ${error}`);
  }

  const offerData = await createOfferRes.json();
  const offerId = offerData.offerId;

  // 3. Offer を公開
  const publishRes = await fetch(
    `${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!publishRes.ok) {
    const error = await publishRes.text();
    throw new Error(`Failed to publish offer: ${error}`);
  }

  const publishData = await publishRes.json();
  const listingId = publishData.listingId;

  // DB更新
  await db
    .update(schema.items)
    .set({
      ebayListingId: listingId,
      ebayOfferId: offerId,
      ebayStatus: "listed",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.items.id, item.id));

  return { listingId, offerId };
}

/**
 * eBayの出品を取り下げる
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

  // SKU削除
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

  // DB更新
  await db
    .update(schema.items)
    .set({
      ebayStatus: "removed",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.items.id, item.id));
}
