import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Upcoming and past scheduled calls, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("scheduled_calls")
      .withIndex("by_scheduled_for")
      .order("desc")
      .collect();
    const out = [];
    for (const s of rows) {
      const customer = await ctx.db.get(s.customer_id);
      out.push({ ...s, customer });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    customer_id: v.id("customers"),
    campaign_id: v.optional(v.id("campaigns")),
    scheduled_for: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to schedule calls.");
    if (args.scheduled_for < Date.now() - 60_000) {
      throw new Error("Pick a time in the future.");
    }
    const customer = await ctx.db.get(args.customer_id);
    if (!customer) throw new Error("Customer not found.");
    let campaignName: string | undefined;
    if (args.campaign_id) {
      const campaign = await ctx.db.get(args.campaign_id);
      campaignName = campaign?.name;
    }
    return await ctx.db.insert("scheduled_calls", {
      customer_id: args.customer_id,
      campaign_id: args.campaign_id,
      campaign_name: campaignName,
      scheduled_for: args.scheduled_for,
      notes: args.notes?.trim() || undefined,
      status: "scheduled",
      created_by: userId,
      created_at: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { id: v.id("scheduled_calls") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authorized.");
    const slot = await ctx.db.get(args.id);
    if (!slot) throw new Error("Scheduled call not found.");
    if (slot.status !== "scheduled") throw new Error("Only scheduled calls can be cancelled.");
    await ctx.db.patch(args.id, { status: "cancelled" });
    return args.id;
  },
});
