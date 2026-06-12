import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const ALLOWED_EMAILS = [
    "kaito20050121kaito@gmail.com",
    "rinng.nakamura@gmail.com",
  ];

  if (code) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const email = data.user.email!;

      // メールアドレスのホワイトリストチェック
      if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=unauthorized`);
      }

      // Sync user to our DB
      const name =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        email.split("@")[0];

      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });

      if (!existing) {
        // First user = admin, rest = member
        const allUsers = await db.select().from(schema.users).limit(1);
        const role = allUsers.length === 0 ? "admin" : "member";

        await db.insert(schema.users).values({
          id: uuid(),
          email,
          name,
          role,
          passwordHash: "google-oauth",
        });
      } else {
        // Update last login
        await db
          .update(schema.users)
          .set({ lastLoginAt: new Date().toISOString() })
          .where(eq(schema.users.id, existing.id));
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
