import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { classifyItem } from "@/lib/kabuto/classifier";
import { getCategory, type KabutoCategory } from "@/lib/kabuto/categories";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, id),
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    const result = await classifyItem(
      item.mercariTitle,
      item.mercariDescription || "",
      item.mercariPrice
    );

    const category = getCategory(result.category);

    // DB更新: カテゴリ + デフォルト値適用
    const updates: Record<string, unknown> = {
      kabutoCategory: result.category,
      kabutoCategoryConfidence: result.confidence,
      ebayAspects: JSON.stringify(category.defaultAspects),
      updatedAt: new Date().toISOString(),
    };

    // 重量・サイズが未設定ならカテゴリデフォルトを適用
    if (!item.weightG) {
      updates.weightG = category.defaultWeightG;
    }
    if (!item.lengthCm) {
      updates.lengthCm = category.defaultDimensions.lengthCm;
    }
    if (!item.widthCm) {
      updates.widthCm = category.defaultDimensions.widthCm;
    }
    if (!item.heightCm) {
      updates.heightCm = category.defaultDimensions.heightCm;
    }

    await db.update(schema.items).set(updates).where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      category: result.category,
      categoryName: category.name,
      confidence: result.confidence,
      reason: result.reason,
      method: result.method,
      defaultsApplied: {
        weightG: !item.weightG ? category.defaultWeightG : null,
        dimensions: !item.lengthCm ? category.defaultDimensions : null,
      },
    });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json(
      { error: "Classification failed", detail: String(error) },
      { status: 500 }
    );
  }
}
