import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import fs from "node:fs";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const raw = fs.readFileSync("drizzle/0005_add_ebay_category.sql", "utf-8");
  const cleaned = raw.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  const statements = cleaned.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    console.log("→", stmt);
    await sql.unsafe(stmt);
  }
  // Verify
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'items'
      AND column_name IN ('ebay_category_id', 'ebay_category_path')
    ORDER BY column_name`;
  console.log("Columns now present:", cols.map(c => c.column_name).join(", "));
  console.log("OK: migration applied");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
