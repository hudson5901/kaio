import { db, schema } from "@/lib/db";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { getExchangeRate } from "@/lib/exchange-rate";
import { processItemImages } from "@/lib/image/processor";
import { calculateCosts } from "@/lib/shipping/calculator";
import { parseDimensions } from "@/lib/mercari/parser";

const JINA_BASE = "https://r.jina.ai/";
const FALLBACK_USD_TO_JPY = 155;

/**
 * メルカリの画像URLは m{id}_{n}.jpg のパターンに従う。
 * 常に /item/detail/orig/photos/ ベースでHEADリクエストして全画像を取得する。
 */
async function inferMercariImages(mercariId: string, foundUrls: string[]): Promise<string[]> {
  if (foundUrls.length >= 3) return foundUrls;

  // 常に高解像度パスを使う（サムネ・webpではなく）
  const baseUrl = "https://static.mercdn.net/item/detail/orig/photos/";
  const allUrls: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const candidateUrl = `${baseUrl}${mercariId}_${i}.jpg`;

    // 既存URLに同じ番号が含まれてるかチェック（_1と_10の誤マッチを防ぐ）
    const suffix = `${mercariId}_${i}.`;
    if (foundUrls.some(u => u.includes(suffix))) {
      // 既存URLからそのまま使う
      const existing = foundUrls.find(u => u.includes(suffix));
      if (existing && !allUrls.includes(existing)) allUrls.push(existing);
      continue;
    }

    try {
      const res = await fetch(candidateUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        allUrls.push(candidateUrl);
      } else {
        break; // 連番途切れ
      }
    } catch {
      break;
    }
  }

  // 推測で取れなかった場合は元のURLを返す
  return allUrls.length > foundUrls.length ? allUrls : foundUrls;
}

async function fetchWithJina(url: string, waitForSelector?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/markdown",
    "X-Return-Format": "markdown",
  };
  if (waitForSelector) {
    headers["X-Wait-For-Selector"] = waitForSelector;
    headers["X-Timeout"] = "30";
  }
  const response = await fetch(`${JINA_BASE}${url}`, { headers });
  if (!response.ok) throw new Error(`Jina: ${response.status}`);
  return response.text();
}

