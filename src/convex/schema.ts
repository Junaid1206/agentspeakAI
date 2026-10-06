import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---------------------------------------------------------------------------
// Domain literals
// ---------------------------------------------------------------------------

export const CALL_STATUSES = [
  "queued",
  "calling",
  "connected",
  "in_conversation",
  "completed",
  "failed",
  "no_answer",
] as const;
export const callStatusValidator = v.union(
  ...CALL_STATUSES.map((s) => v.literal(s)),
);
export type CallStatus = Infer<typeof callStatusValidator>;

export const CALL_OUTCOMES = [
  "interested",
  "not_interested",
  "follow_up_required",
  "information_collected",
  "customer_unavailable",
  "customer_declined",
  "technical_failure",
  "completed",
  "failed",
  "pending",
] as const;
export const callOutcomeValidator = v.union(
  ...CALL_OUTCOMES.map((s) => v.literal(s)),
);
export type CallOutcome = Infer<typeof callOutcomeValidator>;

export const LEAD_STATUSES = [
  "new",
  "interested",
  "qualified",
  "not_interested",
  "follow_up",
] as const;
export const leadStatusValidator = v.union(
  ...LEAD_STATUSES.map((s) => v.literal(s)),
);
export type LeadStatus = Infer<typeof leadStatusValidator>;

export const SPEAKERS = ["customer", "ai", "system"] as const;
export const speakerValidator = v.union(...SPEAKERS.map((s) => v.literal(s)));
export type Speaker = Infer<typeof speakerValidator>;

export const CALL_MODES = ["browser", "telephony"] as const;
export const callModeValidator = v.union(
  v.literal("browser"),
  v.literal("telephony"),
);
export type CallMode = Infer<typeof callModeValidator>;

const agentFieldsValidator = v.object({
  customer_name: v.optional(v.union(v.string(), v.null())),
  company_name: v.optional(v.union(v.string(), v.null())),
  requirement: v.optional(v.union(v.string(), v.null())),
  ro_capacity: v.optional(v.union(v.string(), v.null())),
  location: v.optional(v.union(v.string(), v.null())),
  budget: v.optional(v.union(v.string(), v.null())),
  timeline: v.optional(v.union(v.string(), v.null())),
  application: v.optional(v.union(v.string(), v.null())),
  additional_requirements: v.optional(v.union(v.string(), v.null())),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      company: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      industry: v.optional(v.string()),
      useCase: v.optional(v.string()),
      aiGoals: v.optional(v.string()),
      teamSize: v.optional(v.string()),
      website: v.optional(v.string()),
      profileCompleted: v.optional(v.boolean()),
      organization: v.optional(v.string()),
      aiUseCase: v.optional(v.string()),
      preferredLanguage: v.optional(v.string()),
      profileCompletedAt: v.optional(v.number()),
      profileImageStorageId: v.optional(v.id("_storage")),
      callingPhoneNumber: v.optional(v.string()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // -----------------------------------------------------------------------
    // AI calling agent domain tables
    // -----------------------------------------------------------------------

    customers: defineTable({
      name: v.string(),
      phone_number: v.string(),
      company_name: v.optional(v.string()),
      purpose: v.optional(v.string()),
      product: v.optional(v.string()),
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index("by_created_at", ["created_at"])
      .index("by_phone", ["phone_number"]),

    calls: defineTable({
      customer_id: v.id("customers"),
      provider_call_id: v.optional(v.string()),
      mode: callModeValidator, // "browser" demo mode | "telephony"
      direction: v.union(v.literal("outbound"), v.literal("inbound")),
      status: callStatusValidator,
      outcome: callOutcomeValidator,
      lead_status: leadStatusValidator,
      follow_up_required: v.boolean(),
      call_mode: callModeValidator,
      silence_strike_count: v.number(),
      started_at: v.number(),
      ended_at: v.optional(v.number()),
      duration_seconds: v.optional(v.number()),
      error_message: v.optional(v.string()),
      created_at: v.number(),
    })
      .index("by_customer", ["customer_id"])
      .index("by_status", ["status"])
      .index("by_created_at", ["created_at"]),

    conversation_messages: defineTable({
      call_id: v.id("calls"),
      speaker: speakerValidator,
      message: v.string(),
      sequence_number: v.number(),
      metadata: v.optional(v.any()), // e.g. { event: "silence_prompt" }
      timestamp: v.number(),
    }).index("by_call_sequence", ["call_id", "sequence_number"]),

    call_summaries: defineTable({
      call_id: v.id("calls"),
      summary: v.string(),
      customer_intent: v.optional(v.string()),
      key_requirements: v.array(v.string()),
      budget: v.optional(v.string()),
      timeline: v.optional(v.string()),
      location: v.optional(v.string()),
      application: v.optional(v.string()),
      follow_up_required: v.boolean(),
      lead_status: leadStatusValidator,
      outcome: callOutcomeValidator,
      generated_at: v.number(),
    }).index("by_call", ["call_id"]),

    agent_states: defineTable({
      call_id: v.id("calls"),
      collected: agentFieldsValidator,
      missing_fields: v.array(v.string()),
      stage: v.string(), // greeting | discovery | qualifying | closing | ended
      turn_count: v.number(),
      updated_at: v.number(),
    }).index("by_call", ["call_id"]),

    call_events: defineTable({
      call_id: v.id("calls"),
      event: v.string(),
      detail: v.optional(v.string()),
      created_at: v.number(),
    }).index("by_call", ["call_id"]),

    // ---------------------------------------------------------------------
    // AgentSpeak AI — campaigns, scheduling, billing, comments, knowledge
    // ---------------------------------------------------------------------

    // A product the AI agent calls customers about (the catalog).
    campaigns: defineTable({
      name: v.string(),
      product: v.string(),
      description: v.optional(v.string()),
      price: v.number(), // display price in INR
      price_label: v.string(),
      category: v.string(),
      highlights: v.array(v.string()),
      active: v.boolean(),
      created_at: v.number(),
    }).index("by_created_at", ["created_at"]),

    // Pre-booked call slots created from the customer area or schedule page.
    scheduled_calls: defineTable({
      customer_id: v.id("customers"),
      campaign_id: v.optional(v.id("campaigns")),
      campaign_name: v.optional(v.string()),
      scheduled_for: v.number(),
      notes: v.optional(v.string()),
      status: v.union(
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
      created_by: v.id("users"),
      created_at: v.number(),
    })
      .index("by_scheduled_for", ["scheduled_for"])
      .index("by_customer", ["customer_id"]),

    // Credit packs purchased for calling minutes.
    orders: defineTable({
      user_id: v.id("users"),
      pack_key: v.string(),
      pack_name: v.string(),
      credits: v.number(),
      amount_usd: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("simulated"),
        v.literal("cancelled"),
      ),
      provider: v.string(), // "stripe" | "simulated"
      provider_ref: v.optional(v.string()),
      created_at: v.number(),
      paid_at: v.optional(v.number()),
    }).index("by_user", ["user_id"]),

    // Optional per-customer notes shown to the agent and in call reports.
    call_comments: defineTable({
      call_id: v.optional(v.id("calls")),
      customer_id: v.id("customers"),
      author: v.string(),
      body: v.string(),
      created_at: v.number(),
    }).index("by_customer", ["customer_id"]),

    // Postable content: playbooks and scripts the team publishes.
    knowledge_posts: defineTable({
      title: v.string(),
      body: v.string(),
      summary: v.optional(v.string()),
      author: v.string(),
      published: v.boolean(),
      created_at: v.number(),
    }).index("by_created_at", ["created_at"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
