/**
 * 全アイテムの費用を新計算式 (FedEx + 売上税6% + DDP関税) で再計算して DB を更新
 *
 * 使い方:
 *   npx tsx scripts/recalculate-all-costs.ts                # 全件
 *   npx tsx scripts/recalculate-all-costs.ts --concurrency 5
 *   npx tsx scripts/recalculate-all-costs.ts --dry-run      # DB 書き換えなしで集計のみ
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { calculateCostsWithLiveRate } from "../src/lib/shipping/calculator";
import { getSettings } from "../src/lib/settings";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency =
  concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 5;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const settings = await getSettings();
  console.log(`[Settings] fee=${settings.ebayFeePercent}% ad=${settings.adPercent}% customs=${settings.customsDutyPercent}% tax=${settings.salesTaxPercent}% margin=${settings.profitMarginPercent}%`);
  console.log(`[Mode] ${dryRun ? "DRY RUN" : "LIVE UPDATE"} | concurrency=${concurrency}`);

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  const items = await db.query.items.findMany();
  console.log(`Found ${items.length} items`);

  let updated = 0;
  let errors = 0;
  let flippedToLoss = 0;
  let flippedToProfit = 0;
  let stillProfit = 0;
  let stillLoss = 0;
  let nextIndex = 0;
  const startAll = Date.now();

  async function worker(workerId: number) {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      const item = items[idx];

      try {
        const common = {
          mercariPriceJpy: item.mercariPrice,
          weightG: item.weightG,
          lengthCm: item.lengthCm,
          widthCm: item.widthCm,
          heightCm: item.heightCm,
          kabutoCategory: item.kabutoCategory,
          ebayFeeRate: settings.ebayFeePercent / 100,
          adRate: settings.adPercent / 100,
          customsRate: settings.customsDutyPercent / 100,
          salesTaxRate: settings.salesTaxPercent / 100,
          profitMargin: settings.profitMarginPercent / 100,
        };

        // 1. マージン下限（仕入 × profitMargin %）を満たす最低価格を逆算
        const floor = await calculateCostsWithLiveRate({
          ...common,
          ebayPriceUsd: null,
        });
        // 2. 既存価格 vs フロア価格の高い方を採用 (自動引き上げ)
        const finalPrice = Math.max(
          item.ebayPriceUsd ?? 0,
          floor.suggestedPriceUsd
        );
        // 3. 最終価格で正式な breakdown を計算
        const costs = await calculateCostsWithLiveRate({
          ...common,
          ebayPriceUsd: finalPrice,
        });

        const prevProfit = item.estimatedProfitUsd ?? 0;
        if (prevProfit >= 0 && costs.profitUsd < 0) flippedToLoss++;
        else if (prevProfit < 0 && costs.profitUsd >= 0) flippedToProfit++;
        else if (costs.profitUsd >= 0) stillProfit++;
        else stillLoss++;

        if (!dryRun) {
          await db
            .update(schema.items)
            .set({
              shippingCostUsd: costs.shippingCostUsd,
              customsDutyUsd: costs.customsDutyUsd,
              ebayFeeUsd: costs.ebayFeeUsd,
              adCostUsd: costs.adCostUsd,
              ebayPriceUsd: finalPrice,
              estimatedProfitUsd: costs.profitUsd,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.items.id, item.id));
        }
        updated++;

        if (updated % 100 === 0) {
          console.log(
            `[w${workerId}] ${updated}/${items.length} done (profit: ${stillProfit}+ ${flippedToProfit}↑ / loss: ${stillLoss}- ${flippedToLoss}↓)`
          );
        }
      } catch (err) {
        errors++;
        console.error(
          `[w${workerId}] FAIL item ${item.id} (${(item.mercariTitle || "").slice(0, 30)}):`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, (_, i) => worker(i + 1))
  );

  const elapsed = ((Date.now() - startAll) / 1000).toFixed(1);
  console.log("\n=== Summary ===");
  console.log(`Updated: ${updated} / ${items.length} (${errors} errors) in ${elapsed}s`);
  console.log(`  remained profit: ${stillProfit}`);
  console.log(`  remained loss: ${stillLoss}`);
  console.log(`  profit -> loss: ${flippedToLoss}  ⚠️`);
  console.log(`  loss -> profit: ${flippedToProfit}`);
  if (dryRun) console.log(`\n(dry-run: no DB writes)`);

  await client.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
