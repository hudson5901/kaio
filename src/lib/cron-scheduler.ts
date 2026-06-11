/**
 * アプリ内定期実行スケジューラー
 * Next.js のサーバーサイドで動作し、定期的に在庫同期を実行する
 *
 * 注意: Vercel等サーバーレス環境ではsetIntervalは永続化されません。
 * ローカル開発 or VPS での使用を想定。
 */
import { runSyncBatch } from "@/lib/sync";

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRun: string | null = null;
let nextRun: string | null = null;
let isRunning = false;
let intervalMinutes = 60;

export interface SchedulerState {
  active: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

/**
 * 全件を20件バッチで順次処理
 */
async function runFullSync() {
  if (isRunning) return;
  isRunning = true;

  try {
    console.log(`[スケジューラー] 在庫同期開始 ${new Date().toISOString()}`);

    let totalChecked = 0;
    let totalSold = 0;
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await runSyncBatch(20);
      totalChecked += result.checked;
      totalSold += result.soldOnMercari;
      totalDeleted += result.deletedOnMercari;
      hasMore = result.hasMore;
    }

    lastRun = new Date().toISOString();
    console.log(
      `[スケジューラー] 同期完了: ${totalChecked}件チェック, 売り切れ${totalSold}件, 削除${totalDeleted}件`
    );
  } catch (err) {
    console.error(`[スケジューラー] エラー:`, err);
    try {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification("error", "自動同期エラー", `スケジューラー実行中にエラー: ${String(err).slice(0, 200)}`);
    } catch { /* ignore */ }
  } finally {
    isRunning = false;
    if (intervalId) {
      nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
    }
  }
}

export function startScheduler(minutes?: number) {
  if (intervalId) return;
  if (minutes) intervalMinutes = minutes;

  nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
  intervalId = setInterval(runFullSync, intervalMinutes * 60 * 1000);

  console.log(`[スケジューラー] 開始: ${intervalMinutes}分間隔`);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    nextRun = null;
    console.log(`[スケジューラー] 停止`);
  }
}

export function getSchedulerState(): SchedulerState {
  return {
    active: intervalId !== null,
    intervalMinutes,
    lastRun,
    nextRun,
    isRunning,
  };
}

export async function runSyncNow() {
  // await して完了を待つ（fire-and-forget しない）
  await runFullSync();
}
