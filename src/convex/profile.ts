import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const saveProfile = mutation({
  args: {
    name: v.optional(v.string()),
    organization: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    industry: v.optional(v.string()),
    aiUseCase: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to save your profile.");
    const patch: Record<string, string | number> = {
      profileCompletedAt: Date.now(),
    };
    for (const key of ["name", "organization", "jobTitle", "industry", "aiUseCase", "preferredLanguage"] as const) {
      const value = args[key];
      if (typeof value === "string") patch[key] = value.trim();
    }
    await ctx.db.patch(userId, patch);
    return { saved: true };
  },
});
