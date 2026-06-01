import { createMcpHandler } from "mcp-handler";
import { makeMcpSqlUpdateExecute, UPDATE_TOOL_DESCRIPTIONS, sqlUpdateInputSchema } from "@/lib/sql-tools";

export const runtime = "nodejs";

function makeHandler(request: Request) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "update-inventory",
        {
          title: "Inventory Table (Write)",
          description: UPDATE_TOOL_DESCRIPTIONS.inventory,
          inputSchema: sqlUpdateInputSchema.shape,
        },
        makeMcpSqlUpdateExecute("inventory"),
      );

      server.registerTool(
        "update-customers",
        {
          title: "Customers Table (Write)",
          description: UPDATE_TOOL_DESCRIPTIONS.customers,
          inputSchema: sqlUpdateInputSchema.shape,
        },
        makeMcpSqlUpdateExecute("customers"),
      );

      server.registerTool(
        "update-sales",
        {
          title: "Sales Table (Write)",
          description: UPDATE_TOOL_DESCRIPTIONS.sales,
          inputSchema: sqlUpdateInputSchema.shape,
        },
        makeMcpSqlUpdateExecute("sales"),
      );
    },
    {},
    {
      basePath: "/api/mcp/database/update",
      maxDuration: 60,
      verboseLogs: true,
    },
  );
}

export async function GET(request: Request) {
  return makeHandler(request)(request);
}

export async function POST(request: Request) {
  return makeHandler(request)(request);
}
