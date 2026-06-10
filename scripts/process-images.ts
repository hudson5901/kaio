/**
 * ローカル画像処理バッチスクリプト
 *
 * 使い方: npx tsx scripts/process-images.ts [--limit N] [--force]
 *
 * --limit N  : 処理するアイテム数（デフォルト: 5）
 * --force    : 既に処理済みのアイテムも再処理
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, isNull, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { processItemImages } from "../src/lib/image/processor";

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 5;
const force = args.includes("--force");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  // 未処理アイテムを取得
  const where = force
    ? eq(schema.items.mercariStatus, "available")
    : and(
        eq(schema.items.mercariStatus, "available"),
        isNull(schema.items.processedImages)
      );

  const items = await db.query.items.findMany({ where, limit });

  const totalCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(where);

  console.log(`Found ${totalCount[0].count} items needing processing (batch: ${items.length})`);

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    const imageUrls: string[] = item.mercariImages
      ? JSON.parse(item.mercariImages)
      : [];

    if (imageUrls.length === 0) {
      console.log(`[${item.mercariId}] No images, skipping`);
      continue;
    }

    console.log(`\n[${item.mercariId}] Processing ${imageUrls.length} images...`);
    const start = Date.now();

    try {
      const processedPaths = await processItemImages(item.id, imageUrls);

      await db
        .update(schema.items)
        .set({
          processedImages: JSON.stringify(processedPaths),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.items.id, item.id));

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[${item.mercariId}] Done: ${processedPaths.length} images in ${elapsed}s`);
      processed++;
    } catch (err) {
      console.error(`[${item.mercariId}] Failed:`, err);
      errors++;
    }
  }

  console.log(`\nComplete: ${processed} processed, ${errors} errors`);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
