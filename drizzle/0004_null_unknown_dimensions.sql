-- 「わからないものは入れない」方針: カテゴリ由来のデフォルト値が DB に
-- 書き込まれていた寸法・重量・eBay aspects を一旦すべて null に戻す。
-- 以後は parseDimensions() で説明文から抽出できた値、または手入力された
-- 値のみが格納される。aspects は出品時に mapping.ts が
-- category.defaultAspects にフォールバックする。
UPDATE items SET
  weight_g = NULL,
  length_cm = NULL,
  width_cm = NULL,
  height_cm = NULL,
  ebay_aspects = NULL;
