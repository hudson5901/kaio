import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { isNull, eq } from "drizzle-orm";
import { scoreItem } from "@/lib/ai/scorer";

export const maxDuration = 300;

export async function POST() {
  const unscored = await db
    .select()
    .from(schema.items)
    .where(isNull(schema.items.aiScore));

  let scored = 0;
  for (const item of unscored) {
    try {
      let imageCount = 0;
      try {
        imageCount = item.mercariImages
          ? JSON.parse(item.mercariImages).length
          : 0;
      } catch {
        // ignore parse error
      }

      const result = await scoreItem({
        title: item.mercariTitle,
        description: item.mercariDescription,
        priceJpy: item.mercariPrice,
        imageCount,
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        weightG: item.weightG,
      });

      await db
        .update(schema.items)
        .set({
          aiScore: result.score,
          aiScoreReason: result.reason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.items.id, item.id));

      scored++;
      // Rate limit
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Score failed for ${item.id}:`, err);
    }
  }

  return NextResponse.json({ scored, total: unscored.length });
}
