// ---------------------------------------------------------------------------
// FastAPI client — the frontend now talks to the Python backend.
// ---------------------------------------------------------------------------

import type {
  AgentState,
  Call,
  CallComment,
  CallEvent,
  Campaign,
  ConversationMessage,
  Customer,
  KnowledgePost,
  ScheduledCall,
  Summary,
} from "./api-types";

export type { Customer };

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the AgentSpeak AI API. Is the FastAPI backend running on " + API_BASE + "?",
      0,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
      // FastAPI validation errors arrive as a list.
      if (Array.isArray(detail)) {
        detail = detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ");
      }
    } catch {
      /* keep statusText */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerInput {
  name: string;
  phone_number: string;
  company_name?: string | null;
  purpose?: string | null;
  product?: string | null;
  industry?: string | null;
}

export const api = {
  // customers
  createCustomer: (body: CustomerInput) =>
    request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(body) }),
  listCustomers: (search?: string) =>
    request<Customer[]>(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getCustomer: (id: number) => request<Customer>(`/api/customers/${id}`),
  updateCustomer: (id: number, body: Partial<CustomerInput>) =>
    request<Customer>(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCustomer: (id: number) =>
    request<void>(`/api/customers/${id}`, { method: "DELETE" }),

  // calls
  createCall: (
    customer_id: number,
    mode: "browser" | "telephony" = "browser",
    from_number?: string,
  ) =>
    request<Call>("/api/calls", {
      method: "POST",
      body: JSON.stringify({ customer_id, mode, from_number }),
    }),
  listCalls: () => request<Call[]>("/api/calls"),
  getCall: (id: number) => request<Call>(`/api/calls/${id}`),
  transcript: (id: number) => request<ConversationMessage[]>(`/api/calls/${id}/transcript`),
  summary: (id: number) => request<Summary>(`/api/calls/${id}/summary`),
  agentState: (id: number) => request<AgentState>(`/api/calls/${id}/state`),
  events: (id: number) => request<CallEvent[]>(`/api/calls/${id}/events`),
  greeting: (id: number) =>
    request<{ greeting: string }>(`/api/calls/${id}/agent/greeting`, { method: "POST" }),
  agentTurn: (id: number, message: string) =>
    request<import("./api-types").AgentTurnResponse>(`/api/calls/${id}/agent/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  agentSilence: (id: number) =>
    request<{ response: string; should_end_call: boolean }>(`/api/calls/${id}/agent/silence`, {
      method: "POST",
    }),
  endCall: (id: number, reason = "Operator ended the call.") =>
    request<Call>(`/api/calls/${id}/end`, {
      method: "POST",
      body: JSON.stringify({ reason, final_status: "completed", outcome: "completed" }),
    }),
  forceEnd: (id: number) => request<Call>(`/api/calls/${id}/force`, { method: "DELETE" }),
  callComments: (id: number) => request<CallComment[]>(`/api/calls/${id}/comments`),
  addComment: (customer_id: number, call_id: number, body: string) =>
    request<CallComment>("/api/comments", {
      method: "POST",
      body: JSON.stringify({ customer_id, call_id, body }),
    }),

  // dashboard
  stats: () => request<import("./api-types").DashboardStats>("/api/dashboard/stats"),

  // campaigns
  listCampaigns: (search?: string) =>
    request<Campaign[]>(`/api/campaigns${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getCampaign: (id: number) => request<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (body: {
    name: string;
    product: string;
    description?: string;
    price?: number;
    price_label?: string;
    category?: string;
    highlights?: string[];
  }) => request<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(body) }),
  seedCampaigns: () => request<Campaign[]>("/api/campaigns/seed", { method: "POST" }),

  // schedule
  listSchedule: () => request<ScheduledCall[]>("/api/schedule"),
  scheduleCall: (body: {
    customer_id: number;
    campaign_id?: number | null;
    scheduled_for: string;
    notes?: string;
  }) => request<ScheduledCall>("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
  cancelSchedule: (id: number) => request<void>(`/api/schedule/${id}`, { method: "DELETE" }),

  // knowledge
  listPosts: (search?: string) =>
    request<KnowledgePost[]>(`/api/knowledge${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createPost: (body: { title: string; body: string; summary?: string; publish?: boolean }) =>
    request<KnowledgePost>("/api/knowledge", { method: "POST", body: JSON.stringify(body) }),
  getPost: (id: number) => request<KnowledgePost>(`/api/knowledge/${id}`),
  setPublished: (id: number, published: boolean) =>
    request<KnowledgePost>(`/api/knowledge/${id}/publish?published=${published}`, { method: "PUT" }),

  // billing
  packs: () =>
    request<Array<{ key: string; name: string; credits: number; amount_usd: number }>>(
      "/api/billing/packs",
    ),
  checkout: (pack_key: string, user_email: string) =>
    request<{ order_id: number; checkout_url: string | null; mode: string; credits_added?: number }>(
      `/api/billing/checkout?pack_key=${pack_key}&user_email=${encodeURIComponent(user_email)}`,
      { method: "POST" },
    ),
  orders: (user_email: string) =>
    request<{ credits: number; orders: Array<Record<string, unknown>> }>(
      `/api/billing/orders?user_email=${encodeURIComponent(user_email)}`,
    ),

  // config
  configStatus: () =>
    request<{
      llm_configured: boolean;
      llm_model: string;
      call_mode: string;
      calling_provider: string;
      stt: string;
      tts: string;
    }>("/api/config/status"),

  wsUrl: (callId: number) => {
    const wsBase = API_BASE.replace(/^http/, "ws");
    return `${wsBase}/ws/calls/${callId}`;
  },
};
