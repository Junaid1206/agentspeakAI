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
    await ctx.db.patch(userId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.organization !== undefined ? { organization: args.organization.trim() } : {}),
      ...(args.jobTitle !== undefined ? { jobTitle: args.jobTitle.trim() } : {}),
      ...(args.industry !== undefined ? { industry: args.industry.trim() } : {}),
      ...(args.aiUseCase !== undefined ? { aiUseCase: args.aiUseCase.trim() } : {}),
      ...(args.preferredLanguage !== undefined ? { preferredLanguage: args.preferredLanguage.trim() } : {}),
      profileCompletedAt: Date.now(),
    });
    return { saved: true };
  },
});
