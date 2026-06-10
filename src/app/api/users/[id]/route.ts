import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/users/[id] - ユーザー情報更新
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, email, role, password } = body;

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
    if (email !== undefined) updateData.email = email;
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

    // メール変更時は重複チェック
    if (email !== undefined && email !== targetUser.email) {
      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });
      if (existing) {
        return NextResponse.json(
          { error: "このメールアドレスは既に使用されています" },
          { status: 409 }
        );
      }
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
 * DELETE /api/users/[id] - ユーザー削除
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
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
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "ユーザー削除中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
