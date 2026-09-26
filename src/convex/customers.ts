import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateName, validatePhone, optionalText } from "./lib/validation";

/** List customers, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("customers").withIndex("by_created_at").order("desc").collect();
  },
});

/** Get one customer. */
export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create a customer. Body is validated server-side (phone + name). */
export const create = mutation({
  args: {
    name: v.string(),
    phone_number: v.string(),
    company_name: v.optional(v.string()),
    purpose: v.optional(v.string()),
    product: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = validateName(args.name);
    if (!name.ok) throw new Error(name.error);
    const phone = validatePhone(args.phone_number);
    if (!phone.ok) throw new Error(phone.error);

    const now = Date.now();
    return await ctx.db.insert("customers", {
      name: name.value!,
      phone_number: phone.value!,
      company_name: optionalText(args.company_name, 200),
      purpose: optionalText(args.purpose, 500),
      product: optionalText(args.product, 200),
      created_at: now,
      updated_at: now,
    });
  },
});

/** Update customer fields. */
export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    phone_number: v.optional(v.string()),
    company_name: v.optional(v.string()),
    purpose: v.optional(v.string()),
    product: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found.");
    const patch: Record<string, string | number | undefined> = { updated_at: Date.now() };

    if (args.name !== undefined) {
      const name = validateName(args.name);
      if (!name.ok) throw new Error(name.error);
      patch.name = name.value!;
    }
    if (args.phone_number !== undefined) {
      const phone = validatePhone(args.phone_number);
      if (!phone.ok) throw new Error(phone.error);
      patch.phone_number = phone.value!;
    }
    if (args.company_name !== undefined) patch.company_name = optionalText(args.company_name, 200);
    if (args.purpose !== undefined) patch.purpose = optionalText(args.purpose, 500);
    if (args.product !== undefined) patch.product = optionalText(args.product, 200);

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Delete a customer and all their calls (cascade: messages, summaries, states, events). */
export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found.");

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_customer", (q) => q.eq("customer_id", args.id))
      .collect();

    for (const call of calls) {
      const messages = await ctx.db
        .query("conversation_messages")
        .withIndex("by_call_sequence", (q) => q.eq("call_id", call._id))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);

      const summaries = await ctx.db
        .query("call_summaries")
        .withIndex("by_call", (q) => q.eq("call_id", call._id))
        .collect();
      for (const s of summaries) await ctx.db.delete(s._id);

      const states = await ctx.db
        .query("agent_states")
        .withIndex("by_call", (q) => q.eq("call_id", call._id))
        .collect();
      for (const s of states) await ctx.db.delete(s._id);

      const events = await ctx.db
        .query("call_events")
        .withIndex("by_call", (q) => q.eq("call_id", call._id))
        .collect();
      for (const e of events) await ctx.db.delete(e._id);

      await ctx.db.delete(call._id);
    }

    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});
