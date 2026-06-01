import Database from "better-sqlite3";
import { createSchema } from "./schema";
import { seedDatabase } from "./seed";

// ─── Database Singleton ───────────────────────────────────────────────────────
// Returns the shared in-memory SQLite database instance, creating and seeding
// it on first access.

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(":memory:");
  createSchema(db);
  seedDatabase(db);

  return db;
}
