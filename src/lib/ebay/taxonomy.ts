/**
 * eBay Commerce Taxonomy API
 *
 * Read-only category tree lookup. Uses an application access token (client
 * credentials grant); no user OAuth scope beyond api_scope is required.
 *
 * Endpoints used:
 *  - GET /commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US
 *  - GET /commerce/taxonomy/v1/category_tree/{tree_id}/get_category_suggestions?q=...
 *  - GET /commerce/taxonomy/v1/category_tree/{tree_id}/get_category_subtree?category_id=...
 */

import { getApplicationToken, getBaseUrl } from "./client";

const MARKETPLACE_ID = "EBAY_US";
const DEFAULT_TREE_ID_US = "0"; // EBAY_US の default tree id は 0 で固定。fallback として保持。

let treeIdCache: { id: string; expiresAt: number } | null = null;

async function taxonomyFetch(path: string): Promise<Response> {
  const token = await getApplicationToken();
  return fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      "Accept-Language": "en-US",
    },
  });
}

export async function getDefaultCategoryTreeId(): Promise<string> {
  if (treeIdCache && treeIdCache.expiresAt > Date.now()) {
    return treeIdCache.id;
  }
  try {
    const res = await taxonomyFetch(
      `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE_ID}`,
    );
    if (!res.ok) {
      // eBay 側で一時的にエラーが出ても US の固定 ID 0 で動かせる
      return DEFAULT_TREE_ID_US;
    }
    const data = (await res.json()) as { categoryTreeId?: string };
    const id = data.categoryTreeId ?? DEFAULT_TREE_ID_US;
    treeIdCache = { id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return id;
  } catch {
    return DEFAULT_TREE_ID_US;
  }
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  // root → leaf までのパス (Antiques > Asian Antiques > Japan > ...)
  categoryPath: string;
}

interface RawCategorySuggestion {
  category?: { categoryId?: string; categoryName?: string };
  categoryTreeNodeAncestors?: Array<{ categoryName?: string }>;
}

export async function getCategorySuggestions(
  query: string,
): Promise<CategorySuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const treeId = await getDefaultCategoryTreeId();
  const res = await taxonomyFetch(
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(trimmed)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eBay getCategorySuggestions failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { categorySuggestions?: RawCategorySuggestion[] };
  const out: CategorySuggestion[] = [];
  for (const s of data.categorySuggestions ?? []) {
    const id = s.category?.categoryId;
    const name = s.category?.categoryName;
    if (!id || !name) continue;
    // ancestors はルート→leaf の親方向（leaf 自身は含まれない）
    const ancestors = (s.categoryTreeNodeAncestors ?? [])
      .map((a) => a.categoryName)
      .filter((x): x is string => !!x)
      .reverse();
    out.push({
      categoryId: id,
      categoryName: name,
      categoryPath: [...ancestors, name].join(" > "),
    });
  }
  return out;
}

export interface CategoryNode {
  categoryId: string;
  categoryName: string;
  leaf: boolean;
}

interface RawNode {
  category?: { categoryId?: string; categoryName?: string };
  leafCategoryTreeNode?: boolean;
  childCategoryTreeNodes?: RawNode[];
}

function flattenNodes(node: RawNode, out: CategoryNode[]): void {
  const id = node.category?.categoryId;
  const name = node.category?.categoryName;
  if (id && name) {
    out.push({
      categoryId: id,
      categoryName: name,
      leaf: !!node.leafCategoryTreeNode,
    });
  }
  for (const child of node.childCategoryTreeNodes ?? []) {
    flattenNodes(child, out);
  }
}

/**
 * 指定カテゴリ配下の subtree を leaf 含めフラット化して返す。
 * UI の「サブカテゴリを掘り下げる」用。
 */
export async function getCategorySubtree(
  categoryId: string,
): Promise<CategoryNode[]> {
  const treeId = await getDefaultCategoryTreeId();
  const res = await taxonomyFetch(
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_subtree?category_id=${encodeURIComponent(categoryId)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eBay getCategorySubtree failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { categorySubtreeNode?: RawNode };
  const nodes: CategoryNode[] = [];
  if (data.categorySubtreeNode) flattenNodes(data.categorySubtreeNode, nodes);
  return nodes;
}
