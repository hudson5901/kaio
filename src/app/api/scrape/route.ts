import { NextResponse } from "next/server";
import { scrapeMercari } from "@/lib/mercari/scraper";
import { createNotification } from "@/lib/notifications";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { parseDimensions } from "@/lib/mercari/parser";

// 200件取得は時間がかかるのでタイムアウトを延長
export const maxDuration = 300; // 5分

async function fetchDetailsBackground(_addedCount: number) { // eslint-disable-line @typescript-eslint/no-unused-vars
  // スクレイプ完了後、説明文がないアイテムのdetailsをJinaで取得
  const items = await db.select({
    id: schema.items.id,
    mercariId: schema.items.mercariId,
    mercariDescription: schema.items.mercariDescription,
  }).from(schema.items);

  const needsDetail = items.filter(i => i.mercariId && (!i.mercariDescription || i.mercariDescription.length < 10));
  if (needsDetail.length === 0) return;

  let updated = 0;
  const startTime = Date.now();
  const TIMEOUT = 240_000; // 4分

  for (const item of needsDetail) {
    if (Date.now() - startTime > TIMEOUT) break;

    try {
      if (updated > 0) await new Promise(r => setTimeout(r, 1500));

      const url = `https://jp.mercari.com/item/${item.mercariId}`;
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Accept: "text/markdown",
          "X-Return-Format": "markdown",
          "X-Wait-For-Selector": "[data-testid=description]",
          "X-Timeout": "20",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!jinaRes.ok) continue;
      const markdown = await jinaRes.text();

      let description = "";
      const descMatch = /商品の説明\s*\n+([\s\S]*?)(?=\n##|\n---|\n\*\s*\*\s*\*|\n商品の情報)/.exec(markdown);
      if (descMatch) description = descMatch[1].trim();

      const dimensions = parseDimensions(description);
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
    } catch { /* skip */ }
  }

  if (updated > 0) {
    await createNotification("new_items", "説明文取得完了", `${updated}件のアイテムの説明文を取得しました（残り${needsDetail.length - updated}件）`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keyword = body.keyword || "刀 日本刀";
    const maxItems = body.maxItems || 20;
    const fetchDetails = body.fetchDetails ?? (maxItems <= 30);
    const autoFetchDescriptions = body.autoFetchDescriptions ?? true;

    const result = await scrapeMercari(keyword, maxItems, fetchDetails);

    if (result.added > 0) {
      await createNotification("new_items", "スクレイプ完了", `「${keyword}」で${result.added}件の新規アイテムを取得しました`);
    }

    // スクレイプ後に説明文を自動取得（残り時間で）
    if (autoFetchDescriptions && !fetchDetails && result.added > 0) {
      try {
        await fetchDetailsBackground(result.added);
      } catch { /* ignore timeout */ }
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    await createNotification("error", "スクレイプエラー", `スクレイプ中にエラー: ${String(error).slice(0, 200)}`);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
