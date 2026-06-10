import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { v4 as uuid } from "uuid";
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
 * GET /api/admin/users - 全ユーザー一覧取得（管理者のみ）
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
    })
    .from(schema.users);

  return NextResponse.json(users);
}

/**
 * POST /api/admin/users - 新規ユーザー作成（管理者のみ）
 */
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

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