export async function batchProcess(
  action: string,
  batchSize: number
): Promise<{ processed: number; remaining: number; errors: string[] }> {
  switch (action) {
    case "fetch_details":
      return batchFetchDetails(batchSize);
    case "infer_images":
      return batchInferImages(batchSize);
    case "process_images":
      return batchProcessImages(batchSize);
    case "calculate_costs":
      return batchCalculateCosts(batchSize);
    case "classify":
      return batchClassify(batchSize);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function batchFetchDetails(batchSize: number) {
  // 説明文なし OR 画像が少ない（_2がない = 1枚以下）アイテムを対象
  const needsDetails = and(
    eq(schema.items.mercariStatus, "available"),
    or(
      isNull(schema.items.mercariDescription),
      eq(schema.items.mercariDescription, ""),
      sql`${schema.items.mercariImages} NOT LIKE '%_2%'`
    )
  );

  const items = await db.query.items.findMany({
    where: needsDetails,
    limit: batchSize,
  });

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(needsDetails);

  const errors: string[] = [];
  let processed = 0;
  const usdToJpy = await getExchangeRate().catch(() => FALLBACK_USD_TO_JPY);

  for (const item of items) {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const markdown = await fetchWithJina(
        `https://jp.mercari.com/item/${item.mercariId}`,
        "[data-testid=description]"
      );

      const imageUrls: string[] = [];
      const MAX_IMAGES = 10;

      // 商品画像かどうか判定
      function isProductImage(url: string): boolean {
        if (url.includes("/avatar/") || url.includes("/icon/") || url.includes("/logo/")) return false;
        if (/w\/\d{1,2}[^0-9]/.test(url)) return false; // tiny icons
        return true;
      }

      // 優先度順にパターンマッチ
      const imgPatterns = [
        // 高解像度の詳細写真
        /(https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/[^\s)"']+)/g,
        // サムネイル写真
        /(https:\/\/static\.mercdn\.net\/c![^\s)"']*\/thumb\/photos\/[^\s)"']+)/g,
        /(https:\/\/static\.mercdn\.net\/thumb\/photos\/[^\s)"']+)/g,
        // マークダウン画像記法
        /!\[.*?\]\((https:\/\/static\.mercdn\.net\/[^\s)]+)\)/g,
        // サムネイルアイテム画像（検索結果のものも含む）
        /(https:\/\/static\.mercdn\.net\/thumb\/item\/[^\s)"']+)/g,
        // その他 mercdn の画像URL全般
        /(https:\/\/static\.mercdn\.net\/[^\s)"']*(?:\.jpg|\.jpeg|\.png|\.webp)[^\s)"']*)/gi,
      ];
      for (const pattern of imgPatterns) {
        if (imageUrls.length >= MAX_IMAGES) break;
        let m;
        while ((m = pattern.exec(markdown)) !== null && imageUrls.length < MAX_IMAGES) {
          const u = m[1];
          if (u && !imageUrls.includes(u) && isProductImage(u)) {
            imageUrls.push(u);
          }
        }
      }

      let existingImages: string[] = [];
      try { existingImages = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }
      let finalImages = imageUrls.length > 0 ? imageUrls : existingImages;
      for (const img of existingImages) {
        if (!finalImages.includes(img)) finalImages.push(img);
      }

      // パターンマッチで取れた画像が少ない場合、連番URLで推測して追加取得
      if (finalImages.length < 3 && item.mercariId) {
        try {
          finalImages = await inferMercariImages(item.mercariId, finalImages);
        } catch { /* ignore */ }
      }

      let price = item.mercariPrice;
      if (!price || price === 0) {
        const jpyMatch = /[¥￥]\s?([\d,]+)/.exec(markdown);
        const usdMatch = /US\$(\d+[\d,.]*)/i.exec(markdown);
        if (jpyMatch) price = parseInt(jpyMatch[1].replace(/,/g, ""), 10);
        else if (usdMatch) price = Math.round(parseFloat(usdMatch[1].replace(/,/g, "")) * usdToJpy);
      }

      let description = "";
      const descMatch = /商品の説明\s*\n+([\s\S]*?)(?=\n##|\n---|\n\*\s*\*\s*\*|\n商品の情報)/.exec(markdown);
      if (descMatch) {
        description = descMatch[1].trim();
      } else {
        const navKw = ["メルカリ", "ログイン", "利用規約", "プライバシー", "ヘルプ", "会社概要", "about.mercari", "static.jp.mercari", "コンテンツにスキップ", "Markdown Content", "URL Source"];
        const lines = markdown.split("\n");
        const blocks = lines.filter(l => l.length > 30 && !l.startsWith("#") && !l.startsWith("[") && !l.startsWith("!") && !l.startsWith("*") && !navKw.some(kw => l.includes(kw)));
        description = blocks.join("\n").trim().slice(0, 2000);
      }

      const titleMatch = /^#\s+(.+)$/m.exec(markdown);
      const title = titleMatch ? titleMatch[1].replace(/\s*-\s*メルカリ\s*$/, "").trim() : "";
      const sellerMatch = /出品者[\s\S]*?\[([^\]]+)\]/.exec(markdown);
      const dimensions = parseDimensions(description);

      const updates: Record<string, unknown> = {
        mercariImages: JSON.stringify(finalImages.slice(0, 10)),
        updatedAt: new Date().toISOString(),
      };
      if (description.length > 20) updates.mercariDescription = description;
      if (title && title.length > 3 && title !== item.mercariTitle) updates.mercariTitle = title;
      if (price && price > 0) updates.mercariPrice = price;
      if (sellerMatch) updates.mercariSeller = sellerMatch[1];
      if (dimensions.weightG) updates.weightG = dimensions.weightG;
      if (dimensions.lengthCm) updates.lengthCm = dimensions.lengthCm;
      if (dimensions.widthCm) updates.widthCm = dimensions.widthCm;
      if (dimensions.heightCm) updates.heightCm = dimensions.heightCm;

      await db.update(schema.items).set(updates).where(eq(schema.items.id, item.id));
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: remaining[0].count - processed, errors };
}

/**
 * 画像が少ないアイテムに対してHEAD推測で複数画像を取得
 * 本当に1枚しかないアイテムもあるので、チェック済みフラグ代わりに
 * 既存URLの高解像度版に統一して更新する（再実行防止）
 */
export async function batchInferImages(batchSize: number) {
  // 画像が1枚以下のアイテム（高解像度の_2がない）
  const items = await db.query.items.findMany({
    where: and(
      eq(schema.items.mercariStatus, "available"),
      sql`${schema.items.mercariImages} NOT LIKE '%detail/orig/photos/%_2%'`
    ),
    limit: Math.max(batchSize, 20), // 1枚しかないアイテムも多いので大きめ
  });

  const remainingResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      sql`${schema.items.mercariImages} NOT LIKE '%detail/orig/photos/%_2%'`
    ));

  const errors: string[] = [];
  let processed = 0;

  for (const item of items) {
    if (!item.mercariId) continue;
    try {
      let existingImages: string[] = [];
      try { existingImages = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }

      const newImages = await inferMercariImages(item.mercariId, existingImages);

      // 新しい画像が増えた場合、または高解像度URLに統一する場合に更新
      // 更新することで次回のクエリから除外される（detail/orig/photos/_1 が入るため）
      const hasDetailUrl = newImages.some(u => u.includes("detail/orig/photos/"));
      if (newImages.length > existingImages.length || (!existingImages.some(u => u.includes("detail/orig/photos/")) && hasDetailUrl)) {
        await db.update(schema.items).set({
          mercariImages: JSON.stringify(newImages.slice(0, 10)),
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.items.id, item.id));
      } else {
        // 本当に1枚しかないが、高解像度URLで更新して再処理対象から除外
        const detailUrl = `https://static.mercdn.net/item/detail/orig/photos/${item.mercariId}_1.jpg`;
        const withDetail = [detailUrl, ...existingImages.filter(u => u !== detailUrl)];
        await db.update(schema.items).set({
          mercariImages: JSON.stringify(withDetail.slice(0, 10)),
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.items.id, item.id));
      }
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: Math.max(0, remainingResult[0].count - items.length), errors };
}

async function batchProcessImages(batchSize: number) {
  const items = await db.query.items.findMany({
    where: and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.processedImages)
    ),
    limit: batchSize,
  });

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.processedImages)
    ));

  const errors: string[] = [];
  let processed = 0;

  for (const item of items) {
    try {
      let imageUrls: string[] = [];
      try { imageUrls = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }
      if (imageUrls.length === 0) continue;

      const processedPaths = await processItemImages(item.id, imageUrls);
      await db.update(schema.items).set({
        processedImages: JSON.stringify(processedPaths),
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.items.id, item.id));
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: remaining[0].count - processed, errors };
}

async function batchCalculateCosts(batchSize: number) {
  const items = await db.query.items.findMany({
    where: and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.shippingCostUsd)
    ),
    limit: batchSize,
  });

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.shippingCostUsd)
    ));

  const errors: string[] = [];
  let processed = 0;
  const exchangeRate = await getExchangeRate().catch(() => FALLBACK_USD_TO_JPY);

  for (const item of items) {
    try {
      const costs = calculateCosts({
        mercariPriceJpy: item.mercariPrice,
        weightG: item.weightG,
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        kabutoCategory: item.kabutoCategory,
        exchangeRate,
      });

      await db.update(schema.items).set({
        shippingCostUsd: costs.shippingCostUsd,
        customsDutyUsd: costs.customsDutyUsd,
        ebayFeeUsd: costs.ebayFeeUsd,
        adCostUsd: costs.adCostUsd,
        ebayPriceUsd: costs.suggestedPriceUsd,
        estimatedProfitUsd: costs.profitUsd,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.items.id, item.id));
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: remaining[0].count - processed, errors };
}

