import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

const text = (value: string, max: number, label: string) => {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(label + " is required.");
  if (cleaned.length > max) throw new Error(label + " must be " + max + " characters or fewer.");
  return cleaned;
};

const meaningfulBusinessText = (value: string, max: number, label: string) => {
  const cleaned = text(value, max, label);
  if (cleaned.length < 10) throw new Error(label + " must be at least 10 characters.");
  if (["na", "n/a", "none", "test"].includes(cleaned.toLowerCase())) {
    throw new Error(label + " cannot be a placeholder such as NA, N/A, none, or test.");
  }
  return cleaned;
};
const allowedIndustries = [
  "healthcare",
  "ecommerce",
  "retail",
  "real_estate",
  "hospitality",
  "education",
  "finance",
  "technology",
  "manufacturing",
  "professional_services",
  "other",
] as const;

const industryAliases: Record<string, (typeof allowedIndustries)[number]> = {
  "technology / it": "technology",
};

const normalizeIndustry = (value: string): (typeof allowedIndustries)[number] => {
  const normalized = value.trim().toLowerCase();
  const canonical = industryAliases[normalized] ?? normalized;
  if (!(allowedIndustries as readonly string[]).includes(canonical)) {
    throw new Error("Choose a valid industry.");
  }
  return canonical as (typeof allowedIndustries)[number];
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
    callingPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to save your profile.");

    const industry = normalizeIndustry(args.industry);
    const website = args.website?.trim();
    const callingPhoneNumber = args.callingPhoneNumber.trim().replace(/[()\s-]/g, "");

    if (!/^\+[1-9]\d{7,14}$/.test(callingPhoneNumber)) {
      throw new Error("Calling phone number must be in international E.164 format, e.g. +919876543210.");
    }
    if (website && website.length > 300) {
      throw new Error("Website must be 300 characters or fewer.");
    }

    await ctx.db.patch(userId, {
      name: text(args.name, 120, "Full name"),
      company: text(args.company, 160, "Company"),
      jobTitle: text(args.jobTitle, 120, "Role"),
      industry,
      useCase: meaningfulBusinessText(args.useCase, 600, "How you plan to use AgentSpeak AI"),
      aiGoals: meaningfulBusinessText(args.aiGoals, 800, "AI goals"),
      teamSize: text(args.teamSize, 40, "Team size"),
      website: website || undefined,
      callingPhoneNumber,
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
