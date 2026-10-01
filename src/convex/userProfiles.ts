import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

const text = (value: string, max: number, label: string) => {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(label + " is required.");
  if (cleaned.length > max) throw new Error(label + " must be " + max + " characters or fewer.");
  return cleaned;
};

export const saveProfile = mutation({
  args: {
    name: v.string(),
    company: v.string(),
    jobTitle: v.string(),
    industry: v.string(),
    useCase: v.string(),
    aiGoals: v.string(),
    teamSize: v.string(),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to save your profile.");
    const allowedIndustries = ["healthcare", "ecommerce", "retail", "real_estate", "hospitality", "education", "finance", "technology", "manufacturing", "professional_services", "other"];
    if (!allowedIndustries.includes(args.industry)) throw new Error("Choose a valid industry.");
    const website = args.website?.trim();
    if (website && website.length > 300) throw new Error("Website must be 300 characters or fewer.");
    await ctx.db.patch(userId, {
      name: text(args.name, 120, "Full name"),
      company: text(args.company, 160, "Company"),
      jobTitle: text(args.jobTitle, 120, "Role"),
      industry: args.industry,
      useCase: text(args.useCase, 600, "How you plan to use AgentSpeak AI"),
      aiGoals: text(args.aiGoals, 800, "AI goals"),
      teamSize: text(args.teamSize, 40, "Team size"),
      website: website || undefined,
      organization: text(args.company, 160, "Company"),
      aiUseCase: text(args.useCase, 600, "How you plan to use AgentSpeak AI"),
      profileCompletedAt: Date.now(),
      profileCompleted: true,
    });
    return { saved: true };
  },
});


export const generateProfileImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to upload a profile photo.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to save a profile photo.");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Uploaded image could not be found.");
    const previous = await ctx.db.get(userId);
    await ctx.db.patch(userId, { image: url, profileImageStorageId: args.storageId });
    if (previous?.profileImageStorageId && previous.profileImageStorageId !== args.storageId) {
      await ctx.storage.delete(previous.profileImageStorageId);
    }
    return { saved: true, image: url };
  },
});
