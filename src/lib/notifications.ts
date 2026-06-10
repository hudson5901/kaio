import { db, schema } from "@/lib/db";
import { v4 as uuid } from "uuid";

type NotificationType = "sold" | "deleted" | "price_change" | "new_items" | "error";

export async function createNotification(
  type: NotificationType,
  title: string,
  message: string,
  itemId?: string
) {
  try {
    await db.insert(schema.notifications).values({
      id: uuid(),
      type,
      title,
      message,
      itemId: itemId || null,
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}
