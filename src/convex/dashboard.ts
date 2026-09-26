import { v } from "convex/values";
import { query } from "./_generated/server";
import { callStatusValidator } from "./schema";

/** Dashboard metrics — all computed live from database records. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const calls = await ctx.db.query("calls").collect();
    const summaries = await ctx.db.query("call_summaries").collect();

    const completed = calls.filter((c) => c.status === "completed");
    const failed = calls.filter((c) => c.status === "failed" || c.status === "no_answer");
    const active = calls.filter((c) =>
      ["queued", "calling", "connected", "in_conversation"].includes(c.status),
    );
    const interested = calls.filter((c) =>
      ["interested", "qualified"].includes(c.lead_status),
    );
    const followUps = calls.filter((c) => c.follow_up_required);

    const durations = calls
      .map((c) => c.duration_seconds)
      .filter((d): d is number => typeof d === "number");
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const totalLeads = calls.filter((c) => c.lead_status !== "new").length;
    const conversion = totalLeads > 0 ? Math.round((interested.length / totalLeads) * 100) : 0;

    return {
      total_calls: calls.length,
      completed_calls: completed.length,
      failed_calls: failed.length,
      active_calls: active.length,
      interested_leads: interested.length,
      follow_ups_required: followUps.length,
      avg_duration_seconds: avgDuration,
      total_customers: (await ctx.db.query("customers").collect()).length,
      conversion_rate: conversion,
      calls_by_status: {
        queued: calls.filter((c) => c.status === "queued").length,
        calling: calls.filter((c) => c.status === "calling").length,
        connected: calls.filter((c) => c.status === "connected").length,
        in_conversation: calls.filter((c) => c.status === "in_conversation").length,
        completed: completed.length,
        failed: failed.length,
      },
      summaries_count: summaries.length,
    };
  },
});
