// ---------------------------------------------------------------------------
// Shared agent-field schema — used by the LLM structured output (JSON) and
// validated everywhere so dashboard + agent agree on one definition.
// ---------------------------------------------------------------------------

export const AGENT_FIELD_NAMES = [
  "customer_name",
  "company_name",
  "requirement",
  "ro_capacity",
  "location",
  "budget",
  "timeline",
  "application",
  "additional_requirements",
] as const;
export type AgentFieldName = (typeof AGENT_FIELD_NAMES)[number];
export type AgentFields = Partial<Record<AgentFieldName, string | null>>;

export type NextAction =
  | "ask_question"
  | "clarify"
  | "confirm_details"
  | "close_call";

export interface AgentDecision {
  extracted_data: AgentFields;
  missing_fields: string[];
  next_action: NextAction;
  response: string;
  should_end_call: boolean;
  lead_status:
    | "new"
    | "interested"
    | "qualified"
    | "not_interested"
    | "follow_up";
}

/** Fields that count toward "enough info to close". */
export const REQUIRED_FIELDS: AgentFieldName[] = [
  "requirement",
  "ro_capacity",
  "location",
  "budget",
  "timeline",
  "application",
];

/** Friendly labels for prompting the LLM and showing state in the UI. */
export const FIELD_LABELS: Record<AgentFieldName, string> = {
  customer_name: "customer name",
  company_name: "company name",
  requirement: "requirement",
  ro_capacity: "RO capacity",
  location: "location / city",
  budget: "budget",
  timeline: "timeline",
  application: "application / use case",
  additional_requirements: "additional requirements",
};

export const STAGES = [
  "greeting",
  "discovery",
  "qualifying",
  "closing",
  "ended",
] as const;
export type Stage = (typeof STAGES)[number];

// ---------------------------------------------------------------------------
// Silence policy
// ---------------------------------------------------------------------------

export const SILENCE_MAX_ATTEMPTS = 3;

export function silenceResponse(strike: number): string {
  switch (strike) {
    case 1:
      return "Are you still there?";
    case 2:
      return "I'll wait a little longer — just let me know when you're ready.";
    default:
      return `Thank you for your time. I'll wrap up the call now — have a great day${
        "" // keep template simple
      }.`;
  }
}

export function shouldEndForSilence(strike: number): boolean {
  return strike >= SILENCE_MAX_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// Missing-field detection (dynamic — never re-ask answered questions)
// ---------------------------------------------------------------------------

export function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function missingFields(
  collected: AgentFields,
  required: readonly AgentFieldName[] = REQUIRED_FIELDS,
): string[] {
  return required.filter((f) => !isFilled(collected[f]));
}

// ---------------------------------------------------------------------------
// Stage machine
// ---------------------------------------------------------------------------

export function stageFor(
  collected: AgentFields,
  stage: Stage,
): Stage {
  if (stage === "ended") return "ended";
  const missing = missingFields(collected);
  if (missing.length === 0) return "closing";
  if (missing.length === REQUIRED_FIELDS.length) return "greeting";
  if (collected.requirement && isFilled(collected.requirement)) {
    return missing.length <= 2 ? "qualifying" : "discovery";
  }
  return "discovery";
}

// ---------------------------------------------------------------------------
// Lead status derivation from conversation behaviour
// ---------------------------------------------------------------------------

const NEGATIVE_PATTERNS = [
  /\bnot interested\b/i,
  /\bno thank/i,
  /\bno thanks\b/i,
  /\bstop calling\b/i,
  /\bremove me\b/i,
  /\bdo not call\b/i,
  /\bdon'?t call\b/i,
  /\bnot looking\b/i,
];

const POSITIVE_PATTERNS = [
  /\binterested\b/i,
  /\bsounds good\b/i,
  /\bsure\b/i,
  /\byes please\b/i,
  /\bthat works\b/i,
  /\bi want\b/i,
  /\bi need\b/i,
  /\bwe need\b/i,
  /\blooking for\b/i,
  /\bcould you send\b/i,
  /\bquote\b/i,
  /\bprice\b/i,
];

export function deriveLeadStatus(input: {
  message: string;
  current: "new" | "interested" | "qualified" | "not_interested" | "follow_up";
  newFieldsFilled: number;
}): AgentDecision["lead_status"] {
  const text = input.message || "";
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return "not_interested";
  if (input.current === "not_interested") return "not_interested";
  if (input.newFieldsFilled > 1) return "qualified";
  if (
    input.current === "qualified" ||
    input.current === "interested" ||
    POSITIVE_PATTERNS.some((re) => re.test(text)) ||
    input.newFieldsFilled > 0
  ) {
    return "interested";
  }
  return input.current;
}

// ---------------------------------------------------------------------------
// Structured decision validation / repair
// ---------------------------------------------------------------------------

const NEXT_ACTIONS: NextAction[] = [
  "ask_question",
  "clarify",
  "confirm_details",
  "close_call",
];

/** Clamp an LLM JSON decision into a valid AgentDecision (never trusts output). */
export function coerceDecision(raw: unknown): AgentDecision | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const extracted: AgentFields = {};
  const rawExtracted = obj.extracted_data;
  if (typeof rawExtracted === "object" && rawExtracted !== null) {
    for (const [k, v] of Object.entries(rawExtracted as Record<string, unknown>)) {
      if ((AGENT_FIELD_NAMES as readonly string[]).includes(k)) {
        if (typeof v === "string" && v.trim()) {
          extracted[k as AgentFieldName] = v.trim();
        } else if (v === null) {
          extracted[k as AgentFieldName] = null;
        }
      }
    }
  }

  const missing = Array.isArray(obj.missing_fields)
    ? obj.missing_fields
        .filter((f): f is string => typeof f === "string")
        .filter((f) => (AGENT_FIELD_NAMES as readonly string[]).includes(f))
    : [];

  const nextAction = NEXT_ACTIONS.includes(obj.next_action as NextAction)
    ? (obj.next_action as NextAction)
    : "ask_question";

  const leadStatus = (
    ["new", "interested", "qualified", "not_interested", "follow_up"] as const
  ).includes(obj.lead_status as never)
    ? (obj.lead_status as AgentDecision["lead_status"])
    : "new";

  const response =
    typeof obj.response === "string" && obj.response.trim()
      ? obj.response.trim()
      : "";

  return {
    extracted_data: extracted,
    missing_fields: missing,
    next_action: nextAction,
    response,
    should_end_call: obj.should_end_call === true,
    lead_status: leadStatus,
  };
}

/** Best-effort JSON extraction from an LLM text response. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Find first { ... last } and retry
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
