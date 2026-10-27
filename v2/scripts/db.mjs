// shared pg client for scripts — reads SUPABASE_DB_URL from .env.local
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

export function client() {
  return new pg.Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
}

export { env };
