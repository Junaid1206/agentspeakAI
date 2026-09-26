/** Types mirroring backend/app/schemas.py responses. */

export interface Customer {
  id: number;
  name: string;
  phone_number: string;
  company_name: string | null;
  purpose: string | null;
  product: string | null;
  created_at: string;
}

export interface Call {
  id: number;
  customer_id: number;
  provider_call_id: string | null;
  mode: "browser" | "telephony";
  direction: string;
  status: string;
  outcome: string;
  lead_status: string;
  follow_up_required: boolean;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  customer: Customer | null;
}

export interface ConversationMessage {
  id: number;
  speaker: "customer" | "ai" | "system";
  message: string;
  sequence_number: number;
  timestamp: string;
}

export interface Summary {
  id: number;
  call_id: number;
  summary: string;
  customer_intent: string | null;
  key_requirements: string[] | null;
  budget: string | null;
  timeline: string | null;
  location: string | null;
  application: string | null;
  follow_up_required: boolean;
  lead_status: string;
  outcome: string;
  generated_at: string;
}

export interface AgentState {
  collected: Record<string, string | null>;
  missing_fields: string[];
  stage: string;
  turn_count: number;
}

export interface CallEvent {
  id: number;
  event: string;
  detail: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  active_calls: number;
  interested_leads: number;
  follow_ups_required: number;
  avg_duration_seconds: number;
  total_customers: number;
  conversion_rate: number;
  calls_by_status: Record<string, number>;
}

export interface AgentTurnResponse {
  response: string;
  should_end_call: boolean;
  lead_status: string;
  collected?: Record<string, string | null>;
  missing_fields?: string[];
  stage?: string;
  agent_error: boolean;
}

export interface Campaign {
  id: number;
  name: string;
  product: string;
  description: string | null;
  price: number;
  price_label: string;
  category: string;
  highlights: string[];
  active: boolean;
}

export interface ScheduledCall {
  id: number;
  customer_id: number;
  campaign_id: number | null;
  campaign_name: string | null;
  scheduled_for: string;
  notes: string | null;
  status: string;
  customer: Customer | null;
}

export interface CallComment {
  id: number;
  call_id: number | null;
  customer_id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface KnowledgePost {
  id: number;
  title: string;
  body: string;
  summary: string | null;
  author: string;
  published: boolean;
  created_at: string;
}
