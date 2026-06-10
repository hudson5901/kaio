import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";

async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("kaio_session")?.value;
  if (!token) return null;

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.token, token),
      gt(schema.sessions.expiresAt, new Date().toISOString())
    ),
  });
  if (!session) return null;

  return db.query.users.findFirst({
    where: eq(schema.users.id, session.userId),
  });
}

/**
 * PATCH /api/admin/users/[id] - ユーザー情報更新（管理者のみ）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, role, password } = body;

    // 対象ユーザーが存在するかチェック
    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    if (!targetUser) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 }
      );
    }

    await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, id));

    const updatedUser = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    return NextResponse.json({
      id: updatedUser!.id,
      email: updatedUser!.email,
      name: updatedUser!.name,
      role: updatedUser!.role,
      createdAt: updatedUser!.createdAt,
      lastLoginAt: updatedUser!.lastLoginAt,
    });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "ユーザー更新中にエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id] - ユーザー削除（管理者のみ、自分自身は削除不可）
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  // 自分自身は削除不可
  if (currentUser.id === id) {
    return NextResponse.json(
      { error: "自分自身を削除することはできません" },
      { status: 400 }
    );
  }

  // 対象ユーザーが存在するかチェック
  const targetUser = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!targetUser) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 404 }
    );
  }

  await db.delete(schema.users).where(eq(schema.users.id, id));

  return NextResponse.json({ success: true });
}
