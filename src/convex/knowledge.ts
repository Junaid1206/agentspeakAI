import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Browse/search posts; includes drafts for the signed-in team. */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const rows = await ctx.db
      .query("knowledge_posts")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
    if (!args.search?.trim()) return rows;
    const q = args.search.trim().toLowerCase();
    return rows.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.summary?.toLowerCase().includes(q) ?? false) ||
        p.body.toLowerCase().includes(q),
    );
  },
});

export const get = query({
  args: { id: v.id("knowledge_posts") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    summary: v.optional(v.string()),
    publish: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to publish.");
    const user = await ctx.db.get(userId);
    const title = args.title.trim();
    const body = args.body.trim();
    if (title.length < 4) throw new Error("Title must be at least 4 characters.");
    if (body.length < 20) throw new Error("Post body must be at least 20 characters.");
    return await ctx.db.insert("knowledge_posts", {
      title,
      body,
      summary: args.summary?.trim() || body.slice(0, 140),
      author: user?.name || user?.email || "Team member",
      published: args.publish ?? true,
      created_at: Date.now(),
    });
  },
});

export const setPublished = mutation({
  args: { id: v.id("knowledge_posts"), published: v.boolean() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    await ctx.db.patch(args.id, { published: args.published });
    return args.id;
  },
});
