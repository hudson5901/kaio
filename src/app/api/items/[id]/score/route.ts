import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { scoreItem } from "@/lib/ai/scorer";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, id),
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

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
    .where(eq(schema.items.id, id));

  return NextResponse.json(result);
}
