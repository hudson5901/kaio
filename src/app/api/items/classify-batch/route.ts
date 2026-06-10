import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { isNull, eq } from "drizzle-orm";
import { classifyItem } from "@/lib/kabuto/classifier";
import { getCategory } from "@/lib/kabuto/categories";

export const maxDuration = 300;

export async function POST() {
  const unclassified = await db
    .select()
    .from(schema.items)
    .where(isNull(schema.items.kabutoCategory));

  let classified = 0;
  const errors: string[] = [];

  for (const item of unclassified) {
    try {
      const result = await classifyItem(
        item.mercariTitle,
        item.mercariDescription || "",
        item.mercariPrice
      );

      const category = getCategory(result.category);

      const updates: Record<string, unknown> = {
        kabutoCategory: result.category,
        kabutoCategoryConfidence: result.confidence,
        ebayAspects: JSON.stringify(category.defaultAspects),
        updatedAt: new Date().toISOString(),
      };

      if (!item.weightG) updates.weightG = category.defaultWeightG;
      if (!item.lengthCm) updates.lengthCm = category.defaultDimensions.lengthCm;
      if (!item.widthCm) updates.widthCm = category.defaultDimensions.widthCm;
      if (!item.heightCm) updates.heightCm = category.defaultDimensions.heightCm;

      await db.update(schema.items).set(updates).where(eq(schema.items.id, item.id));
      classified++;
      console.log(`[分類] ${classified}/${unclassified.length} ${item.mercariTitle}`);

      // レート制限（AI使う場合があるため）
      if (result.method === "ai") {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      errors.push(`${item.mercariTitle}: ${err}`);
      console.error(`Classification failed for ${item.id}:`, err);
    }
  }

  return NextResponse.json({
    classified,
    total: unclassified.length,
    errors: errors.slice(0, 10),
  });
}
