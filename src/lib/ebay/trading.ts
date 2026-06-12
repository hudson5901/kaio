/**
 * eBay Trading API (XML) クライアント
 *
 * Auth'n'Auth トークンを使用した XML API 呼び出し
 */

import { XMLParser } from "fast-xml-parser";

const TRADING_API_ENDPOINT = "https://api.ebay.com/ws/api.dll";
const COMPAT_LEVEL = "1349";

// Trading API から返るアイテム型
export interface TradingItem {
  ItemID: string;
  Title: string;
  CurrentPrice: number;
  CurrencyID: string;
  PictureURL: string[];
  ListingStatus: string; // Active, Completed, Ended
  Quantity: number;
  QuantitySold: number;
  SKU?: string;
  StartTime?: string;
  EndTime?: string;
}

export interface TradingSoldItem extends TradingItem {
  BuyerUserId?: string;
  OrderLineItemID?: string;
}

/**
 * Trading API の XML 呼び出しヘルパー
 */
export async function callTradingApi(
  callName: string,
  xmlBody: string
): Promise<Record<string, unknown>> {
  const appId = process.env.EBAY_APP_ID;
  const devId = process.env.EBAY_DEV_ID;
  const certId = process.env.EBAY_CERT_ID;
  const authToken = process.env.EBAY_AUTH_TOKEN;

  if (!appId || !devId || !certId || !authToken) {
    throw new Error(
      "Trading API 環境変数が未設定です。EBAY_APP_ID, EBAY_DEV_ID, EBAY_CERT_ID, EBAY_AUTH_TOKEN を設定してください。"
    );
  }

  const fullXml = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${authToken}</eBayAuthToken>
  </RequesterCredentials>
  ${xmlBody}
</${callName}Request>`;

  const res = await fetch(TRADING_API_ENDPOINT, {
    method: "POST",
    headers: {
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": COMPAT_LEVEL,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-APP-NAME": appId,
      "X-EBAY-API-DEV-NAME": devId,
      "X-EBAY-API-CERT-NAME": certId,
      "Content-Type": "text/xml",
    },
    body: fullXml,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trading API ${callName} failed: ${res.status} ${text}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (name) =>
      ["Item", "PictureURL", "OrderTransaction"].includes(name),
  });
  const parsed = parser.parse(xml);

  // レスポンスのルート要素を取得
  const responseKey = `${callName}Response`;
  const response = parsed[responseKey];
  if (!response) {
    throw new Error(
      `Trading API ${callName}: unexpected response structure`
    );
  }

  if (response.Ack === "Failure") {
    // Errors が配列のときと単一オブジェクトの両方に対応
    const errs = Array.isArray(response.Errors)
      ? (response.Errors as Record<string, unknown>[])
      : response.Errors
        ? [response.Errors as Record<string, unknown>]
        : [];
    const errMsg = errs
      .map((e) => `[${e.ErrorCode}] ${e.ShortMessage || e.LongMessage}`)
      .join("; ") || "Unknown error";
    const err = new Error(`Trading API ${callName} error: ${errMsg}`);
    (err as Error & { errorCodes?: number[] }).errorCodes = errs
      .map((e) => Number(e.ErrorCode))
      .filter((n) => Number.isFinite(n));
    throw err;
  }

  return response;
}

/**
 * AddFixedPriceItem で実出品 (Trading API)
 * 既存の EBAY_AUTH_TOKEN で動く（OAuth セットアップ不要）。
 * Business Policies (Shipping/Payment/Return Profile ID) を環境変数で渡せば
 * SellerProfiles を使用、空ならインライン ShippingDetails/ReturnPolicy で出品。
 */
export async function addFixedPriceItem(item: {
  title: string;
  description: string;
  categoryId: string;
  conditionId: number;
  priceUsd: number;
  shippingCostUsd: number;
  imageUrls: string[];
  aspects: Record<string, string[]>;
  sku: string;
}): Promise<{ itemId: string }> {
  if (!item.imageUrls.length) {
    throw new Error("画像URLが空です。加工済み画像をアップロードしてください。");
  }
  if (!item.priceUsd || item.priceUsd <= 0) {
    throw new Error("eBay販売価格が未設定です。");
  }

  const shipProfile = process.env.EBAY_FULFILLMENT_POLICY_ID;
  const payProfile = process.env.EBAY_PAYMENT_POLICY_ID;
  const retProfile = process.env.EBAY_RETURN_POLICY_ID;

  const pictureXml = item.imageUrls
    .slice(0, 24)
    .map((u) => `<PictureURL>${xmlEscape(u)}</PictureURL>`)
    .join("");

  const aspectXml = Object.entries(item.aspects)
    .flatMap(([name, values]) =>
      values.map(
        (v) =>
          `<NameValueList><Name>${xmlEscape(name)}</Name><Value>${xmlEscape(String(v))}</Value></NameValueList>`
      )
    )
    .join("");

  // Business Policies は個別に設定可能。設定されたものは SellerProfiles で送り、
  // 設定されてないものはインラインで補完。Payment は eBay Managed Payments 必須
  // なのでインライン記述は廃止 (PayPal は無効)。
  const profilesParts: string[] = [];
  if (shipProfile) {
    profilesParts.push(
      `<SellerShippingProfile><ShippingProfileID>${shipProfile}</ShippingProfileID></SellerShippingProfile>`
    );
  }
  if (payProfile) {
    profilesParts.push(
      `<SellerPaymentProfile><PaymentProfileID>${payProfile}</PaymentProfileID></SellerPaymentProfile>`
    );
  }
  if (retProfile) {
    profilesParts.push(
      `<SellerReturnProfile><ReturnProfileID>${retProfile}</ReturnProfileID></SellerReturnProfile>`
    );
  }
  const sellerProfilesXml = profilesParts.length
    ? `<SellerProfiles>${profilesParts.join("")}</SellerProfiles>`
    : "";

  // Shipping Policy が未設定ならインライン送料を送る
  const inlineShippingXml = !shipProfile
    ? `<ShippingDetails>
        <ShippingType>Flat</ShippingType>
        <ShippingServiceOptions>
          <ShippingServicePriority>1</ShippingServicePriority>
          <ShippingService>ExpeditedShippingFromOutsideUS</ShippingService>
          <ShippingServiceCost currencyID="USD">${item.shippingCostUsd.toFixed(2)}</ShippingServiceCost>
        </ShippingServiceOptions>
      </ShippingDetails>`
    : "";

  // Return Policy が未設定ならインライン (30日返品)
  const inlineReturnXml = !retProfile
    ? `<ReturnPolicy>
        <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
        <RefundOption>MoneyBack</RefundOption>
        <ReturnsWithinOption>Days_30</ReturnsWithinOption>
        <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
      </ReturnPolicy>`
    : "";

  const policiesXml = `${sellerProfilesXml}${inlineShippingXml}${inlineReturnXml}`;

  // Best Offer (Allow offers) を全出品で有効化。
  // buyer が金額提示でき、seller が accept/counter/decline できる。
  const bestOfferXml = `<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>`;

  const xmlBody = `<Item>
    <Title>${xmlEscape(item.title.slice(0, 80))}</Title>
    <Description><![CDATA[${item.description}]]></Description>
    <PrimaryCategory><CategoryID>${item.categoryId}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${item.priceUsd.toFixed(2)}</StartPrice>
    <ConditionID>${item.conditionId}</ConditionID>
    <Country>JP</Country>
    <Location>Japan</Location>
    <Currency>USD</Currency>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>1</Quantity>
    <Site>US</Site>
    <SKU>${xmlEscape(item.sku)}</SKU>
    <DispatchTimeMax>5</DispatchTimeMax>
    <PictureDetails>${pictureXml}</PictureDetails>
    ${aspectXml ? `<ItemSpecifics>${aspectXml}</ItemSpecifics>` : ""}
    ${bestOfferXml}
    ${policiesXml}
  </Item>`;

  let res: Record<string, unknown>;
  try {
    res = await callTradingApi("AddFixedPriceItem", xmlBody);
  } catch (err) {
    // SKU 重複 (21916564) は ReviseFixedPriceItem で既存出品を更新
    const codes = (err as Error & { errorCodes?: number[] }).errorCodes ?? [];
    if (codes.includes(21916564)) {
      throw new Error(
        `この SKU (${item.sku}) は eBay 上で既に使われています。先に取り下げるか、別の SKU で出品してください。`
      );
    }
    throw err;
  }
  const itemId = String(res.ItemID ?? "");
  if (!itemId) {
    throw new Error(`AddFixedPriceItem: ItemID returned empty. Response: ${JSON.stringify(res).slice(0, 500)}`);
  }
  return { itemId };
}

/**
 * EndFixedPriceItem で出品取り下げ (Trading API)
 * AddFixedPriceItem 経由で出品したアイテム (ebayListingId = ItemID) を終了する。
 */
export async function endFixedPriceItem(itemId: string): Promise<void> {
  await callTradingApi(
    "EndFixedPriceItem",
    `<ItemID>${itemId}</ItemID><EndingReason>NotAvailable</EndingReason>`
  );
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Trading API が設定済みかチェック
 */
export function isTradingApiConfigured(): boolean {
  return !!(
    process.env.EBAY_APP_ID &&
    process.env.EBAY_DEV_ID &&
    process.env.EBAY_CERT_ID &&
    process.env.EBAY_AUTH_TOKEN
  );
}

// XML レスポンスからアイテムを正規化
function normalizeItem(raw: Record<string, unknown>): TradingItem {
  const pictureDetail = raw.PictureDetails as Record<string, unknown> | undefined;
  let pictureURLs: string[] = [];
  if (pictureDetail?.PictureURL) {
    pictureURLs = Array.isArray(pictureDetail.PictureURL)
      ? (pictureDetail.PictureURL as string[])
      : [pictureDetail.PictureURL as string];
  }

  const sellingStatus = raw.SellingStatus as Record<string, unknown> | undefined;
  const currentPrice = sellingStatus?.CurrentPrice as Record<string, unknown> | number | undefined;
  let priceValue = 0;
  let currencyId = "USD";
  if (typeof currentPrice === "object" && currentPrice !== null) {
    priceValue = parseFloat(String(currentPrice["#text"] ?? currentPrice["@_currencyID"] ?? 0));
    currencyId = String(currentPrice["@_currencyID"] ?? "USD");
    // fast-xml-parser の数値属性ハンドリング
    if (currentPrice["#text"] !== undefined) {
      priceValue = parseFloat(String(currentPrice["#text"]));
    }
  } else if (typeof currentPrice === "number") {
    priceValue = currentPrice;
  }

  return {
    ItemID: String(raw.ItemID ?? ""),
    Title: String(raw.Title ?? ""),
    CurrentPrice: priceValue,
    CurrencyID: currencyId,
    PictureURL: pictureURLs,
    ListingStatus: String(
      (sellingStatus?.ListingStatus as string) ?? raw.ListingStatus ?? ""
    ),
    Quantity: Number(raw.Quantity ?? 0),
    QuantitySold: Number(sellingStatus?.QuantitySold ?? raw.QuantitySold ?? 0),
    SKU: raw.SKU ? String(raw.SKU) : undefined,
    StartTime: raw.StartTime ? String(raw.StartTime) : undefined,
    EndTime: raw.EndTime ? String(raw.EndTime) : undefined,
  };
}

/**
 * GetMyeBaySelling で ActiveList + SoldList を取得
 * ページネーション対応 (200件/ページ)
 */
export async function getMyeBaySelling(): Promise<{
  activeItems: TradingItem[];
  soldItems: TradingSoldItem[];
}> {
  const entriesPerPage = 200;
  const activeItems: TradingItem[] = [];
  const soldItems: TradingSoldItem[] = [];

  // ActiveList を全ページ取得
  let activePage = 1;
  let activeTotalPages = 1;

  while (activePage <= activeTotalPages) {
    const response = await callTradingApi(
      "GetMyeBaySelling",
      `<ActiveList>
        <Sort>TimeLeft</Sort>
        <Pagination>
          <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
          <PageNumber>${activePage}</PageNumber>
        </Pagination>
      </ActiveList>
      ${activePage === 1 ? `<SoldList>
        <Sort>EndTime</Sort>
        <Pagination>
          <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
          <PageNumber>1</PageNumber>
        </Pagination>
      </SoldList>` : ""}`
    );

    // ActiveList の処理
    const activeList = response.ActiveList as Record<string, unknown> | undefined;
    if (activeList) {
      const itemArray = activeList.ItemArray as Record<string, unknown> | undefined;
      const items = itemArray?.Item;
      if (Array.isArray(items)) {
        for (const item of items) {
          activeItems.push(normalizeItem(item as Record<string, unknown>));
        }
      }

      const paginationResult = activeList.PaginationResult as Record<string, unknown> | undefined;
      if (paginationResult) {
        activeTotalPages = Number(paginationResult.TotalNumberOfPages ?? 1);
      }
    }

    // SoldList の処理 (最初のリクエストのみ)
    if (activePage === 1) {
      const soldList = response.SoldList as Record<string, unknown> | undefined;
      if (soldList) {
        const soldPaginationResult = soldList.PaginationResult as Record<string, unknown> | undefined;
        const soldTotalPages = Number(soldPaginationResult?.TotalNumberOfPages ?? 1);

        // 最初のページのアイテムを処理
        processSoldItems(soldList, soldItems);

        // 残りのページを取得
        for (let soldPage = 2; soldPage <= soldTotalPages; soldPage++) {
          const soldResponse = await callTradingApi(
            "GetMyeBaySelling",
            `<SoldList>
              <Sort>EndTime</Sort>
              <Pagination>
                <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
                <PageNumber>${soldPage}</PageNumber>
              </Pagination>
            </SoldList>`
          );
          const sl = soldResponse.SoldList as Record<string, unknown> | undefined;
          if (sl) {
            processSoldItems(sl, soldItems);
          }
        }
      }
    }

    activePage++;
  }

  return { activeItems, soldItems };
}

/**
 * GetItem で個別アイテムのフル画像URLを取得
 */
export async function getItemPictureURLs(itemId: string): Promise<string[]> {
  const response = await callTradingApi(
    "GetItem",
    `<ItemID>${itemId}</ItemID>
    <DetailLevel>ReturnAll</DetailLevel>`
  );

  const rawItem = response.Item;
  const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as Record<string, unknown> | undefined;
  if (!item) return [];

  const pictureDetails = item.PictureDetails as Record<string, unknown> | undefined;
  if (!pictureDetails?.PictureURL) return [];

  return Array.isArray(pictureDetails.PictureURL)
    ? (pictureDetails.PictureURL as string[])
    : [pictureDetails.PictureURL as string];
}

function processSoldItems(
  soldList: Record<string, unknown>,
  soldItems: TradingSoldItem[]
) {
  const orderTxnArray = soldList.OrderTransactionArray as Record<string, unknown> | undefined;
  if (!orderTxnArray) return;

  const orderTxns = orderTxnArray.OrderTransaction;
  if (!Array.isArray(orderTxns)) return;

  for (const txn of orderTxns) {
    const record = txn as Record<string, unknown>;
    // SoldList のアイテムは Transaction > Item にある
    const transaction = record.Transaction as Record<string, unknown> | undefined;
    const itemData = transaction?.Item as Record<string, unknown> | undefined;

    if (itemData) {
      const item = normalizeItem(itemData);
      const soldItem: TradingSoldItem = {
        ...item,
        BuyerUserId: transaction?.Buyer
          ? String((transaction.Buyer as Record<string, unknown>).UserID ?? "")
          : undefined,
        OrderLineItemID: transaction?.OrderLineItemID
          ? String(transaction.OrderLineItemID)
          : undefined,
      };
      soldItems.push(soldItem);
    }
  }
}
