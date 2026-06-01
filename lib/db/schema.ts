import type Database from "better-sqlite3";

// ─── Schema Creation ──────────────────────────────────────────────────────────
// Creates all tables and indexes for the in-memory SQLite database.

export function createSchema(db: Database.Database): void {
  db.pragma("foreign_keys = ON");

  // Business data tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_price REAL NOT NULL,
      stock_quantity INTEGER NOT NULL,
      supplier TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      joined_date TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      quantity_sold INTEGER NOT NULL,
      sale_price REAL NOT NULL,
      sale_date TEXT NOT NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // User / session / agent data tables
  // users.semantic_memories — JSON array of { content, created_at } objects,
  // appended after each session; latest is last element.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Anonymous',
      semantic_memories TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // chat_sessions stores:
  //   messages          — JSON array of { id, role, content, created_at } objects
  //   topics            — JSON object keyed by topic_name, each value is
  //                       { content, agent_name, created_at }
  //   episodic_memories — JSON array of { content, created_at } objects,
  //                       appended after each session; latest is last element
  //   agent_registry    — JSON object: { last_finished_agent, registry: { agent_name: { status,
  //                       error_message, runs: [{ system_prompt, started_at, finished_at }] } } }
  //   checkpoints       — JSON array of { message_id, messages_snapshot, created_at } objects.
  //                       Each entry is a snapshot of the messages array taken before a step,
  //                       keyed by the short UUID of the message about to be written.
  //                       To restore: find the entry by message_id, overwrite messages with
  //                       messages_snapshot, and delete stale checkpoint entries.
  // All default to empty JSON structures.
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      system_prompt TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      topics TEXT NOT NULL DEFAULT '{}',
      episodic_memories TEXT NOT NULL DEFAULT '[]',
      agent_registry TEXT NOT NULL DEFAULT '{}',
      checkpoints TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}
