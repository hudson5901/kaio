import { NextResponse } from "next/server";
import { ensureAdminExists } from "@/lib/auth";

export async function GET() {
  try {
    await ensureAdminExists();
    return NextResponse.json({ ready: true });
  } catch (error) {
    console.error("Setup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "セットアップ中にエラーが発生しました", detail: message },
      { status: 500 }
    );
  }
}
