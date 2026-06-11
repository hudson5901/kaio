import { db, schema } from "@/lib/db";
import { and, eq, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { User } from "@/lib/db/schema";

const SEED_EMAILS = ["admin@kaio.local", "admin@kaio.app"];

/**
 * SupabaseセッションからローカルDBのユーザー行を取得。
 * 行がなければ自動作成（最初のユーザーはadmin、それ以降はmember）。
 * 認証されていなければnull。
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { createSupabaseServer } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServer();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.email) return null;

    const email = authUser.email;
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) return existing;

    const name =
      (authUser.user_metadata?.full_name as string | undefined) ||
      (authUser.user_metadata?.name as string | undefined) ||
      email.split("@")[0];

    // シードユーザー(admin@kaio.local等)しかいない場合は、最初の実ユーザーを管理者として作成
    const firstRealUser = await db.query.users.findFirst({
      where: and(
        ne(schema.users.email, SEED_EMAILS[0]),
        ne(schema.users.email, SEED_EMAILS[1]),
      ),
    });
    const role: "admin" | "member" = firstRealUser ? "member" : "admin";

    const id = uuid();
    await db.insert(schema.users).values({
      id,
      email,
      name,
      role,
      passwordHash: "google-oauth",
    });

    return (await db.query.users.findFirst({ where: eq(schema.users.id, id) })) ?? null;
  } catch (err) {
    console.error("getCurrentUser error:", err);
    return null;
  }
}
