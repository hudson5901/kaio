import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/tasks/[id] - タスク更新
 * Body: { title?, description?, status?, priority?, assigneeId?, itemId? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, id),
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const allowedFields = [
    "title",
    "description",
    "status",
    "priority",
    "assigneeId",
    "itemId",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  updates.updatedAt = new Date().toISOString();

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id));

  const updated = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, id),
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/tasks/[id] - タスク削除
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));

  return NextResponse.json({ success: true });
}
