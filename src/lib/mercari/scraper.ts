import { db, schema } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { parseDimensions } from "./parser";
import { eq } from "drizzle-orm";
import { getExchangeRate } from "@/lib/exchange-rate";
import { calculateCosts } from "@/lib/shipping/calculator";

const JINA_BASE = "https://r.jina.ai/";

// フォールバック為替レート（API取得失敗時）
const FALLBACK_USD_TO_JPY = 155;

interface MercariItem {
  id: string;
  title: string;
  price: number; // JPY
  url: string;
  imageUrl: string;
  description: string;
  seller: string;
  status: "available" | "sold";
}

async function fetchWithJina(url: string, waitForSelector?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/markdown",
    "X-Return-Format": "markdown",
  };
  // メルカリのJS描画コンテンツを待つ
  if (waitForSelector) {
    headers["X-Wait-For-Selector"] = waitForSelector;
    headers["X-Timeout"] = "30";
  }
  const response = await fetch(`${JINA_BASE}${url}`, { headers });
  if (!response.ok) {
    throw new Error(`Jina fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * 検索結果マークダウンからアイテムをパース
 *
 * 実際の形式:
 * [![Image 1: タイトルのサムネイル](https://static.mercdn.net/thumb/item/webp/m12345_1.jpg?xxx) US$12.34 タイトル](https://jp.mercari.com/item/m12345)
 */
function parseSearchResults(markdown: string, usdToJpy: number = FALLBACK_USD_TO_JPY): MercariItem[] {
  const items: MercariItem[] = [];
  const seen = new Set<string>();

  // 各リストアイテムをパース
  // パターン: [![...](画像URL) US$価格 タイトル](商品URL)
  const itemPattern = /\[!\[(?:Image \d+: )?([^\]]*)\]\((https?:\/\/[^\s)]+)\)\s*US\$(\d+\.?\d*)\s+([^\]]+)\]\((https:\/\/jp\.mercari\.com\/item\/(m\d+))\)/g;

  let match;
  while ((match = itemPattern.exec(markdown)) !== null) {
    const [, , imageUrl, priceUsd, title, itemUrl, mercariId] = match;

    if (seen.has(mercariId)) continue;
    seen.add(mercariId);

    const priceJpy = Math.round(parseFloat(priceUsd) * usdToJpy);

    items.push({
      id: mercariId,
      title: title.trim(),
      price: priceJpy,
      url: itemUrl,
      imageUrl: imageUrl,
      description: "",
      seller: "",
      status: "available",
    });
  }

  // フォールバック: 上のパターンで取れなかった場合、URLだけ拾う
  if (items.length === 0) {
    const urlPattern = /https:\/\/jp\.mercari\.com\/item\/(m\d+)/g;
    let urlMatch;
    while ((urlMatch = urlPattern.exec(markdown)) !== null) {
      const mercariId = urlMatch[1];
      if (seen.has(mercariId)) continue;
      seen.add(mercariId);

      items.push({
        id: mercariId,
        title: `Item ${mercariId}`,
        price: 0,
        url: `https://jp.mercari.com/item/${mercariId}`,
        imageUrl: "",
        description: "",
        seller: "",
        status: "available",
      });
    }
  }

  return items;
}

/**
 * メルカリの画像URLは m{id}_{n}.jpg のパターンに従う。
 * 並列HEADリクエストで全画像を高速に推測取得。
 */
async function inferMercariImages(mercariId: string, foundUrls: string[]): Promise<string[]> {
  const baseUrl = "https://static.mercdn.net/item/detail/orig/photos/";
  const candidates = Array.from({ length: 10 }, (_, i) => `${baseUrl}${mercariId}_${i + 1}.jpg`);

  // 全10枚を並列HEADチェック（1.5秒タイムアウト）
  const results = await Promise.allSettled(
    candidates.map(async (url) => {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(1500) });
      return res.ok ? url : null;
    })
  );

  const validUrls = results
    .map(r => r.status === "fulfilled" ? r.value : null)
    .filter((u): u is string => u !== null);

  return validUrls.length > 0 ? validUrls : foundUrls;
}

