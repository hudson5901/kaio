import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// Priority order for sorting: high=1, medium=2, low=3
const priorityOrder = sql`CASE ${schema.tasks.priority} WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

/**
 * GET /api/tasks - タスク一覧取得
 * ?status=pending|in_progress|done
 * ?assigneeId=xxx
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const assigneeId = searchParams.get("assigneeId");

  const conditions = [];
  if (status) {
    conditions.push(
      eq(
        schema.tasks.status,
        status as "pending" | "in_progress" | "done"
      )
    );
  }
  if (assigneeId) {
    conditions.push(eq(schema.tasks.assigneeId, assigneeId));
  }

  const assignee = schema.users;

  // We need aliases for the creator join
  const result = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      description: schema.tasks.description,
      status: schema.tasks.status,
      priority: schema.tasks.priority,
      assigneeId: schema.tasks.assigneeId,
      itemId: schema.tasks.itemId,
      createdBy: schema.tasks.createdBy,
      createdAt: schema.tasks.createdAt,
      updatedAt: schema.tasks.updatedAt,
      assigneeName: assignee.name,
    })
    .from(schema.tasks)
    .leftJoin(assignee, eq(schema.tasks.assigneeId, assignee.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(priorityOrder, desc(schema.tasks.createdAt));

  return NextResponse.json(
    result.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      assigneeId: r.assigneeId,
      itemId: r.itemId,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignee: r.assigneeId
        ? { id: r.assigneeId, name: r.assigneeName || "Unknown" }
        : null,
    }))
  );
}

/**
 * POST /api/tasks - タスク作成
 * Body: { title, description?, priority?, assigneeId?, itemId?, createdBy }
 */
export async function POST(request: Request) {
  const body = await request.json();

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  if (!body.createdBy) {
    return NextResponse.json(
      { error: "createdBy required" },
      { status: 400 }
    );
  }

  const taskId = uuid();
  const now = new Date().toISOString();

  await db.insert(schema.tasks).values({
    id: taskId,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    status: "pending",
    priority: body.priority || "medium",
    assigneeId: body.assigneeId || null,
    itemId: body.itemId || null,
    createdBy: body.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: taskId, success: true });
}
