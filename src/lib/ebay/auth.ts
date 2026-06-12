/**
 * eBay OAuth 認証
 *
 * 環境変数:
 * - EBAY_CLIENT_ID
 * - EBAY_CLIENT_SECRET
 * - EBAY_REDIRECT_URI
 * - EBAY_SANDBOX (true/false)
 */

const SANDBOX_AUTH_URL = "https://auth.sandbox.ebay.com/oauth2/authorize";
const PROD_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const SANDBOX_TOKEN_URL = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const PROD_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";

function isSandbox(): boolean {
  return process.env.EBAY_SANDBOX === "true";
}

function getAuthUrl(): string {
  return isSandbox() ? SANDBOX_AUTH_URL : PROD_AUTH_URL;
}

function getTokenUrl(): string {
  return isSandbox() ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL;
}

export function getBaseApiUrl(): string {
  return isSandbox()
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");

// トークンキャッシュ
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * OAuth認可URLを生成
 */
export function getAuthorizationUrl(): string {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const redirectUri = process.env.EBAY_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) {
    throw new Error("EBAY_CLIENT_ID and EBAY_REDIRECT_URI must be set");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
  });

  return `${getAuthUrl()}?${params.toString()}`;
}

/**
 * 認可コードからアクセストークンを取得
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.EBAY_CLIENT_ID!.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET!.trim();
  const redirectUri = process.env.EBAY_REDIRECT_URI!.trim();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  cachedToken = {
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
 * リフレッシュトークンでアクセストークンを更新
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID!.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET!.trim();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * クライアント資格情報でアプリケーショントークンを取得
 */
export async function getApplicationToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Application token failed: ${error}`);
  }

  const data = await response.json();

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}
