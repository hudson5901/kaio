import { db, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

type User = typeof schema.users.$inferSelect;

const SESSION_COOKIE_NAME = "kaio_session";
const SESSION_DURATION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(
  userId: string
): Promise<{ token: string; expiresAt: string }> {
  const token = uuid();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const id = uuid();

  await db.insert(schema.sessions).values({
    id,
    userId,
    token,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<User | null> {
  const now = new Date().toISOString();

  const results = await db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, now))
    )
    .limit(1);

  if (results.length === 0) {
    return null;
  }

  const session = results[0];

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (users.length === 0) {
    return null;
  }

  return users[0];
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}

export async function getSessionFromCookies(
  cookies: RequestCookies | ReadonlyRequestCookies
): Promise<User | null> {
  const sessionCookie = cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return null;
  }
  return validateSession(sessionCookie.value);
}

export async function ensureAdminExists(): Promise<void> {
  const existingUsers = await db
    .select()
    .from(schema.users)
    .limit(1);

  if (existingUsers.length > 0) {
    return;
  }

  const id = uuid();
  const passwordHash = await hashPassword("kaio-admin");

  await db.insert(schema.users).values({
    id,
    email: "admin@kaio.local",
    name: "管理者",
    role: "admin",
    passwordHash,
  });
}
