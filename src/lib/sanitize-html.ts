/**
 * 軽量HTMLサニタイザ。AI生成された商品説明用の <h3>/<p>/<strong>/<em>/<ul>/<li>/<ol>/<br>
 * のみを許可し、その他のタグ・属性・javascript: URL は除去する。
 *
 * DOMPurify を依存に入れたくないので、AI生成テキストの想定タグだけを残す方針。
 * 完璧な XSS 対策ではないが、AI由来HTMLとしての最低限のリスクは抑える。
 */

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "b", "em", "i", "u",
  "ul", "ol", "li",
  "span", "div",
]);

export function sanitizeListingHtml(input: string | null | undefined): string {
  if (!input) return "";
  let s = input;
  // <script>...</script>, <style>...</style>, <iframe>...</iframe> はタグ＋中身ごと削除
  s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // 自己終端でも危険なものは削る
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "");
  // 許可タグだけ残す。属性は全部剥がす (style/class含む)。
  s = s.replace(/<\s*\/?\s*([a-zA-Z0-9]+)\b[^>]*>/g, (_match, tagRaw: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = /^<\s*\//.test(_match);
    const isVoid = tag === "br" || tag === "hr";
    if (isClosing) return `</${tag}>`;
    return isVoid ? `<${tag}>` : `<${tag}>`;
  });
  return s;
}
