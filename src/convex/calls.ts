import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { callModeValidator, callStatusValidator, callOutcomeValidator, leadStatusValidator } from "./schema";
import { validatePhone, optionalText } from "./lib/validation";

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/** Get a call with its customer joined. */
export const get = query({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) return null;
    const customer = await ctx.db.get(call.customer_id);
    return { ...call, customer };
  },
});

/** List all calls (most recent first) with their customer joined. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const calls = await ctx.db.query("calls").order("desc").collect();
    const out = [];
    for (const call of calls) {
      const customer = await ctx.db.get(call.customer_id);
      out.push({ ...call, customer });
    }
    return out;
  },
});

/** List a customer's calls. */
export const listForCustomer = query({
  args: { customer_id: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calls")
      .withIndex("by_customer", (q) => q.eq("customer_id", args.customer_id))
      .order("desc")
      .collect();
  },
});

/** Transcript for a call, ordered by sequence number. */
export const transcript = query({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversation_messages")
      .withIndex("by_call_sequence", (q) => q.eq("call_id", args.call_id))
      .order("asc")
      .collect();
  },
});

/** Events timeline for a call. */
export const events = query({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("call_events")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .order("desc")
      .collect();
  },
});

/** Latest agent state for a call. */
export const agentState = query({
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

/** Latest summary for a call. */
export const summary = query({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    const summaries = await ctx.db
      .query("call_summaries")
      .withIndex("by_call", (q) => q.eq("call_id", args.call_id))
      .order("desc")
      .take(1);
    return summaries[0] ?? null;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new call in `queued` state. */
export const create = mutation({
  args: {
    customer_id: v.id("customers"),
    mode: callModeValidator,
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customer_id);
    if (!customer) throw new Error("Customer not found.");
    const now = Date.now();
    return await ctx.db.insert("calls", {
      customer_id: args.customer_id,
      mode: args.mode,
      call_mode: args.mode,
      direction: "outbound",
      status: "queued",
      outcome: "pending",
      lead_status: "new",
      follow_up_required: false,
      silence_strike_count: 0,
      started_at: now,
      created_at: now,
    });
  },
});

/** Mark the call as dialing (telephony) or session-open (browser). */
export const markCalling = mutation({
  args: { id: v.id("calls"), provider_call_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) throw new Error("Call not found.");
    await ctx.db.patch(args.id, {
      status: "calling",
      provider_call_id: args.provider_call_id,
    });
  },
});

/** Mark the call connected — greeting will follow. */
export const markConnected = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) throw new Error("Call not found.");
    await ctx.db.patch(args.id, { status: "connected" });
  },
});

/** Mark the call as actively conversing. */
export const markInConversation = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) throw new Error("Call not found.");
    await ctx.db.patch(args.id, { status: "in_conversation" });
  },
});

/** Record a system event (call_initiated, tts_failed, ...). */
export const logEvent = mutation({
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
      created_at: logEventTimestamp(),
    });
  },
});

function logEventTimestamp(): number {
  return Date.now();
}

/**
 * End the call with a terminal status; summary generation is a separate action.
 */
export const endCall = mutation({
  args: {
    id: v.id("calls"),
    final_status: callStatusValidator,
    outcome: callOutcomeValidator,
    lead_status: leadStatusValidator,
    follow_up_required: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) throw new Error("Call not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.final_status,
      outcome: args.outcome,
      lead_status: args.lead_status,
      follow_up_required: args.follow_up_required,
      ended_at: now,
      duration_seconds: Math.max(0, Math.round((now - call.started_at) / 1000)),
      error_message: args.reason,
    });
  },
});

/** Allow an operator to abandon a stuck call (e.g. browser tab crashed). */
export const forceEnd = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) throw new Error("Call not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "failed",
      outcome: "technical_failure",
      ended_at: now,
      duration_seconds: Math.max(0, Math.round((now - call.started_at) / 1000)),
      error_message: "Call force-ended by operator.",
    });
  },
});