/** 商品画像かどうか判定（UI要素やアイコンを除外） */
function isProductImage(url: string): boolean {
  // 商品写真のパターン
  if (url.includes("/item/detail/") || url.includes("/photos/")) return true;
  // 商品サムネイル
  if (url.includes("/thumb/item/")) return true;
  // アバター・アイコン・ロゴは除外
  if (url.includes("/avatar/") || url.includes("/icon/") || url.includes("/logo/")) return false;
  // 非常に小さいサイズ指定は除外（アイコンの可能性）
  if (/w\/\d{1,2}[^0-9]/.test(url)) return false;
  // mercdn.net の画像で上記に該当しないもの
  if (url.includes("static.mercdn.net")) return true;
  return false;
}

interface MercariItemDetails extends Partial<MercariItem> {
  imageUrls: string[];
  category?: string;
  condition?: string;
  shippingFrom?: string;
  features?: string;
  likes?: number;
  listedAt?: string;
}

/**
 * 個別商品ページの詳細を取得（ベストエフォート）
 */
async function fetchItemDetails(mercariId: string, usdToJpy: number): Promise<MercariItemDetails> {
  const url = `https://jp.mercari.com/item/${mercariId}`;
  const markdown = await fetchWithJina(url, "[data-testid=description]");

  // 画像URLを抽出（商品画像のみ、最大10枚）
  const imageUrls: string[] = [];
  const MAX_IMAGES = 10;

  // 優先度順に複数パターンで抽出
  const imgPatterns = [
    // 高解像度の詳細写真
    /(https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/[^\s)"']+)/g,
    // リサイズ済みサムネイル
    /(https:\/\/static\.mercdn\.net\/c![^\s)"']*\/thumb\/photos\/[^\s)"']+)/g,
    /(https:\/\/static\.mercdn\.net\/thumb\/photos\/[^\s)"']+)/g,
    // マークダウン画像記法
    /!\[.*?\]\((https:\/\/static\.mercdn\.net\/[^\s)]+)\)/g,
    // アイテムサムネイル
    /(https:\/\/static\.mercdn\.net\/thumb\/item\/[^\s)"']+)/g,
    // その他 mercdn の画像URL全般
    /(https:\/\/static\.mercdn\.net\/[^\s)"']*(?:\.jpg|\.jpeg|\.png|\.webp)[^\s)"']*)/gi,
  ];
  for (const pattern of imgPatterns) {
    if (imageUrls.length >= MAX_IMAGES) break;
    let imgMatch;
    while ((imgMatch = pattern.exec(markdown)) !== null && imageUrls.length < MAX_IMAGES) {
      const imgUrl = imgMatch[1];
      if (imgUrl && !imageUrls.includes(imgUrl) && isProductImage(imgUrl)) {
        imageUrls.push(imgUrl);
      }
    }
  }

  // 売り切れチェック
  const isSold = /売り切れ|SOLD OUT|この商品は売り切れです/i.test(markdown);

  // 価格抽出: ¥ を優先、なければ US$
  let price = 0;
  const jpyPriceMatch = /[¥￥]\s?([\d,]+)/.exec(markdown);
  const usdPriceMatch = /US\$(\d+[\d,.]*)/i.exec(markdown);
  if (jpyPriceMatch) {
    price = parseInt(jpyPriceMatch[1].replace(/,/g, ""), 10);
  } else if (usdPriceMatch) {
    price = Math.round(parseFloat(usdPriceMatch[1].replace(/,/g, "")) * usdToJpy);
  }

  // タイトル抽出
  const titlePattern = /^#\s+(.+)$/m;
  const titleMatch = titlePattern.exec(markdown);
  let title = titleMatch ? titleMatch[1].trim() : "";
  if (!title) {
    const ogTitlePattern = /title[：:]\s*(.+)/i;
    const ogMatch = ogTitlePattern.exec(markdown);
    if (ogMatch) title = ogMatch[1].trim();
  }
  // " - メルカリ" サフィックスを除去
  title = title.replace(/\s*-\s*メルカリ\s*$/, "").trim();

  // 説明文抽出
  let description = "";
  // パターン1: 「商品の説明」セクション
  const descPattern1 = /商品の説明\s*\n+([\s\S]*?)(?=\n##|\n---|\n\*\s*\*\s*\*|\n商品の情報)/;
  const descMatch1 = descPattern1.exec(markdown);
  if (descMatch1) {
    description = descMatch1[1].trim();
  }
  // パターン2: 長いテキストブロック（ナビゲーション要素を除外）
  if (!description) {
    const navKeywords = [
      "メルカリ", "ログイン", "マイページ", "ガイド", "利用規約",
      "プライバシー", "ヘルプ", "会社概要", "採用情報", "プレス",
      "cookie", "about.mercari", "help.jp.mercari", "static.jp.mercari",
      "コンテンツにスキップ", "Markdown Content", "URL Source",
    ];
    const lines = markdown.split("\n");
    const textBlocks = lines.filter(l =>
      l.length > 30 &&
      !l.startsWith("#") && !l.startsWith("[") &&
      !l.startsWith("!") && !l.startsWith("*") &&
      !navKeywords.some(kw => l.includes(kw))
    );
    description = textBlocks.join("\n").trim().slice(0, 2000);
  }

  // 出品者
  const sellerPattern = /出品者[\s\S]*?\[([^\]]+)\]/;
  const sellerMatch = sellerPattern.exec(markdown);
  const seller = sellerMatch ? sellerMatch[1] : "";

  // カテゴリー抽出: "### カテゴリー" セクション内のリンクテキストを連結
  let category = "";
  const categoryPattern = /###\s*カテゴリー\s*\n([\s\S]*?)(?=\n###|\n##|\n---)/;
  const categoryMatch = categoryPattern.exec(markdown);
  if (categoryMatch) {
    const categoryLine = categoryMatch[1].trim();
    // リンクテキストを抽出: [テキスト](URL) パターン
    const categoryLinks: string[] = [];
    const linkPattern = /\[([^\]]+)\]\([^)]+\)/g;
    let linkMatch;
    while ((linkMatch = linkPattern.exec(categoryLine)) !== null) {
      const text = linkMatch[1].trim();
      if (text && !text.startsWith("Image")) {
        categoryLinks.push(text);
      }
    }
    if (categoryLinks.length > 0) {
      category = categoryLinks.join(" > ");
    } else {
      // リンクがない場合はプレーンテキストを使う
      const plainText = categoryLine.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
      if (plainText) category = plainText;
    }
  }

  // 商品の状態抽出
  let condition = "";
  const conditionPattern = /###\s*商品の状態\s*\n\s*(.+)/;
  const conditionMatch = conditionPattern.exec(markdown);
  if (conditionMatch) {
    condition = conditionMatch[1].trim();
  }

  // 発送元の地域抽出
  let shippingFrom = "";
  const shippingPattern = /###\s*発送元の地域\s*\n\s*(.+)/;
  const shippingMatch = shippingPattern.exec(markdown);
  if (shippingMatch) {
    shippingFrom = shippingMatch[1].trim();
  }

  // 商品の特徴抽出: "## 商品の特徴" セクション内からキー・バリューペアを取得
  let features = "";
  const featuresPattern = /##\s*商品の特徴\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\s*\*\s*\*|$)/;
  const featuresMatch = featuresPattern.exec(markdown);
  if (featuresMatch) {
    const featuresBlock = featuresMatch[1].trim();
    const featureMap: Record<string, string> = {};
    // パターン: [素材: 合成皮革・フェイクレザー・PVC・PU](url) or plain "素材: 値"
    const featureLinePattern = /(?:\[)?([^:\]]+)[:：]\s*([^\](\n]+)(?:\])?/g;
    let featureMatch;
    while ((featureMatch = featureLinePattern.exec(featuresBlock)) !== null) {
      const key = featureMatch[1].trim();
      const value = featureMatch[2].trim();
      if (key && value && key.length < 30) {
        featureMap[key] = value;
      }
    }
    if (Object.keys(featureMap).length > 0) {
      features = JSON.stringify(featureMap);
    }
  }

  // いいね数抽出: 数字パターンを探す（"いいね" の前後）
  let likes: number | undefined;
  const likesPattern = /(\d+)\s*(?:いいね|likes?|♡)/i;
  const likesMatch = likesPattern.exec(markdown);
  if (likesMatch) {
    likes = parseInt(likesMatch[1], 10);
  } else {
    // 逆パターン: "いいね N" or "♡ N"
    const likesPattern2 = /(?:いいね|likes?|♡)\s*(\d+)/i;
    const likesMatch2 = likesPattern2.exec(markdown);
    if (likesMatch2) {
      likes = parseInt(likesMatch2[1], 10);
    }
  }

  // 出品日時抽出: "N日前", "N時間前", "N分前" etc.
  let listedAt = "";
  const listedAtPattern = /(\d+\s*(?:秒|分|時間|日|週間|ヶ月|か月|年)\s*前)/;
  const listedAtMatch = listedAtPattern.exec(markdown);
  if (listedAtMatch) {
    listedAt = listedAtMatch[1].trim();
  }

  // パターンマッチで少ない場合、連番URLで推測取得
  let finalImageUrls = imageUrls;
  if (imageUrls.length < 3) {
    try {
      finalImageUrls = await inferMercariImages(mercariId, imageUrls);
    } catch { /* ignore */ }
  }

  return {
    title: title || undefined,
    price: price || undefined,
    imageUrls: finalImageUrls,
    description,
    seller,
    status: isSold ? "sold" : "available",
    category: category || undefined,
    condition: condition || undefined,
    shippingFrom: shippingFrom || undefined,
    features: features || undefined,
    likes,
    listedAt: listedAt || undefined,
  };
}

/**
 * メルカリ内部APIで検索結果を取得
 * 1リクエストで最大120件取得可能（Jina経由の20件から大幅改善）
 */
async function fetchSearchPages(
  keyword: string,
  maxItems: number,
  usdToJpy: number,
): Promise<{ items: MercariItem[]; errors: string[] }> {
  const allItems: MercariItem[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  const PAGE_SIZE = 120;

  let pageToken = "";
  let pageNum = 0;

  while (allItems.length < maxItems) {
    pageNum++;
    try {
      console.log(`[スクレイプ] ページ ${pageNum} 取得中... (累計${allItems.length}件)`);

      // レート制限
      if (pageNum > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const apiBody = {
        keyword,
        status: ["STATUS_ON_SALE"],
        pageSize: PAGE_SIZE,
        pageToken,
        searchSessionId: uuid(),
        sortBy: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
      };

      const res = await fetch("https://api.mercari.jp/v2/entities:search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Platform": "web",
          "Accept": "application/json, text/plain, */*",
          "DPoP": "",
        },
        body: JSON.stringify(apiBody),
      });

      if (!res.ok) {
        // API失敗時はJinaフォールバック
        console.log(`[スクレイプ] API失敗 (${res.status}), Jinaフォールバック...`);
        return fetchSearchPagesJina(keyword, maxItems - allItems.length, usdToJpy, allItems, seen);
      }

      const data = await res.json();
      const items = data.items || [];

      if (items.length === 0) {
        console.log(`[スクレイプ] ページ ${pageNum}: 結果なし、取得終了`);
        break;
      }

      let newCount = 0;
      for (const item of items) {
        const mercariId = item.id;
        if (!mercariId || seen.has(mercariId)) continue;
        seen.add(mercariId);

        const priceJpy = parseInt(item.price || "0", 10);
        const thumbnails = item.thumbnails || [];
        const imageUrl = thumbnails[0] || "";

        allItems.push({
          id: mercariId,
          title: item.name || `Item ${mercariId}`,
          price: priceJpy,
          url: `https://jp.mercari.com/item/${mercariId}`,
          imageUrl,
          description: "",
          seller: item.seller?.name || "",
          status: "available",
        });
        newCount++;
      }

      console.log(`[スクレイプ] ページ ${pageNum}: ${items.length}件取得 (新規${newCount}件, 累計${allItems.length}件)`);

      // 次ページトークン
      const nextToken = data.meta?.nextPageToken || data.searchSessionId || "";
      if (!nextToken || nextToken === pageToken) {
        console.log(`[スクレイプ] 次ページなし、取得終了`);
        break;
      }
      pageToken = nextToken;

    } catch (err) {
      errors.push(`ページ${pageNum}: ${err}`);
      if (pageNum === 1) {
        // 最初のページで失敗 → Jinaフォールバック
        console.log(`[スクレイプ] API接続失敗、Jinaフォールバック...`);
        return fetchSearchPagesJina(keyword, maxItems, usdToJpy, allItems, seen);
      }
    }
  }

  return { items: allItems.slice(0, maxItems), errors };
}

/**
 * Jina経由のフォールバック検索（API失敗時）
 */
async function fetchSearchPagesJina(
  keyword: string,
  maxItems: number,
  usdToJpy: number,
  existingItems: MercariItem[] = [],
  existingSeen: Set<string> = new Set(),
): Promise<{ items: MercariItem[]; errors: string[] }> {
  const allItems = [...existingItems];
  const seen = new Set(existingSeen);
  const errors: string[] = [];
  const pagesNeeded = Math.ceil(maxItems / 20);

  for (let page = 0; page < pagesNeeded; page++) {
    if (allItems.length >= existingItems.length + maxItems) break;

    try {
      const searchUrl = page === 0
        ? `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=on_sale`
        : `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=on_sale&page_token=v1%3A${page}`;

      console.log(`[スクレイプ/Jina] ページ ${page + 1} 取得中...`);

      if (page > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const searchMarkdown = await fetchWithJina(searchUrl, "[data-testid=item-cell]");
      const pageItems = parseSearchResults(searchMarkdown, usdToJpy);

      let newCount = 0;
      for (const item of pageItems) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          allItems.push(item);
          newCount++;
        }
      }

      console.log(`[スクレイプ/Jina] ページ ${page + 1}: ${pageItems.length}件 (新規${newCount}件, 累計${allItems.length}件)`);

      if (newCount === 0) break;
    } catch (err) {
      errors.push(`Jinaページ${page + 1}: ${err}`);
    }
  }

  return { items: allItems.slice(0, existingItems.length + maxItems), errors };
}

