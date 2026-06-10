/**
 * アプリ内定期実行スケジューラー
 * Next.js のサーバーサイドで動作し、定期的に在庫同期を実行する
 */

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRun: string | null = null;
let nextRun: string | null = null;
let isRunning = false;
let intervalMinutes = 60; // デフォルト1時間

export interface SchedulerState {
  active: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

async function runSync() {
  if (isRunning) return;
  isRunning = true;

  try {
    console.log(`[スケジューラー] 在庫同期開始 ${new Date().toISOString()}`);

    // DB直接アクセスで同期処理を実行
    const { db, schema } = await import("@/lib/db");
    const { eq, and, ne } = await import("drizzle-orm");
    const { checkMercariAvailability } = await import("@/lib/mercari/scraper");
    const { removeEbayListing } = await import("@/lib/ebay/inventory");
    const { v4: uuid } = await import("uuid");

    const activeItems = await db
      .select()
      .from(schema.items)
      .where(
        and(
          eq(schema.items.mercariStatus, "available"),
          ne(schema.items.ebayStatus, "removed")
        )
      );

    let soldCount = 0;
    let deletedCount = 0;

    for (const item of activeItems) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const status = await checkMercariAvailability(item.mercariId!);

      if (status !== "available") {
        await db
          .update(schema.items)
          .set({
            mercariStatus: status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, item.id));

        if (status === "sold") {
          soldCount++;
          await db.insert(schema.notifications).values({
            id: uuid(),
            type: "sold",
            title: "メルカリで売り切れ",
            message: `「${item.mercariTitle}」(¥${item.mercariPrice.toLocaleString()}) がメルカリで売り切れました`,
            itemId: item.id,
          });
        } else {
          deletedCount++;
          await db.insert(schema.notifications).values({
            id: uuid(),
            type: "deleted",
            title: "メルカリから削除",
            message: `「${item.mercariTitle}」がメルカリから削除されました`,
            itemId: item.id,
          });
        }

        if (item.ebayStatus === "listed") {
          try {
            await removeEbayListing(item);
          } catch (err) {
            console.error(`[スケジューラー] eBay取り下げ失敗: ${err}`);
          }
        }
      }
    }

    lastRun = new Date().toISOString();
    console.log(
      `[スケジューラー] 同期完了: ${activeItems.length}件チェック, 売り切れ${soldCount}件, 削除${deletedCount}件`
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
  if (intervalId) return; // Already running

  if (minutes) intervalMinutes = minutes;

  nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
  intervalId = setInterval(runSync, intervalMinutes * 60 * 1000);

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

export function runSyncNow() {
  runSync();
}