/**
 * 未分類アイテムをルールベースで自動分類
 */
async function batchClassify(batchSize: number) {
  const { classifyByRules } = await import("@/lib/kabuto/classifier");
  const { getCategory } = await import("@/lib/kabuto/categories");

  const items = await db.query.items.findMany({
    where: and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.kabutoCategory)
    ),
    limit: batchSize,
  });

  const remainingResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.kabutoCategory)
    ));

  const errors: string[] = [];
  let processed = 0;

  for (const item of items) {
    try {
      const result = classifyByRules(
        item.mercariTitle,
        item.mercariDescription || "",
        item.mercariPrice
      );
      const category = getCategory(result.category);

      const updates: Record<string, unknown> = {
        kabutoCategory: result.category,
        kabutoCategoryConfidence: result.confidence,
        ebayAspects: JSON.stringify(category.defaultAspects),
        updatedAt: new Date().toISOString(),
      };

      // 重量・サイズが未設定ならカテゴリデフォルトを適用
      if (!item.weightG) updates.weightG = category.defaultWeightG;
      if (!item.lengthCm) updates.lengthCm = category.defaultDimensions.lengthCm;
      if (!item.widthCm) updates.widthCm = category.defaultDimensions.widthCm;
      if (!item.heightCm) updates.heightCm = category.defaultDimensions.heightCm;

      await db.update(schema.items).set(updates).where(eq(schema.items.id, item.id));
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: Math.max(0, remainingResult[0].count - processed), errors };
}
