import { NextResponse } from "next/server";
import { scrapeMercari } from "@/lib/mercari/scraper";
import { createNotification } from "@/lib/notifications";

// 200件取得は時間がかかるのでタイムアウトを延長
export const maxDuration = 300; // 5分

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keyword = body.keyword || "刀 日本刀";
    const maxItems = body.maxItems || 20;
    const fetchDetails = body.fetchDetails ?? (maxItems <= 30);

    const result = await scrapeMercari(keyword, maxItems, fetchDetails);

    if (result.added > 0) {
      await createNotification("new_items", "スクレイプ完了", `「${keyword}」で${result.added}件の新規アイテムを取得しました`);
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
