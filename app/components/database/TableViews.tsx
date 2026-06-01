"use client";

import type { DatabaseData } from "@/lib/types";

// ─── Inventory Table ──────────────────────────────────────────────────────────

export function InventoryTable({ data }: { data: DatabaseData["inventory"] }) {
  return (
    <table className="w-full text-xs border-collapse bg-white dark:bg-zinc-800 rounded-xl overflow-hidden shadow-sm">
      <thead>
        <tr className="bg-gray-50 dark:bg-zinc-700/50 text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
          <th className="px-4 py-3 text-left font-medium">ID</th>
          <th className="px-4 py-3 text-left font-medium">Product</th>
          <th className="px-4 py-3 text-left font-medium">Category</th>
          <th className="px-4 py-3 text-right font-medium">Price</th>
          <th className="px-4 py-3 text-right font-medium">Stock</th>
          <th className="px-4 py-3 text-left font-medium">Supplier</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
        {data.map((row) => (
          <tr
            key={row.id}
            className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
          >
            <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono">{row.id}</td>
            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.product_name}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{row.category}</td>
            <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-mono">
              ${row.unit_price.toFixed(2)}
            </td>
            <td className="px-4 py-3 text-right text-gray-600 dark:text-zinc-400 font-mono">
              {row.stock_quantity}
            </td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{row.supplier}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Customers Table ──────────────────────────────────────────────────────────

export function CustomersTable({ data }: { data: DatabaseData["customers"] }) {
  return (
    <table className="w-full text-xs border-collapse bg-white dark:bg-zinc-800 rounded-xl overflow-hidden shadow-sm">
      <thead>
        <tr className="bg-gray-50 dark:bg-zinc-700/50 text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
          <th className="px-4 py-3 text-left font-medium">ID</th>
          <th className="px-4 py-3 text-left font-medium">Name</th>
          <th className="px-4 py-3 text-left font-medium">Email</th>
          <th className="px-4 py-3 text-left font-medium">City</th>
          <th className="px-4 py-3 text-left font-medium">Joined</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
        {data.map((row) => (
          <tr
            key={row.id}
            className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
          >
            <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono">{row.id}</td>
            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
              {row.first_name} {row.last_name}
            </td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 font-mono">{row.email}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{row.city}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 font-mono">{row.joined_date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Sales Table ──────────────────────────────────────────────────────────────

export function SalesTable({ data }: { data: DatabaseData["sales"] }) {
  return (
    <table className="w-full text-xs border-collapse bg-white dark:bg-zinc-800 rounded-xl overflow-hidden shadow-sm">
      <thead>
        <tr className="bg-gray-50 dark:bg-zinc-700/50 text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
          <th className="px-4 py-3 text-left font-medium">ID</th>
          <th className="px-4 py-3 text-left font-medium">Product</th>
          <th className="px-4 py-3 text-left font-medium">Customer</th>
          <th className="px-4 py-3 text-right font-medium">Qty</th>
          <th className="px-4 py-3 text-right font-medium">Price</th>
          <th className="px-4 py-3 text-left font-medium">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
        {data.map((row) => (
          <tr
            key={row.id}
            className="hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
          >
            <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono">{row.id}</td>
            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.product_name}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{row.customer_name}</td>
            <td className="px-4 py-3 text-right text-gray-600 dark:text-zinc-400 font-mono">
              {row.quantity_sold}
            </td>
            <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-mono">
              ${row.sale_price.toFixed(2)}
            </td>
            <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 font-mono">{row.sale_date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
