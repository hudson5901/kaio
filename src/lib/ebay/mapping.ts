import type { Item } from "@/lib/db/schema";
import { getCategory, type KabutoCategory } from "@/lib/kabuto/categories";
import { generateEnglishTitle, generateEnglishDescription, parseDimensions } from "@/lib/mercari/parser";

export interface EbayListingData {
  sku: string;
  title: string;             // max 80 chars
  description: string;
  categoryId: string;        // e.g. "11644"
  conditionString: string;   // "USED_EXCELLENT" etc (API用)
  conditionId: number;       // 3000 etc (CSV用)
  priceUsd: number;
  shippingCostUsd: number;
  quantity: number;           // always 1
  imageUrls: string[];        // filtered https URLs
  aspects: Record<string, string[]>;
  format: "FixedPrice";
}

export const CONDITION_ID_MAP: Record<string, number> = {
  NEW: 1000,
  NEW_OTHER: 1500,
  NEW_WITH_DEFECTS: 1750,
  USED_EXCELLENT: 3000,
  USED_VERY_GOOD: 3000,
  USED_GOOD: 3000,
  USED_ACCEPTABLE: 3000,
  FOR_PARTS_OR_NOT_WORKING: 7000,
};

/**
 * Item → EbayListingData 純関数マッピング
 * inventory.ts (API出品) と draft-csv.ts (CSVエクスポート) の両方で使用
 */
export function mapItemToEbayListing(item: Item): EbayListingData {
  // タイトル・説明文: AI生成済みがあればそれを使う
  let title: string;
  let description: string;
  if (item.ebayTitle && item.ebayDescription) {
    title = item.ebayTitle;
    description = item.ebayDescription;
  } else {
    const desc = item.mercariDescription || "";
    const dimensions = parseDimensions(desc);
    title = generateEnglishTitle(item.mercariTitle, desc);
    description = generateEnglishDescription(item.mercariTitle, desc, dimensions);
  }

  // Item Specifics
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

  // eBayカテゴリID
  let categoryId = "11644";
  if (item.kabutoCategory) {
    const category = getCategory(item.kabutoCategory as KabutoCategory);
    if (category) {
      categoryId = category.ebayCategoryId;
    }
  }

  // コンディション
  let conditionString = "USED_EXCELLENT";
  if (item.kabutoCategory) {
    const category = getCategory(item.kabutoCategory as KabutoCategory);
    if (category) {
      conditionString = category.defaultCondition;
    }
  }

  // 画像URL
  let imageUrls: string[] = [];
  if (item.processedImages) {
    try {
      const parsed: string[] = JSON.parse(item.processedImages);
      imageUrls = parsed.filter((url) => url.startsWith("https://"));
    } catch { /* empty */ }
  }

  return {
    sku: `KAIO-${item.mercariId}`,
    title: title.slice(0, 80),
    description,
    categoryId,
    conditionString,
    conditionId: CONDITION_ID_MAP[conditionString] ?? 3000,
    priceUsd: item.ebayPriceUsd || 0,
    shippingCostUsd: item.shippingCostUsd || 0,
    quantity: 1,
    imageUrls,
    aspects,
    format: "FixedPrice",
  };
}
