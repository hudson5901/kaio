// 「出品」判定アイテムの文言を一括再生成するスクリプト
// Usage: node scripts/batch-regenerate-listings.mjs [--retry-generic]

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DELAY_MS = 4000; // レート制限対策: 4秒間隔
const retryGeneric = process.argv.includes("--retry-generic");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const res = await fetch(`${BASE}/api/items`);
  const items = await res.json();

  let targets = items.filter(i => i.decision === "list");

  if (retryGeneric) {
    // 汎用タイトルのもののみ再処理
    const genericTitles = ["Japanese Kabuto Samurai Helmet", "Japanese Yoroi Samurai Armor", ""];
    targets = targets.filter(i => !i.ebayTitle || genericTitles.includes(i.ebayTitle) || i.ebayTitle.length < 35);
    console.log(`汎用タイトル再処理: ${targets.length}件`);
  } else {
    console.log(`出品判定: ${targets.length}件 — 全件文言再生成`);
  }

  if (targets.length === 0) {
    console.log("対象なし");
    return;
  }

  let ok = 0;
  let fail = 0;
  let fallback = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const title = (item.mercariTitle || "").slice(0, 40);
    process.stdout.write(`[${i + 1}/${targets.length}] ${title}...`);

    try {
      const r = await fetch(`${BASE}/api/items/${item.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (r.ok) {
        const data = await r.json();
        if (data.fallback) {
          console.log(` FALLBACK — "${(data.title || "").slice(0, 50)}"`);
          fallback++;
        } else {
          console.log(` OK — "${(data.title || "").slice(0, 50)}"`);
          ok++;
        }
      } else {
        const err = await r.text();
        console.log(` FAIL (${r.status}): ${err.slice(0, 80)}`);
        fail++;
      }
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
      fail++;
    }

    // レート制限対策
    if (i < targets.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n完了: AI生成 ${ok}件, フォールバック ${fallback}件, 失敗 ${fail}件`);
}

main().catch(e => { console.error(e); process.exit(1); });