/**
 * メルカリで検索して未販売アイテムをDBに保存
 * ページ取得と同時にDB保存（タイムアウトしても途中まで保存される）
 */
export async function scrapeMercari(
  keyword: string = "兜 甲冑",
  maxItems: number = 20,
  fetchDetails: boolean = false,
): Promise<{ added: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;
  let skipped = 0;

  // 為替レート取得
  const usdToJpy = await getExchangeRate().catch(() => FALLBACK_USD_TO_JPY);

  // 既存のmercariIdをキャッシュ（高速な重複チェック）
  const existingRows = await db
    .select({ mercariId: schema.items.mercariId })
    .from(schema.items);
  const existingIds = new Set(existingRows.map(r => r.mercariId).filter(Boolean));

  console.log(`[スクレイプ] 既存${existingIds.size}件をスキップ対象に設定`);

  // ページごとに取得→即保存
  const seen = new Set<string>();
  let pageToken = "";
  let pageNum = 0;
  let totalFetched = 0;
  const PAGE_SIZE = 120;
  let useApi = true;

  while (totalFetched < maxItems) {
    pageNum++;
    let pageItems: MercariItem[] = [];

    if (useApi) {
      try {
        console.log(`[スクレイプ] API ページ ${pageNum} 取得中... (累計取得${totalFetched}, 追加${added})`);
        if (pageNum > 1) await new Promise(r => setTimeout(r, 500));

        const apiBody = {
          keyword,
          status: ["STATUS_ON_SALE"],
          pageSize: PAGE_SIZE,
          pageToken,
          searchSessionId: uuid(),
          sortBy: "SORT_CREATED_TIME",
          order: "ORDER_DESC",
        };

        const res = await fetch("https://api.mercari.jp/v2/entities:search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Platform": "web" },
          body: JSON.stringify(apiBody),
        });

        if (!res.ok) {
          console.log(`[スクレイプ] API失敗 (${res.status}), Jinaフォールバック...`);
          useApi = false;
          continue;
        }

        const data = await res.json();
        const rawItems = data.items || [];

        if (rawItems.length === 0) {
          console.log(`[スクレイプ] ページ ${pageNum}: 結果なし、取得終了`);
          break;
        }

        for (const raw of rawItems) {
          const mercariId = raw.id;
          if (!mercariId || seen.has(mercariId)) continue;
          seen.add(mercariId);
          const priceJpy = parseInt(raw.price || "0", 10);
          const thumbnails = raw.thumbnails || [];
          pageItems.push({
            id: mercariId,
            title: raw.name || `Item ${mercariId}`,
            price: priceJpy,
            url: `https://jp.mercari.com/item/${mercariId}`,
            imageUrl: thumbnails[0] || "",
            description: "",
            seller: raw.seller?.name || "",
            status: "available",
          });
        }

        const nextToken = data.meta?.nextPageToken || "";
        if (!nextToken || nextToken === pageToken) {
          // DB保存後にbreak
          pageToken = "";
        } else {
          pageToken = nextToken;
        }
      } catch (err) {
        errors.push(`APIページ${pageNum}: ${err}`);
        if (pageNum === 1) { useApi = false; continue; }
        break;
      }
    } else {
      // Jinaフォールバック
      try {
        const jinaPage = pageNum - 1;
        const searchUrl = jinaPage === 0
          ? `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=on_sale`
          : `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=on_sale&page_token=v1%3A${jinaPage}`;

        console.log(`[スクレイプ/Jina] ページ ${pageNum} 取得中...`);
        if (jinaPage > 0) await new Promise(r => setTimeout(r, 2000));

        const md = await fetchWithJina(searchUrl, "[data-testid=item-cell]");
        const parsed = parseSearchResults(md, usdToJpy);

        for (const item of parsed) {
          if (!seen.has(item.id)) { seen.add(item.id); pageItems.push(item); }
        }
        if (pageItems.length === 0) break;
      } catch (err) {
        errors.push(`Jinaページ${pageNum}: ${err}`);
        break;
      }
    }

    // 即座にDB保存
    for (const item of pageItems) {
      if (totalFetched >= maxItems) break;
      totalFetched++;

      try {
        if (existingIds.has(item.id)) { skipped++; continue; }

        let title = item.title || `Item ${item.id}`;
        let price = item.price;
        let description = "";
        let imageUrls: string[] = item.imageUrl ? [item.imageUrl] : [];
        let seller = item.seller || "";
        let category: string | undefined;
        let condition: string | undefined;
        let shippingFrom: string | undefined;
        let features: string | undefined;
        let likes: number | undefined;
        let listedAt: string | undefined;

        if (fetchDetails) {
          let details: MercariItemDetails = { imageUrls: [] };
          try {
            await new Promise(r => setTimeout(r, 1500));
            details = await fetchItemDetails(item.id, usdToJpy);
          } catch (err) { errors.push(`${item.id}: 詳細スキップ (${err})`); }

          if (details.status === "sold") { skipped++; continue; }
          if (details.title && details.title.length > 3) title = details.title;
          if (!price && details.price) price = details.price;
          if (details.description && details.description.length > 20) description = details.description;
          seller = details.seller || seller;
          category = details.category;
          condition = details.condition;
          shippingFrom = details.shippingFrom;
          features = details.features;
          likes = details.likes;
          listedAt = details.listedAt;
          if (details.imageUrls.length > 0) {
            imageUrls = details.imageUrls;
            if (item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.push(item.imageUrl);
          }
        }

        // 画像が少ない場合は連番URLで推測取得（並列HEAD、約1秒）
        if (imageUrls.length < 3) {
          try {
            imageUrls = await inferMercariImages(item.id, imageUrls);
          } catch { /* ignore */ }
        }

        const dimensions = parseDimensions(description);

        // 費用自動計算
        const costs = calculateCosts({
          mercariPriceJpy: price,
          weightG: dimensions.weightG,
          lengthCm: dimensions.lengthCm,
          widthCm: dimensions.widthCm,
          heightCm: dimensions.heightCm,
          exchangeRate: usdToJpy,
        });

        await db.insert(schema.items).values({
          id: uuid(),
          mercariId: item.id,
          mercariUrl: item.url,
          mercariTitle: title,
          mercariDescription: description,
          mercariPrice: price,
          mercariImages: JSON.stringify(imageUrls),
          mercariStatus: "available",
          mercariSeller: seller,
          mercariCategory: category,
          mercariCondition: condition,
          mercariShippingFrom: shippingFrom,
          mercariFeatures: features,
          mercariLikes: likes,
          mercariListedAt: listedAt,
          weightG: dimensions.weightG,
          lengthCm: dimensions.lengthCm,
          widthCm: dimensions.widthCm,
          heightCm: dimensions.heightCm,
          shippingCostUsd: costs.shippingCostUsd,
          customsDutyUsd: costs.customsDutyUsd,
          ebayFeeUsd: costs.ebayFeeUsd,
          adCostUsd: costs.adCostUsd,
          ebayPriceUsd: costs.suggestedPriceUsd,
          estimatedProfitUsd: costs.profitUsd,
        });

        added++;
        existingIds.add(item.id);
      } catch (err) {
        errors.push(`${item.id}: ${err}`);
      }
    }

    console.log(`[スクレイプ] ページ ${pageNum} 完了: 累計 追加${added}, スキップ${skipped}`);

    if (!useApi && pageItems.length === 0) break;
    if (useApi && !pageToken) break;
  }

  return { added, skipped, errors };
}

/**
 * 単一アイテムのメルカリ在庫状態を確認
 */
export async function checkMercariAvailability(
  mercariId: string
): Promise<"available" | "sold" | "deleted"> {
  try {
    const url = `https://jp.mercari.com/item/${mercariId}`;
    const markdown = await fetchWithJina(url);

    if (markdown.includes("この商品は存在しません") || markdown.includes("404")) {
      return "deleted";
    }

    if (/売り切れ|SOLD OUT|この商品は売り切れです/i.test(markdown)) {
      return "sold";
    }

    return "available";
  } catch {
    // ネットワークエラー時はステータス変更しない（availableのまま）
    return "available";
  }
}
