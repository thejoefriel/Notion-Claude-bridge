/**
 * Run database migrations.
 * Usage: npx tsx scripts/migrate.ts
 *
 * This initializes the SQLite database with the required schema.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */

import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import { initializeDatabase } from "../src/db/schema.js";

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve("./data.db");

console.log(`Migrating database at: ${dbPath}`);

const db = new Database(dbPath);
initializeDatabase(db);
db.close();

console.log("Migration complete.");
