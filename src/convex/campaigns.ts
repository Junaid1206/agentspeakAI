import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Browse/search the campaign catalog. */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("campaigns").withIndex("by_created_at").order("desc").collect();
    if (!args.search?.trim()) return rows;
    const q = args.search.trim().toLowerCase();
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.product.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  },
});

export const get = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    name: v.string(),
    product: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    price_label: v.string(),
    category: v.string(),
    highlights: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db.insert("campaigns", {
      ...args,
      active: true,
      created_at: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("campaigns"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    price_label: v.optional(v.string()),
    category: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
    return id;
  },
});

/**
 * First-run convenience: if the catalog is empty, materialize default
 * campaigns. This is application logic (idempotent), not fake dashboard data —
 * the campaigns are real rows the agent calls about.
 */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const existing = await ctx.db.query("campaigns").collect();
    if (existing.length > 0) return { created: 0 };
    const now = Date.now();
    const defaults = [
      {
        name: "Commercial RO Outreach",
        product: "Commercial RO System",
        description:
          "Outbound qualification for commercial reverse-osmosis systems — hotels, hospitals, apartments and factories. The agent captures capacity, location, budget, timeline and application.",
        price: 185000,
        price_label: "From ₹1,85,000",
        category: "Water Treatment",
        highlights: [
          "500–5000 LPH capacities",
          "Installation + annual maintenance",
          "Qualifies budget & timeline on the call",
        ],
      },
      {
        name: "Solar Rooftop Program",
        product: "Rooftop Solar Installation",
        description:
          "The agent calls commercial property owners to qualify rooftop solar leads: tariff, roof area, consumption and payback expectations.",
        price: 650000,
        price_label: "From ₹6,50,000",
        category: "Energy",
        highlights: [
          "Net-metering guidance",
          "Payback analysis captured live",
          "Site visit scheduling built in",
        ],
      },
      {
        name: "CCTV & Security Renewals",
        product: "Surveillance & Security Systems",
        description:
          "Renewal and upgrade calls for existing security-system customers — camera counts, storage, warranty status and upgrade interest.",
        price: 42000,
        price_label: "From ₹42,000",
        category: "Security",
        highlights: [
          "Renewal + upgrade qualification",
          "Warranty status captured",
          "Same-week site quotes",
        ],
      },
    ];
    for (const d of defaults) {
      await ctx.db.insert("campaigns", { ...d, active: true, created_at: now });
    }
    return { created: defaults.length };
  },
});
