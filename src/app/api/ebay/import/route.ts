import { NextResponse } from "next/server";
import { importFromTradingApi, importEbayListings } from "@/lib/ebay/import";
import { isEbayConfigured, isEbayUserTokenConfigured } from "@/lib/ebay/client";
import { isTradingApiConfigured } from "@/lib/ebay/trading";

/**
 * POST /api/ebay/import
 *
 * eBay のリスティングをインポート
 * Trading API (Auth'n'Auth) が設定されていればそちらを優先、
 * なければ REST API (OAuth2) にフォールバック
 */
export async function POST() {
  const useTradingApi = isTradingApiConfigured();

  if (!useTradingApi) {
    // REST API フォールバック: 環境変数チェック
    if (!isEbayConfigured()) {
      return NextResponse.json(
        {
          error: "eBay API が未設定です",
          message:
            "EBAY_AUTH_TOKEN (Trading API) または EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (REST API) を設定してください。",
        },
        { status: 503 }
      );
    }

    if (!isEbayUserTokenConfigured()) {
      return NextResponse.json(
        {
          error: "eBay ユーザートークンが未設定です",
          message:
            "EBAY_REFRESH_TOKEN 環境変数を設定するか、OAuth フローを完了してください。",
        },
        { status: 503 }
      );
    }
  }

  try {
    const results = useTradingApi
      ? await importFromTradingApi()
      : await importEbayListings();

    return NextResponse.json({
      success: true,
      api: useTradingApi ? "trading" : "rest",
      imported: results.imported,
      updated: results.updated,
      soldMarked: results.soldMarked,
      errors: results.errors,
      message: `${results.imported}件インポート、${results.updated}件更新、${results.soldMarked}件売約済みに更新`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "インポートに失敗しました",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
