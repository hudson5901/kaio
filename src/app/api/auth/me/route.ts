import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET() {
  try {
    // Try Supabase auth first
    try {
      const { createSupabaseServer } = await import("@/lib/supabase/server");
      const supabase = await createSupabaseServer();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser?.email) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.email, authUser.email),
        });
        if (user) {
          return NextResponse.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          });
        }
      }
    } catch { /* auth not configured, fall through */ }

    // Fallback: return first user or create default
    let user = await db.query.users.findFirst();
    if (!user) {
      const id = uuid();
      await db.insert(schema.users).values({
        id,
        email: "admin@kaio.app",
        name: "管理者",
        role: "admin",
        passwordHash: "",
      });
      user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    }

    return NextResponse.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json(
      { error: "認証確認中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
