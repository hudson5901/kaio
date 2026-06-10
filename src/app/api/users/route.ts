import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

/**
 * GET /api/users - ユーザー一覧取得
 * タスク割り当てやコメント表示のドロップダウン用
 */
export async function GET() {
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
    })
    .from(schema.users);

  return NextResponse.json(users);
}

/**
 * POST /api/users - 新規ユーザー作成
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, password, role } = body;

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "メール、名前、パスワードは必須です" },
        { status: 400 }
      );
    }

    // メール重複チェック
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) {
      return NextResponse.json(
        { error: "このメールアドレスは既に使用されています" },
        { status: 409 }
      );
    }

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(schema.users).values({
      id,
      email,
      name,
      role: role || "member",
      passwordHash,
    });

    return NextResponse.json({
      id,
      email,
      name,
      role: role || "member",
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "ユーザー作成中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
