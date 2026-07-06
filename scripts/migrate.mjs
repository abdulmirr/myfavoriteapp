// apply a migration: node scripts/migrate.mjs [file.sql]  (default: migration.sql)
import { readFileSync } from "node:fs";
import { client } from "./db.mjs";

const file = process.argv[2] ?? "migration.sql";
const sql = readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8");
const db = client();
await db.connect();
try {
  await db.query(sql);
  console.log(`${file} applied`);
} finally {
  await db.end();
}
