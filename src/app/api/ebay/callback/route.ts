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

    // リフレッシュトークンを HTML で表示（コピペしやすく）
    // 本番環境ではDBに保存するなどセキュアな方法を推奨
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>eBay OAuth 完了</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    .token { background: #f3f3f3; padding: 16px; border-radius: 8px; font-family: monospace; word-break: break-all; font-size: 12px; user-select: all; }
    button { padding: 10px 20px; font-size: 14px; cursor: pointer; border-radius: 6px; border: 1px solid #ccc; }
    .ok { color: green; }
    .note { font-size: 13px; color: #555; margin-top: 16px; }
  </style>
</head>
<body>
  <h1 class="ok">✓ eBay OAuth 認証完了</h1>
  <p>以下のリフレッシュトークンを Vercel の環境変数 <code>EBAY_REFRESH_TOKEN</code> にセットしてください（改行なしで）:</p>
  <div class="token" id="t">${tokens.refreshToken}</div>
  <p>
    <button onclick="navigator.clipboard.writeText(document.getElementById('t').innerText.trim()); this.textContent='✓ コピーしました'">クリップボードにコピー</button>
  </p>
  <p class="note">有効期限: ${tokens.expiresIn} 秒 (アクセストークン)。リフレッシュトークンは18ヶ月有効です。</p>
  <p class="note">手順: コピー → 開発者に渡す → <code>printf '&lt;TOKEN&gt;' | vercel env add EBAY_REFRESH_TOKEN production</code> で投入 → 再デプロイ</p>
</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
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
