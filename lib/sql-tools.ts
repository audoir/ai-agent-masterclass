import { z } from "zod";
import { getDb } from "@/lib/db/index";

// ── Read SQL input schema ─────────────────────────────────────────────────────
export const sqlReadInputSchema = z.object({
  sql: z
    .string()
    .describe("A valid SQLite SELECT statement."),
  params: z
    .array(z.union([z.string(), z.number(), z.null()]))
    .optional()
    .describe(
      "Positional parameter values that replace '?' placeholders in the SQL statement.",
    ),
});

export type SqlReadInput = z.infer<typeof sqlReadInputSchema>;

// ── Update SQL input schema ───────────────────────────────────────────────────
export const sqlUpdateInputSchema = z.object({
  sql: z
    .string()
    .describe("A valid SQLite INSERT, UPDATE, or DELETE statement."),
  params: z
    .array(z.union([z.string(), z.number(), z.null()]))
    .optional()
    .describe(
      "Positional parameter values that replace '?' placeholders in the SQL statement.",
    ),
});

export type SqlUpdateInput = z.infer<typeof sqlUpdateInputSchema>;

// ── Read execute factory (SELECT only) ───────────────────────────────────────
export function makeSqlReadExecute(toolName: string) {
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const db = getDb();
    try {
      const normalised = sql.trim().toUpperCase();
      if (!normalised.startsWith("SELECT")) {
        throw new Error("Only SELECT statements are allowed.");
      }
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      const result = { success: true, count: rows.length, rows };

      return result;
    } catch (err) {
      const result = { success: false, error: String(err) };
      return result;
    }
  };
}

// ── Update execute factory (INSERT, UPDATE, DELETE only) ─────────────────────
export function makeSqlUpdateExecute(toolName: string) {
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const db = getDb();
    try {
      const normalised = sql.trim().toUpperCase();
      if (
        !normalised.startsWith("INSERT") &&
        !normalised.startsWith("UPDATE") &&
        !normalised.startsWith("DELETE")
      ) {
        throw new Error("Only INSERT, UPDATE, and DELETE statements are allowed.");
      }
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return {
        success: true,
        insertedId: info.lastInsertRowid,
        changes: info.changes,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  };
}

// ── MCP-style read execute factory ───────────────────────────────────────────
export function makeMcpSqlReadExecute(toolName: string) {
  const execute = makeSqlReadExecute(toolName);
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const result = await execute({ sql, params });
    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { tool: toolName, success: false, error: (result as { error: string }).error },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tool: toolName, ...result }, null, 2),
        },
      ],
    };
  };
}

// ── MCP-style update execute factory ─────────────────────────────────────────
export function makeMcpSqlUpdateExecute(toolName: string) {
  const execute = makeSqlUpdateExecute(toolName);
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const result = await execute({ sql, params });
    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { tool: toolName, success: false, error: (result as { error: string }).error },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tool: toolName, ...result }, null, 2),
        },
      ],
    };
  };
}

// ── Tool descriptions ─────────────────────────────────────────────────────────
export const READ_TOOL_DESCRIPTIONS = {
  inventory:
    "Run a SELECT SQL statement against the inventory table (columns: id, product_name, category, unit_price, stock_quantity, supplier, created_at). IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching. Run SELECT DISTINCT category FROM inventory first to discover the exact category names before filtering.",
  customers:
    "Run a SELECT SQL statement against the customers table (columns: id, first_name, last_name, email, city, joined_date). IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching.",
  sales:
    "Run a SELECT SQL statement against the sales table (columns: id, inventory_id, customer_id, quantity_sold, sale_price, sale_date). JOINs with inventory and customers are allowed. IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching.",
};

export const UPDATE_TOOL_DESCRIPTIONS = {
  inventory:
    "Run an INSERT, UPDATE, or DELETE SQL statement against the inventory table (columns: id, product_name, category, unit_price, stock_quantity, supplier, created_at). Use INSERT to add a new product, UPDATE to modify existing products, or DELETE to remove products. IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching.",
  customers:
    "Run an INSERT, UPDATE, or DELETE SQL statement against the customers table (columns: id, first_name, last_name, email, city, joined_date). Use INSERT to add a new customer, UPDATE to modify existing customers, or DELETE to remove customers. IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching.",
  sales:
    "Run an INSERT, UPDATE, or DELETE SQL statement against the sales table (columns: id, inventory_id, customer_id, quantity_sold, sale_price, sale_date). Use INSERT to record a new sale, UPDATE to modify existing sales, or DELETE to remove sales records. IMPORTANT: text comparisons in SQLite are case-sensitive — use LOWER(column) = LOWER(?) or LIKE for case-insensitive matching.",
};
