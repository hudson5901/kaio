import { NextResponse } from "next/server";
import { runSyncBatch } from "@/lib/sync";

/**
 * POST /api/sync - 在庫同期（バッチ処理）
 * ?batch=30 でバッチサイズ変更可（デフォルト20、最大50）
 *
 * hasMore=true の場合、クライアント側で再呼び出しして続きを処理する
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(
    parseInt(searchParams.get("batch") || "20") || 20,
    50
  );

  const results = await runSyncBatch(batchSize);
  return NextResponse.json(results);
}
