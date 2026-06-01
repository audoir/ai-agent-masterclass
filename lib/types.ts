export interface InventoryItem {
  id: number;
  product_name: string;
  category: string;
  unit_price: number;
  stock_quantity: number;
  supplier: string;
  created_at: string;
}

export interface CustomerItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  joined_date: string;
}

export interface SaleItem {
  id: number;
  inventory_id: number;
  product_name: string;
  customer_id: number;
  customer_name: string;
  quantity_sold: number;
  sale_price: number;
  sale_date: string;
}

// A single semantic memory entry stored in the users.semantic_memories JSON array.
// Entries are appended after each session; the latest is last.
export interface SemanticMemoryItem {
  content: string;
  created_at: string;
}

export interface UserItem {
  id: string;
  display_name: string;
  created_at: string;
  session_count?: number;
  semantic_memories?: SemanticMemoryItem[];
}

// A single message stored in the chat_sessions.messages JSON array.
export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at: string;
}

// A single topic entry stored in the chat_sessions.topics JSON object.
// The key is the topic_name; the value is this object.
export interface TopicItem {
  content: string;
  agent_name: string;
  created_at: string;
}

// A single episodic memory entry stored in the chat_sessions.episodic_memories
// JSON array. Entries are appended after each session; the latest is last.
export interface EpisodicMemoryItem {
  content: string;
  created_at: string;
}

export type AgentStatus = "running" | "done" | "error";

// A single agent run stored inside AgentRegistryEntry.runs.
export interface AgentRun {
  system_prompt: string | null;
  started_at: string;
  finished_at: string | null;
}

// The value stored per agent_name in chat_sessions.agent_registry.registry.
export interface AgentRegistryEntry {
  status: AgentStatus;
  error_message: string | null;
  runs: AgentRun[];
}

// The top-level shape of chat_sessions.agent_registry JSON.
// last_finished_agent tracks which agent most recently completed so the swarm
// loop can resume from the right specialist on follow-up prompts.
export interface AgentRegistryData {
  last_finished_agent: string | null;
  registry: Record<string, AgentRegistryEntry>;
}

// Flat representation used by the UI and SSE routes (agent_name is the key
// from the registry object, spread alongside the entry fields).
export interface AgentRegistryItem extends AgentRegistryEntry {
  agent_name: string;
}

export interface ChatSessionItem {
  id: string;
  user_id: string | null;
  system_prompt?: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  messages?: ChatMessageItem[];
  topics?: Record<string, TopicItem>;
  episodic_memories?: EpisodicMemoryItem[];
  agent_registry?: Record<string, AgentRegistryEntry>;
}

export interface DatabaseData {
  inventory: InventoryItem[];
  customers: CustomerItem[];
  sales: SaleItem[];
  users: UserItem[];
  chat_sessions: ChatSessionItem[];
}

export type ActiveTable = "inventory" | "customers" | "sales";
