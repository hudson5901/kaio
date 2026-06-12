import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { getExchangeRate } from "@/lib/exchange-rate";
import { processItemImages } from "@/lib/image/processor";
import { parseDimensions } from "@/lib/mercari/parser";

export const maxDuration = 300;

const JINA_BASE = "https://r.jina.ai/";
const FALLBACK_USD_TO_JPY = 155;

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

/**
 * バッチ処理 API
 *
 * POST /api/process
 * body: { action: "fetch_details" | "process_images" | "calculate_costs" | "all", batchSize?: number }
 *
 * "all" は fetch_details → process_images → calculate_costs を順番に実行
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "all";
  const batchSize = Math.min(body.batchSize || 5, 20);

  const result: Record<string, unknown> = { action, processed: 0, remaining: 0, errors: [] as string[] };

  try {
    if (action === "fetch_details" || action === "all") {
      const r = await batchFetchDetails(batchSize);
      result.detailsFetched = r.processed;
      result.detailsRemaining = r.remaining;
      (result.errors as string[]).push(...r.errors);
      result.processed = (result.processed as number) + r.processed;
      result.remaining = Math.max(result.remaining as number, r.remaining);
    }

    if (action === "process_images" || action === "all") {
      const r = await batchProcessImages(batchSize);
      result.imagesProcessed = r.processed;
      result.imagesRemaining = r.remaining;
      (result.errors as string[]).push(...r.errors);
      result.processed = (result.processed as number) + r.processed;
      result.remaining = Math.max(result.remaining as number, r.remaining);
    }

    if (action === "calculate_costs" || action === "all") {
      const r = await batchCalculateCosts(batchSize);
      result.costsCalculated = r.processed;
      result.costsRemaining = r.remaining;
      (result.errors as string[]).push(...r.errors);
      result.processed = (result.processed as number) + r.processed;
      result.remaining = Math.max(result.remaining as number, r.remaining);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), ...result }, { status: 500 });
  }
}

/** 未処理アイテム数を返す */
export async function GET() {
  const noDescription = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      or(isNull(schema.items.mercariDescription), eq(schema.items.mercariDescription, ""))
    ));

  const noImages = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.processedImages)
    ));

  const noCosts = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      isNull(schema.items.shippingCostUsd)
    ));

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(eq(schema.items.mercariStatus, "available"));

  return NextResponse.json({
    total: total[0].count,
    needsDetails: noDescription[0].count,
    needsImages: noImages[0].count,
    needsCosts: noCosts[0].count,
  });
}

/** 詳細未取得のアイテムをバッチ処理 */
async function batchFetchDetails(batchSize: number) {
  const items = await db.query.items.findMany({
    where: and(
      eq(schema.items.mercariStatus, "available"),
      or(isNull(schema.items.mercariDescription), eq(schema.items.mercariDescription, ""))
    ),
    limit: batchSize,
  });

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(and(
      eq(schema.items.mercariStatus, "available"),
      or(isNull(schema.items.mercariDescription), eq(schema.items.mercariDescription, ""))
    ));

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

      // 画像抽出
      const imageUrls: string[] = [];
      const imgPatterns = [
        /(https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/[^\s)"]+)/g,
        /(https:\/\/static\.mercdn\.net\/thumb\/photos\/[^\s)"]+)/g,
        /!\[.*?\]\((https:\/\/static\.mercdn\.net\/[^\s)]+)\)/g,
      ];
      for (const pattern of imgPatterns) {
        if (imageUrls.length >= 10) break;
        let m;
        while ((m = pattern.exec(markdown)) !== null && imageUrls.length < 10) {
          const u = m[1];
          if (!imageUrls.includes(u) && !u.includes("/avatar/") && !u.includes("/icon/")) {
            imageUrls.push(u);
          }
        }
      }

      // 既存サムネイルを保持
      let existingImages: string[] = [];
      try { existingImages = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }
      const finalImages = imageUrls.length > 0 ? imageUrls : existingImages;
      // サムネイルをフォールバック追加
      for (const img of existingImages) {
        if (!finalImages.includes(img)) finalImages.push(img);
      }

      // 価格
      let price = item.mercariPrice;
      if (!price || price === 0) {
        const jpyMatch = /[¥￥]\s?([\d,]+)/.exec(markdown);
        const usdMatch = /US\$(\d+[\d,.]*)/i.exec(markdown);
        if (jpyMatch) price = parseInt(jpyMatch[1].replace(/,/g, ""), 10);
        else if (usdMatch) price = Math.round(parseFloat(usdMatch[1].replace(/,/g, "")) * usdToJpy);
      }

      // 説明文
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

      // タイトル
      const titleMatch = /^#\s+(.+)$/m.exec(markdown);
      let title = titleMatch ? titleMatch[1].replace(/\s*-\s*メルカリ\s*$/, "").trim() : "";

      // 出品者
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

/** 画像未処理のアイテムをバッチ処理 */
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

/** 費用未計算のアイテムをバッチ処理 */
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

  const { recalculateForItem } = await import("@/lib/shipping/recalc-item");
  const errors: string[] = [];
  let processed = 0;

  for (const item of items) {
    try {
      const { update } = await recalculateForItem(item);
      await db.update(schema.items).set(update).where(eq(schema.items.id, item.id));
      processed++;
    } catch (err) {
      errors.push(`${item.mercariId}: ${err}`);
    }
  }

  return { processed, remaining: remaining[0].count - processed, errors };
}
