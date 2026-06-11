import { NextResponse } from "next/server";
import {
  startScheduler,
  stopScheduler,
  getSchedulerState,
  runSyncNow,
} from "@/lib/cron-scheduler";

/**
 * GET /api/scheduler - スケジューラー状態取得
 */
export async function GET() {
  return NextResponse.json(getSchedulerState());
}

/**
 * POST /api/scheduler - スケジューラー操作
 * { action: "start", intervalMinutes?: number }
 * { action: "stop" }
 * { action: "run_now" }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "start":
      startScheduler((body.intervalMinutes as number) || 60);
      return NextResponse.json({ ok: true, ...getSchedulerState() });

    case "stop":
      stopScheduler();
      return NextResponse.json({ ok: true, ...getSchedulerState() });

    case "run_now":
      // バックグラウンドで実行開始（レスポンスは即返す）
      runSyncNow().catch((err) => console.error("[scheduler] run_now error:", err));
      return NextResponse.json({ ok: true, message: "同期開始" });

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
