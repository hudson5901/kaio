import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/ebay/auth";

/**
 * GET /api/ebay/authorize
 *
 * eBay OAuth 認可フローを開始する。
 * 開くと eBay のログイン+同意画面にリダイレクトされ、
 * 完了後 EBAY_REDIRECT_URI (= /api/ebay/callback) に code 付きで戻る。
 */
export async function GET() {
  try {
    const url = getAuthorizationUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "eBay OAuth 認可 URL を生成できませんでした",
        message,
        hint: "EBAY_CLIENT_ID と EBAY_REDIRECT_URI を Vercel 環境変数に設定してください",
      },
      { status: 503 }
    );
  }
}
