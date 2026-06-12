/**
 * eBay 下書きアイテム (decision='list' AND ebay_status='draft') の画像を
 * 本番 PhotoRoom API で全件再処理するスクリプト
 *
 * 使い方:
 *   npx tsx scripts/process-draft-images.ts            # 未処理のみ
 *   npx tsx scripts/process-draft-images.ts --force    # 既処理も再処理
 *   npx tsx scripts/process-draft-images.ts --concurrency 3
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { processItemImages } from "../src/lib/image/processor";

const args = process.argv.slice(2);
const force = args.includes("--force");
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency =
  concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 3;

async function processItem(
  db: ReturnType<typeof drizzle<typeof schema>>,
  item: schema.Item
): Promise<{ ok: boolean; count: number; elapsed: number; error?: string }> {
  const imageUrls: string[] = item.mercariImages
    ? JSON.parse(item.mercariImages)
    : [];

  if (imageUrls.length === 0) {
    return { ok: false, count: 0, elapsed: 0, error: "no images" };
  }

  const start = Date.now();
  const processedPaths = await processItemImages(item.id, imageUrls);
  await db
    .update(schema.items)
    .set({
      processedImages: JSON.stringify(processedPaths),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.items.id, item.id));

  return {
    ok: processedPaths.length === imageUrls.length,
    count: processedPaths.length,
    elapsed: (Date.now() - start) / 1000,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }
  if (!process.env.PHOTOROOM_API_KEY) {
    console.error("PHOTOROOM_API_KEY is not set. Check .env.local");
    process.exit(1);
  }

  const isSandbox = process.env.PHOTOROOM_API_KEY.startsWith("sandbox_");
  console.log(
    `[PhotoRoom] mode=${isSandbox ? "SANDBOX" : "PRODUCTION"}, concurrency=${concurrency}, force=${force}`
  );

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  const where = force
    ? and(
        eq(schema.items.decision, "list"),
        eq(schema.items.ebayStatus, "draft")
      )
    : and(
        eq(schema.items.decision, "list"),
        eq(schema.items.ebayStatus, "draft"),
        isNull(schema.items.processedImages)
      );

  const items = await db.query.items.findMany({ where });
  console.log(`Found ${items.length} items to process`);

  if (items.length === 0) {
    await client.end();
    return;
  }

  let processed = 0;
  let errors = 0;
  let totalImages = 0;
  let nextIndex = 0;

  async function worker(workerId: number) {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      const item = items[idx];
      const title = (item.mercariTitle || "").slice(0, 30);
      const tag = `[${idx + 1}/${items.length} w${workerId}]`;
      console.log(`${tag} START ${title}`);
      try {
        const r = await processItem(db, item);
        if (r.error) {
          console.log(`${tag} SKIP ${title}: ${r.error}`);
        } else {
          console.log(
            `${tag} ${r.ok ? "OK" : "PARTIAL"} ${title} (${r.count} imgs, ${r.elapsed.toFixed(1)}s)`
          );
          processed++;
          totalImages += r.count;
        }
      } catch (err) {
        errors++;
        console.error(`${tag} FAIL ${title}:`, err);
      }
    }
  }

  const startAll = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, (_, i) => worker(i + 1))
  );
  const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);

  console.log(
    `\nDone: ${processed} items / ${totalImages} images processed, ${errors} errors in ${totalElapsed}s`
  );
  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
