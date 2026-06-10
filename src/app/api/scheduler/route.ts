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
  const body = await request.json();

  switch (body.action) {
    case "start":
      startScheduler(body.intervalMinutes || 60);
      return NextResponse.json({ ok: true, ...getSchedulerState() });

    case "stop":
      stopScheduler();
      return NextResponse.json({ ok: true, ...getSchedulerState() });

    case "run_now":
      runSyncNow();
      return NextResponse.json({ ok: true, message: "同期開始" });

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
