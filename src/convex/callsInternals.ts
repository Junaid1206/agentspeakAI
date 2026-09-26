import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { callOutcomeValidator, leadStatusValidator } from "./schema";

async function nextSequence(ctx: any, callId: any): Promise<number> {
  const existing = await ctx.db
    .query("conversation_messages")
    .withIndex("by_call_sequence", (q: any) => q.eq("call_id", callId))
    .collect();
  return existing.length + 1;
}

// ---------------------------------------------------------------------------
// Internal queries (readable from actions)
// ---------------------------------------------------------------------------

export const getCall = internalQuery({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => await ctx.db.get(args.call_id),
});

export const getCustomer = internalQuery({
  args: { customer_id: v.id("customers") },
  handler: async (ctx, args) => await ctx.db.get(args.customer_id),
});

export const getLatestAgentState = internalQuery({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("agent_states")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .order("desc")
      .take(1);
    return states[0] ?? null;
  },
});

export const getTranscript = internalQuery({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversation_messages")
      .withIndex("by_call_sequence", (q) => q.eq("call_id", args.call_id))
      .order("asc")
      .collect();
  },
});

export const getSummary = internalQuery({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("call_summaries")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

export const countSummaries = internalQuery({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("call_summaries")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .collect();
    return rows.length;
  },
});

// ---------------------------------------------------------------------------
// Internal mutations (writable from actions)
// ---------------------------------------------------------------------------

export const recordCustomerMessage = internalMutation({
  args: {
    call_id: v.id("calls"),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversation_messages", {
      call_id: args.call_id,
      speaker: "customer",
      message: args.message,
      metadata: args.metadata,
      sequence_number: await nextSequence(ctx, args.call_id),
      timestamp: Date.now(),
    });
  },
});

export const recordAiMessage = internalMutation({
  args: {
    call_id: v.id("calls"),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversation_messages", {
      call_id: args.call_id,
      speaker: "ai",
      message: args.message,
      metadata: args.metadata,
      sequence_number: await nextSequence(ctx, args.call_id),
      timestamp: Date.now(),
    });
  },
});

export const recordSystemMessage = internalMutation({
  args: {
    call_id: v.id("calls"),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversation_messages", {
      call_id: args.call_id,
      speaker: "system",
      message: args.message,
      metadata: args.metadata,
      sequence_number: await nextSequence(ctx, args.call_id),
      timestamp: Date.now(),
    });
  },
});

export const recordSilenceStrike = internalMutation({
  args: {
    call_id: v.id("calls"),
    strike: v.number(),
    message: v.string(),
    ended: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversation_messages", {
      call_id: args.call_id,
      speaker: "ai",
      message: args.message,
      metadata: { event: "silence_prompt", strike: args.strike },
      sequence_number: await nextSequence(ctx, args.call_id),
      timestamp: Date.now(),
    });
    await ctx.db.patch(args.call_id, { silence_strike_count: args.strike });
    await ctx.db.insert("call_events", {
      call_id: args.call_id,
      event: "customer_silent",
      detail: `Strike ${args.strike}${args.ended ? " — ending call" : ""}`,
      created_at: Date.now(),
    });
  },
});

export const setAgentState = internalMutation({
  args: {
    call_id: v.id("calls"),
    collected: v.any(),
    stage: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_states")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .order("desc")
      .take(1);
    const prev = existing[0];
    const turnCount = (prev?.turn_count ?? 0) + 1;
    if (prev) {
      await ctx.db.patch(prev._id, {
        collected: args.collected,
        stage: args.stage,
        turn_count: turnCount,
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("agent_states", {
        call_id: args.call_id,
        collected: args.collected,
        missing_fields: [],
        stage: args.stage,
        turn_count: turnCount,
        updated_at: Date.now(),
      });
    }
  },
});

export const logEvent = internalMutation({
  args: {
    call_id: v.id("calls"),
    event: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("call_events", {
      call_id: args.call_id,
      event: args.event,
      detail: args.detail,
      created_at: Date.now(),
    });
  },
});

export const updateCallAfterTurn = internalMutation({
  args: {
    call_id: v.id("calls"),
    lead_status: leadStatusValidator,
    follow_up_required: v.boolean(),
    in_conversation: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.call_id, {
      lead_status: args.lead_status,
      follow_up_required: args.follow_up_required,
      silence_strike_count: 0, // customer responded
      ...(args.in_conversation ? { status: "in_conversation" as const } : {}),
    });
  },
});

export const updateCallFromSummary = internalMutation({
  args: {
    call_id: v.id("calls"),
    lead_status: leadStatusValidator,
    outcome: callOutcomeValidator,
    follow_up_required: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.call_id, {
      lead_status: args.lead_status,
      outcome: args.outcome,
      follow_up_required: args.follow_up_required,
    });
  },
});

export const insertSummary = internalMutation({
  args: {
    call_id: v.id("calls"),
    summary: v.string(),
    customer_intent: v.optional(v.string()),
    key_requirements: v.array(v.string()),
    budget: v.optional(v.string()),
    timeline: v.optional(v.string()),
    location: v.optional(v.string()),
    application: v.optional(v.string()),
    follow_up_required: v.boolean(),
    lead_status: leadStatusValidator,
    outcome: callOutcomeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("call_summaries", {
      call_id: args.call_id,
      summary: args.summary,
      customer_intent: args.customer_intent,
      key_requirements: args.key_requirements,
      budget: args.budget,
      timeline: args.timeline,
      location: args.location,
      application: args.application,
      follow_up_required: args.follow_up_required,
      lead_status: args.lead_status,
      outcome: args.outcome,
      generated_at: Date.now(),
    });
  },
});
