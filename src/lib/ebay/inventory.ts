import { getBaseApiUrl } from "./auth";
import { getUserToken } from "./client";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Item } from "@/lib/db/schema";
import { mapItemToEbayListing } from "./mapping";

/**
 * eBay Inventory API でアイテムを出品（下書き or 公開）
 *
 * options.publish:
 *   true  → inventory_item + offer + publish (即時公開)
 *   false → inventory_item + offer のみ (eBay側で下書き状態、Seller Hubで編集・公開可能)
 *
 * 同一SKUに既存のoffer (item.ebayOfferId) がある場合は PUT で更新する。
 */
export async function createEbayListing(
  item: Item,
  options: { publish?: boolean } = {}
): Promise<{
  listingId: string | null;
  offerId: string;
  published: boolean;
}> {
  const publish = options.publish !== false; // default true
  const token = await getUserToken();
  const baseUrl = getBaseApiUrl();

  const listing = mapItemToEbayListing(item);
  const sku = listing.sku;

  const inventoryItem = {
    availability: {
      shipToLocationAvailability: {
        quantity: listing.quantity,
      },
    },
    condition: listing.conditionString,
    product: {
      title: listing.title,
      description: listing.description,
      imageUrls: listing.imageUrls,
      aspects: listing.aspects,
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
    listingDescription: listing.description,
    availableQuantity: listing.quantity,
    categoryId: listing.categoryId,
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

  let offerId: string;
  if (item.ebayOfferId) {
    // 既存offerを更新 (PUT)
    const updateOfferRes = await fetch(
      `${baseUrl}/sell/inventory/v1/offer/${item.ebayOfferId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
        },
        body: JSON.stringify(offer),
      }
    );
    if (!updateOfferRes.ok && updateOfferRes.status !== 204) {
      const error = await updateOfferRes.text();
      throw new Error(`Failed to update offer: ${error}`);
    }
    offerId = item.ebayOfferId;
  } else {
    // 新規offer作成 (POST)
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
    offerId = offerData.offerId;
  }

  let listingId: string | null = null;
  if (publish) {
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
    listingId = publishData.listingId;
  }

  // DB更新
  await db
    .update(schema.items)
    .set({
      ebayListingId: listingId ?? item.ebayListingId,
      ebayOfferId: offerId,
      ebayStatus: publish ? "listed" : "draft",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.items.id, item.id));

  return { listingId, offerId, published: publish };
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
