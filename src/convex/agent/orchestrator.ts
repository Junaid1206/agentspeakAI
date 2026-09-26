// ---------------------------------------------------------------------------
// Agent orchestrator — the core loop of the calling agent.
//
// Per customer turn:
//   store customer message -> load state + transcript -> LLM structured
//   decision -> coerce/validate -> persist state + AI message + lead status
//   -> return speech text.
//
// All DB access goes through internal queries/mutations (Convex actions cannot
// touch the database directly). LLM access goes through LLMProvider.
// ---------------------------------------------------------------------------

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { llm, LLM_MODEL } from "./llm";
import {
  AGENT_FIELD_NAMES,
  missingFields,
  stageFor,
  deriveLeadStatus,
  silenceResponse,
  shouldEndForSilence,
  coerceDecision,
  type AgentFields,
} from "./rules";

/** Compact LLM context: system prompt + last N raw messages + structured state. */
function buildMessages(
  transcript: { speaker: string; message: string }[],
  collected: AgentFields,
  stage: string,
  customerName: string,
  product: string,
) {
  const RECENT = 12;
  const recent = transcript.slice(-RECENT);

  const stateLines = AGENT_FIELD_NAMES.map((f) => {
    const value = collected[f];
    return `${f}: ${typeof value === "string" && value.trim() ? value : "—"}`;
  });

  const missing = missingFields(collected);
  const stageHint =
    stage === "greeting"
      ? "The call just started. Confirm the person and state the purpose of the call."
      : stage === "closing"
        ? "All key details are collected. Recap the details, ask if anything else is needed, then close politely."
        : "Continue discovery/qualifying for the missing details.";

  const system = [
    `You are Aria, a professional outbound AI calling agent for WaterFlow Solutions, a commercial RO (reverse-osmosis) water treatment company.`,
    `You are speaking over a live voice call. Keep every response to ONE or TWO short, natural spoken sentences (under 45 words). No emojis, no markdown, no lists.`,
    `Purpose of the call: introduce ${product} and collect the customer's requirements.`,
    customerName
      ? `The customer's name is ${customerName}.`
      : `You don't know the customer's name yet; learn it naturally.`,
    ``,
    `CURRENT AGENT STATE (structured):`,
    ...stateLines,
    ``,
    `MISSING FIELDS: ${missing.length ? missing.join(", ") : "none"}`,
    `CONVERSATION STAGE: ${stage}. ${stageHint}`,
    ``,
    `RULES:`,
    `- NEVER ask for a field already filled in the state. Never repeat an answered question.`,
    `- Ask for exactly ONE missing field per turn.`,
    `- If the latest customer message is unclear, set next_action="clarify" and ask a short clarifying question.`,
    `- Resolve references like "same hotel", "that city", "around one lakh", "next month" into state.`,
    `- If the customer declines or asks you to stop: should_end_call=true, lead_status="not_interested".`,
    `- When all key fields are collected: recap once, then next_action="close_call", should_end_call=true.`,
    `- extracted_data should include fields learnable from the WHOLE conversation (null when unknown).`,
    ``,
    `Respond with STRICT JSON only, no prose:`,
    `{"extracted_data": {${AGENT_FIELD_NAMES.join(": string|null, ")}}: string|null}, "missing_fields": string[], "next_action": "ask_question"|"clarify"|"confirm_details"|"close_call", "response": "what you say aloud", "should_end_call": boolean, "lead_status": "new"|"interested"|"qualified"|"not_interested"|"follow_up"}`,
  ].join("\n");

  const history = recent.map((m) => ({
    role: m.speaker === "ai" ? ("assistant" as const) : ("user" as const),
    content: m.message,
  }));

  return [{ role: "system" as const, content: system }, ...history];
}

interface TurnResult {
  response: string;
  should_end_call: boolean;
  lead_status: string;
  collected?: AgentFields;
  missing_fields?: string[];
  stage?: string;
  agent_error?: boolean;
  error?: string;
}

