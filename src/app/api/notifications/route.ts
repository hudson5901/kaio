import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/notifications - 通知一覧取得
 * ?unread=true で未読のみ
 * ?limit=20 で取得件数制限
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const notifications = unreadOnly
    ? await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.read, false))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(limit)
    : await db
        .select()
        .from(schema.notifications)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(limit);

  return NextResponse.json(notifications);
}

/**
 * PATCH /api/notifications - 既読にする
 * { ids: ["id1", "id2"] } or { all: true }
 */
export async function PATCH(request: Request) {
  const body = await request.json();

  if (body.all) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.read, false));
    return NextResponse.json({ ok: true });
  }

  if (body.ids && Array.isArray(body.ids)) {
    for (const id of body.ids) {
      await db
        .update(schema.notifications)
        .set({ read: true })
        .where(eq(schema.notifications.id, id));
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ids or all required" }, { status: 400 });
}

/**
 * DELETE /api/notifications - 通知を削除
 * { ids: ["id1"] } or { all: true } (既読のみ削除)
 */
export async function DELETE(request: Request) {
  const body = await request.json();

  if (body.all) {
    await db
      .delete(schema.notifications)
      .where(eq(schema.notifications.read, true));
    return NextResponse.json({ ok: true });
  }

  if (body.ids && Array.isArray(body.ids)) {
    for (const id of body.ids) {
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.id, id));
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ids or all required" }, { status: 400 });
}
