"use client";

import { useState } from "react";
import DatabaseView from "@/app/components/DatabaseView";
import OrchestratorAgents from "@/app/components/OrchestratorAgents";
import SwarmAgents from "@/app/components/SwarmAgents";
import CheckpointsView from "@/app/components/CheckpointsView";
import HitlAgents from "@/app/components/HitlAgents";

type Tab = "database" | "orchestrator" | "swarm" | "checkpoints" | "hitl";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("database");

  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: "database", label: "View Database", emoji: "🗄️" },
    { key: "orchestrator", label: "Orchestrator", emoji: "🤖" },
    { key: "swarm", label: "Swarm Agents", emoji: "🐝" },
    { key: "checkpoints", label: "Checkpoints", emoji: "🔖" },
    { key: "hitl", label: "HITL", emoji: "🧑‍💻" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Top nav */}
      <nav className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-4">
        <div className="max-w-6xl mx-auto flex items-center gap-1 h-[52px]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content — keep all mounted so state is preserved when switching tabs.
          Each component receives isActive so it can pause SSE connections when hidden,
          staying within the browser's 6-connection HTTP/1.1 limit. */}
      <main>
        <div className={activeTab === "database" ? "block" : "hidden"}>
          <DatabaseView isActive={activeTab === "database"} />
        </div>
        <div className={activeTab === "orchestrator" ? "block" : "hidden"}>
          <OrchestratorAgents isActive={activeTab === "orchestrator"} />
        </div>
        <div className={activeTab === "swarm" ? "block" : "hidden"}>
          <SwarmAgents isActive={activeTab === "swarm"} />
        </div>
        <div className={activeTab === "checkpoints" ? "block" : "hidden"}>
          <CheckpointsView isActive={activeTab === "checkpoints"} />
        </div>
        <div className={activeTab === "hitl" ? "block" : "hidden"}>
          <HitlAgents isActive={activeTab === "hitl"} />
        </div>
      </main>
    </div>
  );
}
