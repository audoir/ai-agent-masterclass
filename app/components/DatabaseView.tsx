"use client";

import { useState } from "react";
import type { ActiveTable } from "@/lib/types";
import {
  InventoryTable,
  CustomersTable,
  SalesTable,
} from "./database/TableViews";
import { useDatabaseStream } from "@/app/hooks/useDatabaseStream";

// ─── DatabaseView ─────────────────────────────────────────────────────────────
//
// Business data — Inventory, Customers, Sales (seeded tables).
//
// User state (Users → Sessions → Messages + Agent Topics) is now accessible
// directly in each agent tab (Orchestrator, Swarm, Checkpoints, HITL) via
// the 🔑 User State inner tab.
//
// Sub-components live in app/components/database/:
//   - TableViews.tsx  — InventoryTable, CustomersTable, SalesTable, SingleUserView
//   - SessionCard.tsx — expandable session with inner tabs
//   - TopicRow.tsx    — expandable agent topic row
//   - MessageBubble.tsx — chat message bubble
//   - constants.ts    — AGENT_COLORS
//
// Data is streamed live via SSE — see app/hooks/useDatabaseStream.ts
// ─────────────────────────────────────────────────────────────────────────────

type BusinessTable = "inventory" | "customers" | "sales";

export default function DatabaseView({ isActive = true }: { isActive?: boolean }) {
  const { data, loading, error } = useDatabaseStream({ enabled: isActive });
  const [activeTable, setActiveTable] = useState<BusinessTable>("inventory");

  const tables: { key: BusinessTable; label: string; emoji: string }[] = [
    { key: "inventory", label: "Inventory", emoji: "📦" },
    { key: "customers", label: "Customers", emoji: "👥" },
    { key: "sales", label: "Sales", emoji: "💰" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-130px)]">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-130px)]">
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const rowCounts: Record<BusinessTable, number> = {
    inventory: data.inventory.length,
    customers: data.customers.length,
    sales: data.sales.length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white text-sm">
              🗄️
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">SQLite Database</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                In-memory · {tables.length} tables · User state available in each agent tab
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table tabs */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-6">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {tables.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTable(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTable === t.key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTable === t.key
                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                    : "bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400"
                }`}
              >
                {rowCounts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-zinc-900 p-4">
        <div className="max-w-6xl mx-auto">
          {activeTable === "inventory" && <InventoryTable data={data.inventory} />}
          {activeTable === "customers" && <CustomersTable data={data.customers} />}
          {activeTable === "sales" && <SalesTable data={data.sales} />}
        </div>
      </div>
    </div>
  );
}