/** Count fields that became filled after this turn. */
function countNewFields(before: AgentFields, after: AgentFields): number {
  let n = 0;
  for (const f of AGENT_FIELD_NAMES) {
    const was = before[f];
    const is = after[f];
    if (typeof is === "string" && is.trim() && typeof was !== "string") n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Open the call: connected status + AI greeting message + initial state row. */
export const greeting = action({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args): Promise<{ greeting: string }> => {
    const call = await ctx.runQuery(internal.callsInternals.getCall, { call_id: args.call_id });
    if (!call) throw new Error("Call not found.");
    const customer = await ctx.runQuery(internal.callsInternals.getCustomer, {
      customer_id: call.customer_id,
    });
    if (!customer) throw new Error("Customer not found.");

    const firstName = customer.name.split(" ")[0] || customer.name;
    const product = customer.product || "water treatment";
    const text = `Hello ${firstName}, this is Aria calling from WaterFlow Solutions regarding your ${product} enquiry. Do you have a couple of minutes?`;

    await ctx.runMutation(internal.callsInternals.recordAiMessage, {
      call_id: args.call_id,
      message: text,
      metadata: { event: "greeting" },
    });
    await ctx.runMutation(internal.callsInternals.setAgentState, {
      call_id: args.call_id,
      collected: {},
      stage: "greeting",
    });
    await ctx.runMutation(internal.callsInternals.logEvent, {
      call_id: args.call_id,
      event: "call_connected",
      detail: "Greeting delivered",
    });

    return { greeting: text };
  },
});

/** One full agent turn for a customer utterance. */
export const turn = action({
  args: {
    call_id: v.id("calls"),
    message: v.string(),
    simulated: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TurnResult> => {
    const call = await ctx.runQuery(internal.callsInternals.getCall, { call_id: args.call_id });
    if (!call) throw new Error("Call not found.");
    if (["completed", "failed", "no_answer"].includes(call.status)) {
      throw new Error("Call has already ended.");
    }
    const customer = await ctx.runQuery(internal.callsInternals.getCustomer, {
      customer_id: call.customer_id,
    });
    if (!customer) throw new Error("Customer not found.");

    // 1. Store the raw customer message.
    await ctx.runMutation(internal.callsInternals.recordCustomerMessage, {
      call_id: args.call_id,
      message: args.message,
      metadata: args.simulated ? { simulated: true } : undefined,
    });

    // 2. Load current state + transcript.
    const stateRow = await ctx.runQuery(internal.callsInternals.getLatestAgentState, {
      call_id: args.call_id,
    });
    const collected: AgentFields = (stateRow?.collected ?? {}) as AgentFields;
    const stage: string = stateRow?.stage ?? "greeting";

    const transcriptRows: { speaker: string; message: string }[] =
      await ctx.runQuery(internal.callsInternals.getTranscript, { call_id: args.call_id });

    // 3. Structured LLM decision.
    const messages = buildMessages(
      transcriptRows.map((m) => ({ speaker: m.speaker, message: m.message })),
      collected,
      stage,
      customer.name,
      customer.product || "commercial RO systems",
    );

    const result = await llm.completeJson<unknown>(messages, {
      temperature: 0.2,
      maxTokens: 400,
    });

    await ctx.runMutation(internal.callsInternals.logEvent, {
      call_id: args.call_id,
      event: result.ok ? "agent_processing" : "agent_error",
      detail: result.ok
        ? `decision via ${llm.name} (${LLM_MODEL})`
        : String(result.error).slice(0, 300),
    });

    // 4. Graceful fallback on LLM failure — the call can continue.
    if (!result.ok) {
      const fallback = "Sorry, I didn't catch that clearly. Could you please repeat that?";
      await ctx.runMutation(internal.callsInternals.recordAiMessage, {
        call_id: args.call_id,
        message: fallback,
        metadata: { event: "agent_error_fallback" },
      });
      return {
        response: fallback,
        should_end_call: false,
        lead_status: call.lead_status,
        agent_error: true,
        error: String(result.error).slice(0, 300),
      };
    }

    // 5. Validate/repair decision; merge extracted fields into state.
    const decision = coerceDecision(result.data);
    if (!decision) {
      await ctx.runMutation(internal.callsInternals.logEvent, {
        call_id: args.call_id,
        event: "agent_error",
        detail: "LLM decision failed validation",
      });
      const fallback = "Sorry, one moment please.";
      await ctx.runMutation(internal.callsInternals.recordAiMessage, {
        call_id: args.call_id,
        message: fallback,
        metadata: { event: "agent_error_fallback" },
      });
      return {
        response: fallback,
        should_end_call: false,
        lead_status: call.lead_status,
        agent_error: true,
        error: "Agent decision could not be validated.",
      };
    }

    const merged: AgentFields = { ...collected };
    for (const f of AGENT_FIELD_NAMES) {
      const incoming = decision.extracted_data[f];
      if (typeof incoming === "string" && incoming.trim()) merged[f] = incoming;
    }

    // 6. Lead status (sticky), stage, follow-up flag.
    const newFields = countNewFields(collected, merged);
    const leadStatus = deriveLeadStatus({
      message: args.message,
      current: call.lead_status,
      newFieldsFilled: newFields,
    });
    const nextStage = stageFor(merged, stage as never) as string;
    const followUpRequired = decision.should_end_call
      ? missingFields(merged).length > 0 || leadStatus === "follow_up"
      : call.follow_up_required;

    // 7. Persist state + AI message + call row.
    await ctx.runMutation(internal.callsInternals.setAgentState, {
      call_id: args.call_id,
      collected: merged,
      stage: nextStage,
    });
    await ctx.runMutation(internal.callsInternals.recordAiMessage, {
      call_id: args.call_id,
      message: decision.response,
      metadata: {
        extracted: decision.extracted_data,
        missing_fields: missingFields(merged),
        next_action: decision.next_action,
      },
    });
    await ctx.runMutation(internal.callsInternals.updateCallAfterTurn, {
      call_id: args.call_id,
      lead_status: leadStatus,
      follow_up_required: followUpRequired,
      in_conversation: call.status !== "in_conversation",
    });

    return {
      response: decision.response,
      should_end_call: decision.should_end_call,
      lead_status: leadStatus,
      collected: merged,
      missing_fields: missingFields(merged),
      stage: nextStage,
    };
  },
});

/** Customer silence: escalating prompts, persisted like normal messages. */
export const silence = action({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args): Promise<{ response: string; should_end_call: boolean }> => {
    const call = await ctx.runQuery(internal.callsInternals.getCall, { call_id: args.call_id });
    if (!call) throw new Error("Call not found.");
    const strike = call.silence_strike_count + 1;
    const ended = shouldEndForSilence(strike);

    await ctx.runMutation(internal.callsInternals.recordSilenceStrike, {
      call_id: args.call_id,
      strike,
      message: silenceResponse(strike),
      ended,
    });

    return { response: silenceResponse(strike), should_end_call: ended };
  },
});

/** Generate and persist the structured call summary from the actual transcript. */
export const summarize = action({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args): Promise<{ summary_id: string | null; reused: boolean }> => {
    const call = await ctx.runQuery(internal.callsInternals.getCall, { call_id: args.call_id });
    if (!call) throw new Error("Call not found.");
    const customer = await ctx.runQuery(internal.callsInternals.getCustomer, {
      customer_id: call.customer_id,
    });
    if (!customer) throw new Error("Customer not found.");

    // Do not duplicate summaries.
    const summaryCount = await ctx.runQuery(internal.callsInternals.countSummaries, {
      call_id: args.call_id,
    });
    if (summaryCount > 0) {
      const existing = await ctx.runQuery(internal.callsInternals.getSummary, {
        call_id: args.call_id,
      });
      return { summary_id: existing?._id ?? null, reused: true };
    }

    const transcriptRows = await ctx.runQuery(internal.callsInternals.getTranscript, {
      call_id: args.call_id,
    });

    if (transcriptRows.length === 0) {
      const summaryId: string = await ctx.runMutation(internal.callsInternals.insertSummary, {
        call_id: args.call_id,
        summary: "No conversation took place on this call.",
        customer_intent: "unknown",
        key_requirements: [] as string[],
        follow_up_required: false,
        lead_status: call.lead_status,
        outcome: call.outcome,
      });
      return { summary_id: summaryId, reused: false };
    }

    const stateRow = await ctx.runQuery(internal.callsInternals.getLatestAgentState, {
      call_id: args.call_id,
    });
    const stateLines = stateRow
      ? Object.entries((stateRow.collected ?? {}) as Record<string, unknown>)
          .filter(([, value]) => typeof value === "string" && (value as string).trim())
          .map(([key, value]) => `${key}: ${value}`)
          .join("; ")
      : "none";

    const dialogue = transcriptRows
      .map(
        (m: { speaker: string; message: string }) =>
          `${m.speaker === "ai" ? "AI" : m.speaker === "customer" ? "CUSTOMER" : "SYSTEM"}: ${m.message}`,
      )
      .join("\n")
      .slice(-6000);

    const result = await llm.completeJson<Record<string, unknown>>(
      [
        {
          role: "system" as const,
          content:
            'You are an analyst summarizing an AI sales call. Respond with STRICT JSON only. Schema: {"summary": string (2-3 sentences), "customer_intent": string, "key_requirements": string[], "budget": string|null, "timeline": string|null, "location": string|null, "application": string|null, "lead_status": "new"|"interested"|"qualified"|"not_interested"|"follow_up", "follow_up_required": boolean, "outcome": "interested"|"not_interested"|"follow_up_required"|"information_collected"|"customer_unavailable"|"customer_declined"|"technical_failure"|"completed"|"failed"}',
        },
        {
          role: "user" as const,
          content: `Agent state at end of call: ${stateLines}\n\nCALL TRANSCRIPT:\n${dialogue}`,
        },
      ],
      { temperature: 0.1, maxTokens: 500 },
    );

    // Fallback payload when the LLM is unavailable — call data is still stored.
    type SummaryPayload = {
      summary: string;
      customer_intent: string;
      key_requirements: string[];
      budget?: string;
      timeline?: string;
      location?: string;
      application?: string;
      lead_status: "new" | "interested" | "qualified" | "not_interested" | "follow_up";
      follow_up_required: boolean;
      outcome: typeof call.outcome;
    };
    let payload: SummaryPayload = {
      summary: `Call with ${customer.name}: ${transcriptRows.length} transcript entries recorded; AI summary generation was unavailable.`,
      customer_intent: "unknown",
      key_requirements: [],
      lead_status: call.lead_status,
      follow_up_required: call.follow_up_required,
      outcome: call.outcome,
    };

    if (result.ok && result.data) {
      const d = result.data;
      const leadOptions = ["new", "interested", "qualified", "not_interested", "follow_up"] as const;
      const outcomeOptions = [
        "interested",
        "not_interested",
        "follow_up_required",
        "information_collected",
        "customer_unavailable",
        "customer_declined",
        "technical_failure",
        "completed",
        "failed",
      ] as const;
      const leadOk = (leadOptions as readonly string[]).includes(d.lead_status as string);
      const outcomeOk = (outcomeOptions as readonly string[]).includes(d.outcome as string);
      payload = {
        summary: typeof d.summary === "string" ? d.summary : payload.summary,
        customer_intent: typeof d.customer_intent === "string" ? d.customer_intent : "unknown",
        key_requirements: Array.isArray(d.key_requirements)
          ? d.key_requirements.filter((r): r is string => typeof r === "string").slice(0, 8)
          : [],
        budget: typeof d.budget === "string" ? d.budget : undefined,
        timeline: typeof d.timeline === "string" ? d.timeline : undefined,
        location: typeof d.location === "string" ? d.location : undefined,
        application: typeof d.application === "string" ? d.application : undefined,
        lead_status: leadOk ? (d.lead_status as SummaryPayload["lead_status"]) : call.lead_status,
        follow_up_required:
          typeof d.follow_up_required === "boolean" ? d.follow_up_required : call.follow_up_required,
        outcome: outcomeOk ? (d.outcome as SummaryPayload["outcome"]) : call.outcome,
      };
    }

    const summaryId: string = await ctx.runMutation(internal.callsInternals.insertSummary, {
      call_id: args.call_id,
      summary: payload.summary,
      customer_intent: payload.customer_intent,
      key_requirements: payload.key_requirements,
      budget: payload.budget,
      timeline: payload.timeline,
      location: payload.location,
      application: payload.application,
      follow_up_required: payload.follow_up_required,
      lead_status: payload.lead_status,
      outcome: payload.outcome,
    });

    await ctx.runMutation(internal.callsInternals.updateCallFromSummary, {
      call_id: args.call_id,
      lead_status: payload.lead_status,
      outcome: payload.outcome,
      follow_up_required: payload.follow_up_required,
    });

    return { summary_id: summaryId, reused: false };
  },
});
