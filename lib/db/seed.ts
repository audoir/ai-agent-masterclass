import type Database from "better-sqlite3";

// ─── Seed Data ────────────────────────────────────────────────────────────────
// Populates the database with initial business data (inventory, customers, sales).

export function seedDatabase(db: Database.Database): void {
  seedInventory(db);
  seedCustomers(db);
  seedSales(db);
}

function seedInventory(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT INTO inventory (product_name, category, unit_price, stock_quantity, supplier)
    VALUES (?, ?, ?, ?, ?)
  `);

  const items: [string, string, number, number, string][] = [
    ["Wireless Keyboard", "Electronics", 49.99, 150, "TechSupply Co."],
    ["USB-C Hub", "Electronics", 34.99, 200, "TechSupply Co."],
    ["Ergonomic Mouse", "Electronics", 59.99, 120, "PeripheralsPro"],
    ["Standing Desk Mat", "Office Furniture", 39.99, 75, "ComfortOffice Ltd."],
    ["Noise-Cancelling Headphones", "Electronics", 129.99, 60, "AudioWorld"],
    ["Mechanical Pencil Set", "Stationery", 12.99, 500, "WriteRight Inc."],
    ["Whiteboard Markers (12-pack)", "Stationery", 8.99, 300, "WriteRight Inc."],
    ["Laptop Stand", "Electronics", 44.99, 90, "TechSupply Co."],
    ["Office Chair", "Office Furniture", 249.99, 30, "ComfortOffice Ltd."],
    ["Desk Lamp", "Office Furniture", 29.99, 110, "BrightSpace"],
  ];

  db.transaction((rows: typeof items) => {
    for (const row of rows) insert.run(...row);
  })(items);
}

function seedCustomers(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT INTO customers (first_name, last_name, email, city, joined_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  const items: [string, string, string, string, string][] = [
    ["Alice", "Johnson", "alice.johnson@email.com", "San Francisco", "2024-01-15"],
    ["Bob", "Smith", "bob.smith@email.com", "New York", "2024-02-20"],
    ["Carol", "White", "carol.white@email.com", "Chicago", "2024-03-05"],
    ["David", "Brown", "david.brown@email.com", "Austin", "2024-03-18"],
    ["Eve", "Davis", "eve.davis@email.com", "Seattle", "2024-04-02"],
    ["Frank", "Miller", "frank.miller@email.com", "Denver", "2024-05-10"],
    ["Grace", "Wilson", "grace.wilson@email.com", "Boston", "2024-06-22"],
    ["Henry", "Moore", "henry.moore@email.com", "Miami", "2024-07-14"],
  ];

  db.transaction((rows: typeof items) => {
    for (const row of rows) insert.run(...row);
  })(items);
}

function seedSales(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT INTO sales (inventory_id, customer_id, quantity_sold, sale_price, sale_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  const items: [number, number, number, number, string][] = [
    [1, 1, 2, 49.99, "2026-01-05"],
    [2, 2, 5, 34.99, "2026-01-08"],
    [3, 3, 1, 59.99, "2026-01-12"],
    [5, 4, 3, 119.99, "2026-01-15"],
    [8, 1, 1, 44.99, "2026-01-20"],
    [6, 5, 10, 12.99, "2026-02-03"],
    [9, 6, 2, 239.99, "2026-02-07"],
    [4, 7, 3, 39.99, "2026-02-14"],
    [10, 8, 6, 29.99, "2026-02-18"],
    [2, 1, 2, 34.99, "2026-02-25"],
    [7, 2, 8, 8.99, "2026-03-01"],
    [3, 4, 2, 59.99, "2026-03-05"],
    [5, 5, 1, 129.99, "2026-03-10"],
    [1, 3, 3, 49.99, "2026-03-15"],
    [8, 6, 2, 44.99, "2026-03-20"],
    [10, 2, 1, 29.99, "2026-03-25"],
    [6, 7, 5, 12.99, "2026-04-02"],
    [9, 8, 1, 249.99, "2026-04-08"],
    [1, 5, 1, 49.99, "2026-04-12"],
    [4, 1, 2, 39.99, "2026-04-18"],
  ];

  db.transaction((rows: typeof items) => {
    for (const row of rows) insert.run(...row);
  })(items);
}
