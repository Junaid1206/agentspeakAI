import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Credit packs (fixed catalog)
// ---------------------------------------------------------------------------

const CREDIT_PACKS: Record<
  string,
  { name: string; credits: number; amountUsd: number; priceId?: string }
> = {
  starter: { name: "Starter Pack", credits: 25, amountUsd: 19 },
  growth: { name: "Growth Pack", credits: 120, amountUsd: 79 },
  scale: { name: "Scale Pack", credits: 400, amountUsd: 229 },
};

/** Fixed pack definitions shown on the billing page. */
export const packs = query({
  args: {},
  handler: async () => {
    return Object.entries(CREDIT_PACKS).map(([key, p]) => ({
      key,
      name: p.name,
      credits: p.credits, // 1 credit = 1 call minute
      amount_usd: p.amountUsd,
    }));
  },
});

/** Current user's calling-credit balance and order history. */
export const myBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { credits: 0, orders: [] };
    const all = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    const relevant = all
      .filter((o) => o.status !== "cancelled")
      .sort((a, b) => b.created_at - a.created_at);
    return {
      credits: relevant
        .filter((o) => o.status === "paid" || o.status === "simulated")
        .reduce((sum, o) => sum + o.credits, 0),
      orders: relevant,
    };
  },
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Create a checkout session. Uses Stripe Checkout when STRIPE_SECRET_KEY is
 * configured; otherwise returns a simulated checkout URL that activates a
 * clearly-labelled demo payment page instead of a real charge.
 */
export const createCheckout = action({
  args: { pack_key: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to purchase credits.");
    const pack = CREDIT_PACKS[args.pack_key];
    if (!pack) throw new Error("Unknown credit pack.");

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const origin = process.env.CONVEX_SITE_URL ?? "http://localhost:5173";

    // Order starts pending; the completion step marks it paid/simulated.
    const orderId = await ctx.runMutation(internal.billingInternals.createOrder, {
      user_id: userId,
      pack_key: args.pack_key,
      pack_name: pack.name,
      credits: pack.credits,
      amount_usd: pack.amountUsd,
      provider: stripeKey ? "stripe" : "simulated",
    });

    if (stripeKey) {
      // Real Stripe Checkout. Kept dependency-light: a direct REST call with
      // form-encoded params (no SDK) so the sandbox stays lean.
      const body = new URLSearchParams({
        mode: "payment",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(pack.amountUsd * 100),
        "line_items[0][price_data][product_data][name]": `AgentSpeak AI — ${pack.name}`,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/dashboard/billing?status=success&order={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/dashboard/billing?status=cancelled`,
        "metadata[order_id]": orderId,
        "metadata[pack_key]": args.pack_key,
      });
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Stripe checkout failed: ${text.slice(0, 200)}`);
      }
      const session = (await res.json()) as { id: string; url: string };
      await ctx.runMutation(internal.billingInternals.attachProviderRef, {
        order_id: orderId as never,
        provider_ref: session.id,
      });
      return session.url;
    }

    // No Stripe key: simulated checkout — order completes on the demo pay page.
    return `${origin}/dashboard/billing/checkout?order=${orderId}&pack=${args.pack_key}`;
  },
});

/**
 * Complete a simulated checkout (demo payment page "Pay" button). In Stripe
 * mode this same mutation runs from the webhook handler after signature
 * verification, which is why it is internal + idempotent.
 */
export const completeSimulated = mutation({
  args: { order_id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.order_id);
    if (!order) throw new Error("Order not found.");
    const userId = await getAuthUserId(ctx);
    if (!userId || order.user_id !== userId) throw new Error("Not authorized.");
    if (order.status === "pending") {
      await ctx.db.patch(args.order_id, {
        status: "simulated",
        paid_at: Date.now(),
      });
    }
    return order._id;
  },
});

/** Cancel/abandon a pending order (used when the user backs out). */
export const cancelOrder = mutation({
  args: { order_id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.order_id);
    if (!order) throw new Error("Order not found.");
    const userId = await getAuthUserId(ctx);
    if (!userId || order.user_id !== userId) return null;
    if (order.status === "pending") {
      await ctx.db.patch(args.order_id, { status: "cancelled" });
    }
    return order._id;
  },
});

/** Fetch one order for the checkout page (authorized). */
export const getOrder = query({
  args: { order_id: v.id("orders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const order = await ctx.db.get(args.order_id);
    if (!order || !userId || order.user_id !== userId) return null;
    return order;
  },
});
