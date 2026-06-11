import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, inArray } from "drizzle-orm";

/**
 * GET /api/notifications - 通知一覧取得
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const rawLimit = parseInt(searchParams.get("limit") || "50");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

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
 */
export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.all) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.read, false));
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(inArray(schema.notifications.id, body.ids as string[]));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ids or all required" }, { status: 400 });
}

/**
 * DELETE /api/notifications - 通知を削除
 */
export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.all) {
    await db
      .delete(schema.notifications)
      .where(eq(schema.notifications.read, true));
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.id, body.ids as string[]));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ids or all required" }, { status: 400 });
}
