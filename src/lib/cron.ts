/**
 * Cron ジョブ: 在庫監視
 *
 * Next.js の Route Handler から呼び出されるか、
 * 別プロセスとして実行する。
 *
 * 使い方:
 *   npx tsx src/lib/cron.ts
 *
 * または API Route (POST /api/sync) を定期的にcurlで叩く:
 *   crontab -e
 *   0,30 * * * * curl -X POST http://localhost:3000/api/sync
 */

import cron from "node-cron";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function syncInventory() {
  console.log(`[${new Date().toISOString()}] 在庫同期開始...`);

  try {
    const res = await fetch(`${BASE_URL}/api/sync`, { method: "POST" });
    const data = await res.json();
    console.log(
      `[${new Date().toISOString()}] 同期完了:`,
      `チェック ${data.checked}件,`,
      `売り切れ ${data.soldOnMercari}件,`,
      `eBay削除 ${data.removedFromEbay}件`
    );
    if (data.errors.length > 0) {
      console.log("エラー:", data.errors);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] 同期エラー:`, err);
  }
}

// 30分ごとに実行
cron.schedule("*/30 * * * *", syncInventory);

console.log("在庫監視クーロン開始（30分ごと）");
console.log("最初の同期を実行します...");
syncInventory();
