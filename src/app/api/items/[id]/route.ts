import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { calculateCostsWithLiveRate } from "@/lib/shipping/calculator";
import { getSettings } from "@/lib/settings";
import { parseDimensions } from "@/lib/mercari/parser";
import { getCurrentUser } from "@/lib/auth/current-user";

export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, id),
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, id),
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const action = body.action as string;

  // アクション別の処理
  switch (action) {
    case "process_images": {
      const imageUrls: string[] = item.mercariImages
        ? JSON.parse(item.mercariImages)
        : [];
      if (imageUrls.length === 0) {
        return NextResponse.json({ error: "No images to process" }, { status: 400 });
      }

      try {
        const { processItemImages } = await import("@/lib/image/processor");
        const processedPaths = await processItemImages(item.id, imageUrls);

        await db
          .update(schema.items)
          .set({
            processedImages: JSON.stringify(processedPaths),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, id));

        return NextResponse.json({ processedImages: processedPaths });
      } catch (err) {
        console.error(`Image processing failed for item ${id}:`, err);
        return NextResponse.json(
          { error: `Image processing failed: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 }
        );
      }
    }

    case "remove_processed_image": {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0) {
        return NextResponse.json({ error: "Invalid index" }, { status: 400 });
      }

      const current: string[] = item.processedImages
        ? JSON.parse(item.processedImages)
        : [];
      if (index >= current.length) {
        return NextResponse.json({ error: "Index out of range" }, { status: 400 });
      }

      const removedUrl = current[index];
      const next = current.filter((_, i) => i !== index);

      await db
        .update(schema.items)
        .set({
          processedImages: next.length > 0 ? JSON.stringify(next) : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.items.id, id));

      // Storage上の実ファイルも消す（失敗してもDB更新は成功扱い）
      try {
        const { removeProcessedImageFromStorage } = await import("@/lib/image/processor");
        await removeProcessedImageFromStorage(removedUrl);
      } catch (err) {
        console.warn(`Failed to delete storage file for ${removedUrl}:`, err);
      }

      return NextResponse.json({ processedImages: next });
    }

    case "calculate_costs": {
      const settings = await getSettings();
      const costs = await calculateCostsWithLiveRate({
        mercariPriceJpy: item.mercariPrice,
        ebayPriceUsd: item.ebayPriceUsd,
        weightG: item.weightG,
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        kabutoCategory: item.kabutoCategory,
        ebayFeeRate: settings.ebayFeePercent / 100,
        adRate: settings.adPercent / 100,
        customsRate: settings.customsDutyPercent / 100,
        profitMargin: settings.profitMarginPercent / 100,
      });

      await db
        .update(schema.items)
        .set({
          shippingCostUsd: costs.shippingCostUsd,
          customsDutyUsd: costs.customsDutyUsd,
          ebayFeeUsd: costs.ebayFeeUsd,
          adCostUsd: costs.adCostUsd,
          ebayPriceUsd: costs.suggestedPriceUsd,
          estimatedProfitUsd: costs.profitUsd,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.items.id, id));

      return NextResponse.json(costs);
    }

    case "fetch_details": {
      if (!item.mercariId) {
        return NextResponse.json({ error: "No mercari ID" }, { status: 400 });
      }

      const JINA_BASE = "https://r.jina.ai/";
      const url = `https://jp.mercari.com/item/${item.mercariId}`;
      const jinaRes = await fetch(`${JINA_BASE}${url}`, {
        headers: {
          Accept: "text/markdown",
          "X-Return-Format": "markdown",
          "X-Wait-For-Selector": "[data-testid=description]",
          "X-Timeout": "30",
        },
      });
      if (!jinaRes.ok) {
        return NextResponse.json({ error: `Jina fetch failed: ${jinaRes.status}` }, { status: 500 });
      }
      const markdown = await jinaRes.text();

      // 説明文抽出
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

      // サイズパース
      const dimensions = parseDimensions(description);

      const detailUpdates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (description.length > 10) detailUpdates.mercariDescription = description;
      if (dimensions.weightG) detailUpdates.weightG = dimensions.weightG;
      if (dimensions.lengthCm) detailUpdates.lengthCm = dimensions.lengthCm;
      if (dimensions.widthCm) detailUpdates.widthCm = dimensions.widthCm;
      if (dimensions.heightCm) detailUpdates.heightCm = dimensions.heightCm;

      // 画像も更新
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
          if (u && !imageUrls.includes(u) && !u.includes("/avatar/") && !u.includes("/icon/")) {
            imageUrls.push(u);
          }
        }
      }
      if (imageUrls.length > 0) {
        detailUpdates.mercariImages = JSON.stringify(imageUrls.slice(0, 10));
      }

      // カテゴリー
      const categoryMatch = /###\s*カテゴリー\s*\n([\s\S]*?)(?=\n###|\n##|\n---)/.exec(markdown);
      if (categoryMatch) {
        const links: string[] = [];
        let lm;
        const lp = /\[([^\]]+)\]\([^)]+\)/g;
        while ((lm = lp.exec(categoryMatch[1])) !== null) {
          if (!lm[1].startsWith("Image")) links.push(lm[1].trim());
        }
        if (links.length > 0) detailUpdates.mercariCategory = links.join(" > ");
      }

      // 状態
      const condMatch = /###\s*商品の状態\s*\n\s*(.+)/.exec(markdown);
      if (condMatch) detailUpdates.mercariCondition = condMatch[1].trim();

      // 発送元
      const shipMatch = /###\s*発送元の地域\s*\n\s*(.+)/.exec(markdown);
      if (shipMatch) detailUpdates.mercariShippingFrom = shipMatch[1].trim();

      await db.update(schema.items).set(detailUpdates).where(eq(schema.items.id, id));

      return NextResponse.json({
        success: true,
        description: description.slice(0, 200),
        dimensions,
      });
    }

    case "list_on_ebay": {
      const { createEbayListing } = await import("@/lib/ebay/inventory");
      const result = await createEbayListing(item);
      return NextResponse.json(result);
    }

    case "remove_from_ebay": {
      const { removeEbayListing } = await import("@/lib/ebay/inventory");
      await removeEbayListing(item);
      return NextResponse.json({ success: true });
    }

    case "toggle_staff_check": {
      const checkKey = String(body.checkKey || "");
      const VALID_KEYS = ["images", "title", "description", "price", "weight"] as const;
      if (!VALID_KEYS.includes(checkKey as typeof VALID_KEYS[number])) {
        return NextResponse.json({ error: "Invalid checkKey" }, { status: 400 });
      }

      const currentUser = await getCurrentUser();
      if (!currentUser) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const userId = currentUser.id;

      type StaffChecks = Record<string, Record<string, string>>;
      const checks: StaffChecks = item.staffChecks ? JSON.parse(item.staffChecks) : {};
      const forKey = checks[checkKey] || {};
      if (forKey[userId]) {
        delete forKey[userId];
      } else {
        forKey[userId] = new Date().toISOString();
      }
      checks[checkKey] = forKey;

      // AI判定状況（データ存在ベース）
      const processedImages: string[] = item.processedImages ? JSON.parse(item.processedImages) : [];
      const aiStatus: Record<string, boolean> = {
        images: processedImages.length > 0,
        title: !!item.ebayTitle,
        description: !!item.ebayDescription,
        price: !!item.ebayPriceUsd,
        weight: !!item.weightG,
      };

      // 全スタッフ取得
      const staffUsers = await db.select({ id: schema.users.id }).from(schema.users);
      const staffIds = staffUsers.map((u) => u.id);

      // 全員チェック判定: AI全項目OK & 全スタッフが全項目チェック済み
      const aiAllOk = VALID_KEYS.every((k) => aiStatus[k]);
      const staffAllOk =
        staffIds.length > 0 &&
        VALID_KEYS.every((k) => {
          const m = checks[k] || {};
          return staffIds.every((uid) => m[uid]);
        });

      let nextAllCheckedAt: string | null = item.allCheckedAt ?? null;
      let nextListingScheduledAt: string | null = item.listingScheduledAt ?? null;
      if (aiAllOk && staffAllOk) {
        if (!nextAllCheckedAt) {
          const now = new Date();
          nextAllCheckedAt = now.toISOString();
          const next = new Date(now);
          next.setDate(next.getDate() + 1);
          nextListingScheduledAt = next.toISOString().slice(0, 10);
        }
      } else {
        nextAllCheckedAt = null;
        nextListingScheduledAt = null;
      }

      await db.update(schema.items).set({
        staffChecks: JSON.stringify(checks),
        allCheckedAt: nextAllCheckedAt,
        listingScheduledAt: nextListingScheduledAt,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.items.id, id));

      return NextResponse.json({
        staffChecks: checks,
        allCheckedAt: nextAllCheckedAt,
        listingScheduledAt: nextListingScheduledAt,
      });
    }

    default: {
      // 一般的な更新
      const allowedFields = [
        "ebayPriceUsd",
        "ebayTitle",
        "ebayDescription",
        "weightG",
        "lengthCm",
        "widthCm",
        "heightCm",
        "mercariStatus",
        "ebayStatus",
        "decision",
        "kabutoCategory",
        "kabutoCategoryConfidence",
        "ebayAspects",
      ];

      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }
      updates.updatedAt = new Date().toISOString();

      await db.update(schema.items).set(updates).where(eq(schema.items.id, id));

      // 「出品」判定された時、画像未処理なら自動で画像処理を実行（非同期・fire-and-forget）
      if (body.decision === "list" && item.decision !== "list") {
        const hasProcessed = item.processedImages && JSON.parse(item.processedImages).length > 0;
        if (!hasProcessed) {
          const imageUrls: string[] = item.mercariImages ? JSON.parse(item.mercariImages) : [];
          if (imageUrls.length > 0) {
            import("@/lib/image/processor").then(({ processItemImages }) =>
              processItemImages(item.id, imageUrls).then((paths) =>
                db.update(schema.items).set({
                  processedImages: JSON.stringify(paths),
                  updatedAt: new Date().toISOString(),
                }).where(eq(schema.items.id, id))
              )
            ).catch((err) => console.error(`Auto image processing failed for ${id}:`, err));
          }
        }
      }

      return NextResponse.json({ success: true });
    }
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await db.delete(schema.items).where(eq(schema.items.id, id));

  return NextResponse.json({ success: true });
}
