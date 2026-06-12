import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const ebayStatus = searchParams.get("ebayStatus");
  const idsOnly = searchParams.get("ids_only") === "true";

  // IDのみ返す軽量エンドポイント
  if (idsOnly) {
    const rows = await db
      .select({ id: schema.items.id })
      .from(schema.items)
      .orderBy(desc(schema.items.createdAt));
    return NextResponse.json(rows.map((r) => r.id));
  }

  let query = db.select().from(schema.items);

  if (status) {
    query = query.where(eq(schema.items.mercariStatus, status as "available" | "sold" | "deleted")) as typeof query;
  }
  if (ebayStatus) {
    query = query.where(eq(schema.items.ebayStatus, ebayStatus as "draft" | "listed" | "sold" | "removed")) as typeof query;
  }

  const items = await query.orderBy(desc(schema.items.createdAt));

  return NextResponse.json(items);
}

/**
 * POST /api/items - バッチ操作
 * { action: "refresh_images" } - 画像1枚のアイテムの画像を再取得
 * { action: "recalculate_costs" } - 全アイテムの費用再計算
 */
export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action;

  if (action === "refresh_images") {
    const items = await db.select({
      id: schema.items.id,
      mercariId: schema.items.mercariId,
      mercariImages: schema.items.mercariImages,
    }).from(schema.items);

    let updated = 0;
    for (const item of items) {
      if (!item.mercariId) continue;
      let images: string[] = [];
      try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }
      if (images.length >= 3) continue;

      // 並列HEADで画像推測
      const baseUrl = "https://static.mercdn.net/item/detail/orig/photos/";
      const candidates = Array.from({ length: 10 }, (_, i) => `${baseUrl}${item.mercariId}_${i + 1}.jpg`);
      const results = await Promise.allSettled(
        candidates.map(async (url) => {
          const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(1500) });
          return res.ok ? url : null;
        })
      );
      const validUrls = results
        .map(r => r.status === "fulfilled" ? r.value : null)
        .filter((u): u is string => u !== null);

      if (validUrls.length > images.length) {
        await db.update(schema.items).set({
          mercariImages: JSON.stringify(validUrls),
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.items.id, item.id));
        updated++;
      }
    }

    return NextResponse.json({ success: true, updated, total: items.length });
  }

  if (action === "recalculate_costs") {
    const { recalculateForItem } = await import("@/lib/shipping/recalc-item");
    const items = await db.select().from(schema.items);
    let updated = 0;
    let exchangeRate = 155;

    for (const item of items) {
      const { costs, update } = await recalculateForItem(item);
      exchangeRate = costs.exchangeRate;
      await db.update(schema.items).set(update).where(eq(schema.items.id, item.id));
      updated++;
    }

    return NextResponse.json({ success: true, updated, exchangeRate });
  }

  if (action === "fetch_all_details") {
    // 説明文がないアイテムの詳細をJinaで取得（1件2秒、タイムアウトまで）
    const { parseDimensions } = await import("@/lib/mercari/parser");
    const items = await db.select({
      id: schema.items.id,
      mercariId: schema.items.mercariId,
      mercariDescription: schema.items.mercariDescription,
    }).from(schema.items);

    const needsDetail = items.filter(i => i.mercariId && (!i.mercariDescription || i.mercariDescription.length < 10));
    let updated = 0;
    const errors: string[] = [];
    const startTime = Date.now();
    const TIMEOUT = 270_000; // 4.5分で打ち切り

    for (const item of needsDetail) {
      if (Date.now() - startTime > TIMEOUT) break;

      try {
        // レート制限
        if (updated > 0) await new Promise(r => setTimeout(r, 1500));

        const JINA_BASE = "https://r.jina.ai/";
        const url = `https://jp.mercari.com/item/${item.mercariId}`;
        const jinaRes = await fetch(`${JINA_BASE}${url}`, {
          headers: {
            Accept: "text/markdown",
            "X-Return-Format": "markdown",
            "X-Wait-For-Selector": "[data-testid=description]",
            "X-Timeout": "20",
          },
          signal: AbortSignal.timeout(25000),
        });
        if (!jinaRes.ok) { errors.push(`${item.mercariId}: ${jinaRes.status}`); continue; }
        const markdown = await jinaRes.text();

        // 説明文
        let description = "";
        const descMatch = /商品の説明\s*\n+([\s\S]*?)(?=\n##|\n---|\n\*\s*\*\s*\*|\n商品の情報)/.exec(markdown);
        if (descMatch) description = descMatch[1].trim();

        // サイズ
        const dimensions = parseDimensions(description);

        // 画像
        const imageUrls: string[] = [];
        const imgPatterns = [
          /(https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/[^\s)"']+)/g,
          /(https:\/\/static\.mercdn\.net\/c![^\s)"']*\/thumb\/photos\/[^\s)"']+)/g,
          /(https:\/\/static\.mercdn\.net\/thumb\/photos\/[^\s)"']+)/g,
        ];
        for (const pattern of imgPatterns) {
          if (imageUrls.length >= 10) break;
          let m;
          while ((m = pattern.exec(markdown)) !== null && imageUrls.length < 10) {
            const u = m[1];
            if (u && !imageUrls.includes(u) && !u.includes("/avatar/") && !u.includes("/icon/")) imageUrls.push(u);
          }
        }

        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (description.length > 10) updates.mercariDescription = description;
        if (dimensions.weightG) updates.weightG = dimensions.weightG;
        if (dimensions.lengthCm) updates.lengthCm = dimensions.lengthCm;
        if (dimensions.widthCm) updates.widthCm = dimensions.widthCm;
        if (dimensions.heightCm) updates.heightCm = dimensions.heightCm;
        if (imageUrls.length > 0) updates.mercariImages = JSON.stringify(imageUrls.slice(0, 10));

        // カテゴリー・状態
        const catMatch = /###\s*カテゴリー\s*\n([\s\S]*?)(?=\n###|\n##|\n---)/.exec(markdown);
        if (catMatch) {
          const links: string[] = [];
          let lm;
          const lp = /\[([^\]]+)\]\([^)]+\)/g;
          while ((lm = lp.exec(catMatch[1])) !== null) { if (!lm[1].startsWith("Image")) links.push(lm[1].trim()); }
          if (links.length > 0) updates.mercariCategory = links.join(" > ");
        }
        const condMatch = /###\s*商品の状態\s*\n\s*(.+)/.exec(markdown);
        if (condMatch) updates.mercariCondition = condMatch[1].trim();

        await db.update(schema.items).set(updates).where(eq(schema.items.id, item.id));
        updated++;
        console.log(`[詳細取得] ${updated}/${needsDetail.length} ${item.mercariId}`);
      } catch (err) {
        errors.push(`${item.mercariId}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      remaining: needsDetail.length - updated,
      errors: errors.slice(0, 10),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
