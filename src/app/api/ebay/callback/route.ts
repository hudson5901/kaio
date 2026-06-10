import { NextResponse } from "next/server";
import { exchangeCodeForToken, isEbayConfigured } from "@/lib/ebay/client";

/**
 * GET /api/ebay/callback
 *
 * eBay OAuth コールバック
 * eBay からリダイレクトされてきた認可コードをトークンに交換する
 */
export async function GET(request: Request) {
  if (!isEbayConfigured()) {
    return NextResponse.json(
      {
        error: "eBay API が未設定です",
        message:
          "EBAY_CLIENT_ID と EBAY_CLIENT_SECRET 環境変数を設定してください。",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // エラーが返された場合
  if (error) {
    return NextResponse.json(
      {
        error: "eBay OAuth エラー",
        message: errorDescription || error,
      },
      { status: 400 }
    );
  }

  // 認可コードがない場合
  if (!code) {
    return NextResponse.json(
      {
        error: "認可コードがありません",
        message: "eBay から認可コードが返されませんでした。",
      },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeCodeForToken(code);

    // リフレッシュトークンを表示（環境変数に設定するため）
    // 本番環境ではDBに保存するなどセキュアな方法を推奨
    return NextResponse.json({
      success: true,
      message:
        "eBay OAuth 認証が完了しました。以下のリフレッシュトークンを EBAY_REFRESH_TOKEN 環境変数に設定してください。",
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      note: "このリフレッシュトークンは18ヶ月有効です。安全な場所に保管してください。",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "トークン交換に失敗しました",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
