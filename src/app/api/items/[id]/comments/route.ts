import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

/**
 * GET /api/items/[id]/comments - アイテムのコメント一覧取得
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await db
    .select({
      id: schema.comments.id,
      content: schema.comments.content,
      createdAt: schema.comments.createdAt,
      userId: schema.comments.userId,
      userName: schema.users.name,
    })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.itemId, id))
    .orderBy(desc(schema.comments.createdAt));

  return NextResponse.json(
    result.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      user: { id: r.userId, name: r.userName || "Unknown" },
    }))
  );
}

/**
 * POST /api/items/[id]/comments - コメント作成
 * Body: { content, userId }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const commentId = uuid();
  await db.insert(schema.comments).values({
    id: commentId,
    itemId: id,
    userId: body.userId,
    content: body.content.trim(),
  });

  return NextResponse.json({ id: commentId, success: true });
}
