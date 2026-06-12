import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { classifyItem } from "@/lib/kabuto/classifier";
import { getCategory } from "@/lib/kabuto/categories";

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

    // カテゴリと判定信頼度だけを保存する。寸法・重量・eBay aspects は
    // カテゴリ由来のデフォルト値を DB に書き込まない（実測 or 手入力のみ反映）。
    // 出品時に aspects が null なら mapping.ts が category.defaultAspects に
    // フォールバックする。
    await db.update(schema.items).set({
      kabutoCategory: result.category,
      kabutoCategoryConfidence: result.confidence,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      category: result.category,
      categoryName: category.name,
      confidence: result.confidence,
      reason: result.reason,
      method: result.method,
    });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json(
      { error: "Classification failed", detail: String(error) },
      { status: 500 }
    );
  }
}
