import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import fs from "node:fs";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const raw = fs.readFileSync("drizzle/0006_add_ebay_stats.sql", "utf-8");
  const cleaned = raw.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  const statements = cleaned.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    console.log("→", stmt);
    await sql.unsafe(stmt);
  }
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'items'
      AND column_name IN ('ebay_hit_count', 'ebay_watch_count', 'ebay_stats_updated_at')
    ORDER BY column_name`;
  console.log("Columns now present:", cols.map(c => c.column_name).join(", "));
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
