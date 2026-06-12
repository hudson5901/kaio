import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ユーザーテーブル
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).default("member").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").default(sql`now()`).notNull(),
  lastLoginAt: text("last_login_at"),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// セッションテーブル
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`now()`).notNull(),
});

export type Session = typeof sessions.$inferSelect;

export const items = pgTable("items", {
  id: text("id").primaryKey(),

  // メルカリ情報
  mercariId: text("mercari_id").unique(),
  mercariUrl: text("mercari_url").notNull(),
  mercariTitle: text("mercari_title").notNull(),
  mercariDescription: text("mercari_description"),
  mercariPrice: integer("mercari_price").notNull(), // 円
  mercariImages: text("mercari_images"), // JSON array of URLs
  mercariStatus: text("mercari_status", {
    enum: ["available", "sold", "deleted"]
  }).default("available").notNull(),
  mercariSeller: text("mercari_seller"),
  mercariCategory: text("mercari_category"), // e.g. "家具・インテリア > インテリア小物 > 置物"
  mercariCondition: text("mercari_condition"), // e.g. "新品、未使用", "目立った傷や汚れなし"
  mercariShippingFrom: text("mercari_shipping_from"), // e.g. "兵庫県"
  mercariFeatures: text("mercari_features"), // JSON: {"素材": "合成皮革"}
  mercariLikes: integer("mercari_likes"),
  mercariListedAt: text("mercari_listed_at"), // 出品日

  // eBay情報
  ebayListingId: text("ebay_listing_id"),
  ebayOfferId: text("ebay_offer_id"),
  ebayPriceUsd: real("ebay_price_usd"),
  ebayTitle: text("ebay_title"),
  ebayDescription: text("ebay_description"),
  ebayTitleJa: text("ebay_title_ja"),
  ebayDescriptionJa: text("ebay_description_ja"),
  ebayAspectsJa: text("ebay_aspects_ja"),
  ebayStatus: text("ebay_status", {
    enum: ["draft", "listed", "sold", "removed"]
  }).default("draft").notNull(),

  // 加工済み画像
  processedImages: text("processed_images"), // JSON array of local paths

  // サイズ・重量（説明文からパース）
  weightG: real("weight_g"),
  lengthCm: real("length_cm"),
  widthCm: real("width_cm"),
  heightCm: real("height_cm"),

  // 費用計算
  shippingCostUsd: real("shipping_cost_usd"),
  customsDutyUsd: real("customs_duty_usd"),
  ebayFeeUsd: real("ebay_fee_usd"),
  adCostUsd: real("ad_cost_usd"),
  estimatedProfitUsd: real("estimated_profit_usd"),

  // 兜カテゴリ分類
  kabutoCategory: text("kabuto_category"), // "A"~"F"
  kabutoCategoryConfidence: real("kabuto_category_confidence"), // 0.0~1.0
  ebayAspects: text("ebay_aspects"), // JSON: {"Type": ["Kabuto"], "Material": ["Iron"], ...}

  // 判定ステータス (出品/検討/パス/メルカリ在庫なし)
  decision: text("decision", {
    enum: ["list", "considering", "pass", "out_of_stock"],
  }),

  // AIスコアリング
  aiScore: real("ai_score"), // 0-100, 高いほど利益が出やすい
  aiScoreReason: text("ai_score_reason"),

  // 出品準備チェック - スタッフ毎の確認状況
  // JSON: { [checkKey]: { [userId]: ISO timestamp } }
  staffChecks: text("staff_checks"),
  allCheckedAt: text("all_checked_at"), // AI+全スタッフ確認完了日時
  listingScheduledAt: text("listing_scheduled_at"), // 出品予定日 (YYYY-MM-DD)

  // タイムスタンプ
  createdAt: text("created_at").default(sql`now()`).notNull(),
  updatedAt: text("updated_at").default(sql`now()`).notNull(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

// 通知テーブル
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: ["sold", "deleted", "price_change", "new_items", "error"],
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  itemId: text("item_id"),
  read: boolean("read").default(false).notNull(),
  createdAt: text("created_at").default(sql`now()`).notNull(),
});

export type Notification = typeof notifications.$inferSelect;

// コメントテーブル
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`now()`).notNull(),
});

export type Comment = typeof comments.$inferSelect;

// タスクテーブル
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["pending", "in_progress", "done"],
  }).default("pending").notNull(),
  priority: text("priority", {
    enum: ["low", "medium", "high"],
  }).default("medium").notNull(),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`now()`).notNull(),
  updatedAt: text("updated_at").default(sql`now()`).notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
