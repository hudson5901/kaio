import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { isNull, eq } from "drizzle-orm";
import { classifyItem } from "@/lib/kabuto/classifier";

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

      // カテゴリと判定信頼度のみ保存。寸法・重量・aspects はデフォルト値を
      // DB に書き込まず、実測 or 手入力されるまで null のまま。
      await db.update(schema.items).set({
        kabutoCategory: result.category,
        kabutoCategoryConfidence: result.confidence,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.items.id, item.id));
      classified++;
      console.log(`[分類] ${classified}/${unclassified.length} ${item.mercariTitle}`);

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
