/**
 * eBay API Client
 *
 * OAuth2 トークン管理（クライアント資格情報 + ユーザートークン）
 *
 * 環境変数:
 * - EBAY_CLIENT_ID
 * - EBAY_CLIENT_SECRET
 * - EBAY_REDIRECT_URI
 * - EBAY_REFRESH_TOKEN (ユーザートークン用)
 * - EBAY_SANDBOX (true で Sandbox 環境を使用)
 */

const SANDBOX_BASE = "https://api.sandbox.ebay.com";
const PROD_BASE = "https://api.ebay.com";
const TOKEN_PATH = "/identity/v1/oauth2/token";

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");

// トークンキャッシュ
let userTokenCache: { accessToken: string; expiresAt: number } | null = null;
let appTokenCache: { accessToken: string; expiresAt: number } | null = null;

function isSandbox(): boolean {
  return process.env.EBAY_SANDBOX === "true";
}

export function getBaseUrl(): string {
  return isSandbox() ? SANDBOX_BASE : PROD_BASE;
}

function getTokenUrl(): string {
  return `${getBaseUrl()}${TOKEN_PATH}`;
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "eBay API credentials not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET environment variables."
    );
  }

  return { clientId, clientSecret };
}

function getBasicAuth(): string {
  const { clientId, clientSecret } = getCredentials();
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * クライアント資格情報でアプリケーショントークンを取得
 * (公開データへのアクセスに使用)
 */
export async function getApplicationToken(): Promise<string> {
  // キャッシュが有効なら返す（1分のバッファ）
  if (appTokenCache && appTokenCache.expiresAt > Date.now() + 60_000) {
    return appTokenCache.accessToken;
  }

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay application token request failed: ${error}`);
  }

  const data = await response.json();

  appTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * リフレッシュトークンでユーザーアクセストークンを取得
 * (Sell API などユーザーコンテキストが必要な操作に使用)
 */
export async function getUserToken(): Promise<string> {
  // キャッシュが有効なら返す（1分のバッファ）
  if (userTokenCache && userTokenCache.expiresAt > Date.now() + 60_000) {
    return userTokenCache.accessToken;
  }

  const refreshToken = process.env.EBAY_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "eBay user token not configured. Set EBAY_REFRESH_TOKEN or complete OAuth flow at /api/ebay/callback."
    );
  }

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay user token refresh failed: ${error}`);
  }

  const data = await response.json();

  userTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * 認可コードをトークンに交換
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const redirectUri = process.env.EBAY_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("EBAY_REDIRECT_URI environment variable is not set.");
  }

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay token exchange failed: ${error}`);
  }

  const data = await response.json();

  // ユーザートークンキャッシュも更新
  userTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * eBay API に認証付きリクエストを送信するヘルパー
 */
export async function ebayFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getUserToken();
  const url = `${getBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * eBay APIキーが設定されているか確認
 */
export function isEbayConfigured(): boolean {
  return !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

/**
 * eBay ユーザートークンが設定されているか確認
 */
export function isEbayUserTokenConfigured(): boolean {
  return !!process.env.EBAY_REFRESH_TOKEN;
}
