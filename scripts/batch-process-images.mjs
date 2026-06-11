// 「出品」判定アイテムの画像を一括処理するスクリプト
// Usage: node scripts/batch-process-images.mjs

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  // 全アイテム取得
  const res = await fetch(`${BASE}/api/items`);
  const items = await res.json();

  // 出品判定 & 画像未処理のものを抽出
  const listed = items.filter(i => i.decision === "list");
  const needProcessing = listed.filter(i => {
    if (!i.processedImages) return true;
    try {
      const parsed = JSON.parse(i.processedImages);
      return parsed.length === 0;
    } catch { return true; }
  });

  console.log(`出品判定: ${listed.length}件`);
  console.log(`画像未処理: ${needProcessing.length}件`);

  if (needProcessing.length === 0) {
    console.log("全件処理済みです");
    return;
  }

  // 1件ずつ順番に処理（並列にすると重いため）
  for (let i = 0; i < needProcessing.length; i++) {
    const item = needProcessing[i];
    const title = (item.mercariTitle || "").slice(0, 40);
    console.log(`\n[${i + 1}/${needProcessing.length}] ${title}...`);

    try {
      const r = await fetch(`${BASE}/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_images" }),
      });

      if (r.ok) {
        console.log(`  -> OK`);
      } else {
        const err = await r.text();
        console.log(`  -> FAIL (${r.status}): ${err.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  -> ERROR: ${e.message}`);
    }
  }

  console.log("\n完了");
}

main().catch(e => { console.error(e); process.exit(1); });
