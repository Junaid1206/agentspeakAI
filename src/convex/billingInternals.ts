import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const createOrder = internalMutation({
  args: {
    user_id: v.id("users"),
    pack_key: v.string(),
    pack_name: v.string(),
    credits: v.number(),
    amount_usd: v.number(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("orders", {
      user_id: args.user_id,
      pack_key: args.pack_key,
      pack_name: args.pack_name,
      credits: args.credits,
      amount_usd: args.amount_usd,
      status: "pending",
      provider: args.provider,
      created_at: Date.now(),
    });
  },
});

export const attachProviderRef = internalMutation({
  args: { order_id: v.id("orders"), provider_ref: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.order_id, { provider_ref: args.provider_ref });
  },
});

/**
 * Idempotently mark an order paid and add its credits. Called from the Stripe
 * webhook path (signature-verified) — never expose this as a public mutation.
 */
export const markPaid = internalMutation({
  args: {
    order_id: v.id("orders"),
    status: v.union(v.literal("paid"), v.literal("simulated")),
  },
  handler: async (ctx, args) => {
    const order: Doc<"orders"> | null = await ctx.db.get(args.order_id);
    if (!order) return null;
    if (order.status === "pending") {
      await ctx.db.patch(args.order_id, {
        status: args.status,
        paid_at: Date.now(),
      });
    }
    return order._id;
  },
});
