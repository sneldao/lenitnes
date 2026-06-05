import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

// Applies db/schema.sql against DATABASE_URL. Idempotent (uses IF NOT EXISTS).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../../../db/schema.sql");

async function migrate() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  console.log(`Applying schema from ${schemaPath} ...`);
  await pool.query(sql);
  console.log("Migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
