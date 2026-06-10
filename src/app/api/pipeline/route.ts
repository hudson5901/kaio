import { NextResponse } from "next/server";
import { getState, resetState, abort, setRunning } from "@/lib/pipeline/state";
import { runServerPipeline, runSingleStep } from "@/lib/pipeline/runner";

/**
 * GET /api/pipeline - パイプラインの状態を取得
 */
export async function GET() {
  return NextResponse.json(getState());
}

/**
 * POST /api/pipeline - パイプラインを開始/停止
 * body: { action: "start" | "stop" | "run_step", keyword?, maxItems?, autoProcess?, stepId?, stepAction? }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "stop") {
    abort();
    return NextResponse.json({ success: true, message: "Pipeline abort requested" });
  }

  if (action === "run_step") {
    const state = getState();
    if (state.running) {
      return NextResponse.json({ error: "Pipeline already running" }, { status: 409 });
    }

    const stepId = body.stepId as string;
    const stepAction = body.stepAction as string;
    if (!stepId || !stepAction) {
      return NextResponse.json({ error: "stepId and stepAction required" }, { status: 400 });
    }

    resetState("", 0, false);
    // Mark other steps as skipped
    const { updateStep } = await import("@/lib/pipeline/state");
    for (const id of ["scrape", "details", "images", "costs"]) {
      if (id !== stepId) updateStep(id, { status: "skipped" });
    }

    // Fire-and-forget: runs in background
    runSingleStep(stepId, stepAction).catch(console.error);

    return NextResponse.json({ success: true, message: `Step ${stepId} started` });
  }

  // action === "start" (default)
  const state = getState();
  if (state.running) {
    return NextResponse.json({ error: "Pipeline already running" }, { status: 409 });
  }

  const keyword = body.keyword || "兜 甲冑";
  const maxItems = Math.min(body.maxItems || 50, 500);
  const autoProcess = body.autoProcess ?? true;

  resetState(keyword, maxItems, autoProcess);

  // Fire-and-forget: runs in background on the server
  runServerPipeline(keyword, maxItems, autoProcess).catch((err) => {
    console.error("Pipeline failed:", err);
    setRunning(false);
  });

  return NextResponse.json({ success: true, message: "Pipeline started" });
}
