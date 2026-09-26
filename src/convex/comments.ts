import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Add a comment on a customer (optionally tied to one call). */
export const add = mutation({
  args: {
    customer_id: v.id("customers"),
    call_id: v.optional(v.id("calls")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to comment.");
    const user = await ctx.db.get(userId);
    const body = args.body.trim();
    if (!body) throw new Error("Comment cannot be empty.");
    const customer = await ctx.db.get(args.customer_id);
    if (!customer) throw new Error("Customer not found.");
    return await ctx.db.insert("call_comments", {
      customer_id: args.customer_id,
      call_id: args.call_id,
      author: user?.name || user?.email || "Team member",
      body: body.slice(0, 2000),
      created_at: Date.now(),
    });
  },
});

/** All comments for a customer, oldest first. */
export const listForCustomer = query({
  args: { customer_id: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("call_comments")
      .withIndex("by_customer", (q) => q.eq("customer_id", args.customer_id))
      .collect()
      .then((rows) => rows.sort((a, b) => a.created_at - b.created_at));
  },
});

/** Comments tied to a specific call. */
export const listForCall = query({
  args: { call_id: v.id("calls") },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("call_comments").collect();
    return rows
      .filter((r) => r.call_id === args.call_id)
      .sort((a, b) => a.created_at - b.created_at);
  },
});
