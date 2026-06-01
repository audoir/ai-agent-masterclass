import { createMcpHandler } from "mcp-handler";
import { makeMcpSqlReadExecute, READ_TOOL_DESCRIPTIONS, sqlReadInputSchema } from "@/lib/sql-tools";

export const runtime = "nodejs";

function makeHandler(request: Request) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "read-inventory",
        {
          title: "Inventory Table",
          description: READ_TOOL_DESCRIPTIONS.inventory,
          inputSchema: sqlReadInputSchema.shape,
        },
        makeMcpSqlReadExecute("inventory"),
      );

      server.registerTool(
        "read-customers",
        {
          title: "Customers Table",
          description: READ_TOOL_DESCRIPTIONS.customers,
          inputSchema: sqlReadInputSchema.shape,
        },
        makeMcpSqlReadExecute("customers"),
      );

      server.registerTool(
        "read-sales",
        {
          title: "Sales Table",
          description: READ_TOOL_DESCRIPTIONS.sales,
          inputSchema: sqlReadInputSchema.shape,
        },
        makeMcpSqlReadExecute("sales"),
      );
    },
    {},
    {
      basePath: "/api/mcp/database/read",
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
