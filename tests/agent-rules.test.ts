import { describe, expect, it } from "vitest";
import {
  coerceDecision,
  deriveLeadStatus,
  FIELD_LABELS,
  missingFields,
  parseJsonLoose,
  silenceResponse,
  stageFor,
  SILENCE_MAX_ATTEMPTS,
  shouldEndForSilence,
} from "../src/convex/agent/rules";
import type { AgentFields, Stage } from "../src/convex/agent/rules";

const allMissing: AgentFields = {
  requirement: null,
  ro_capacity: null,
  location: null,
  budget: null,
  timeline: null,
  application: null,
};

describe("missing-field detection", () => {
  it("returns all required fields when nothing collected", () => {
    expect(missingFields(allMissing)).toEqual([
      "requirement",
      "ro_capacity",
      "location",
      "budget",
      "timeline",
      "application",
    ]);
  });

  it("never re-asks answered questions", () => {
    const collected = { ...allMissing, ro_capacity: "500 LPH", location: "Bangalore" };
    const missing = missingFields(collected);
    expect(missing).toContain("budget");
    expect(missing).not.toContain("ro_capacity");
    expect(missing).not.toContain("location");
  });

  it("treats whitespace-only values as missing", () => {
    expect(missingFields({ ...allMissing, budget: "   " })).toContain("budget");
  });
});

describe("stage machine", () => {
  it("starts at greeting when nothing is collected", () => {
    expect(stageFor(allMissing, "greeting")).toBe("greeting");
  });

  it("moves to closing when all required fields collected", () => {
    const full: AgentFields = {
      ...allMissing,
      requirement: "Commercial RO system",
      ro_capacity: "500 LPH",
      location: "Bangalore",
      budget: "₹1,00,000",
      timeline: "Within 1 month",
      application: "Hotel",
    };
    expect(stageFor(full, "discovery")).toBe("closing");
  });

  it("stays ended once ended", () => {
    expect(stageFor(allMissing, "ended")).toBe("ended");
  });
});

describe("lead status derivation", () => {
  it("detects explicit rejection", () => {
    expect(
      deriveLeadStatus({
        message: "I am not interested, please stop calling.",
        current: "interested",
        newFieldsFilled: 0,
      }),
    ).toBe("not_interested");
  });

  it("promotes to qualified after multiple new fields", () => {
    expect(
      deriveLeadStatus({
        message: "Yes, we need it for our hotel.",
        current: "new",
        newFieldsFilled: 2,
      }),
    ).toBe("qualified");
  });

  it("keeps not_interested sticky", () => {
    expect(
      deriveLeadStatus({ message: "well maybe", current: "not_interested", newFieldsFilled: 1 }),
    ).toBe("not_interested");
  });
});

describe("silence policy", () => {
  it("escalates then ends", () => {
    expect(silenceResponse(1)).toBe("Are you still there?");
    expect(silenceResponse(2)).toContain("wait a little longer");
    expect(shouldEndForSilence(SILENCE_MAX_ATTEMPTS)).toBe(true);
    expect(shouldEndForSilence(1)).toBe(false);
  });
});

describe("structured decision coercion", () => {
  it("accepts a valid decision", () => {
    const d = coerceDecision({
      extracted_data: { ro_capacity: "500 LPH" },
      missing_fields: ["location", "budget"],
      next_action: "ask_question",
      response: "Great. Which city?",
      should_end_call: false,
      lead_status: "interested",
    });
    expect(d).not.toBeNull();
    expect(d!.extracted_data.ro_capacity).toBe("500 LPH");
    expect(d!.missing_fields).toEqual(["location", "budget"]);
    expect(d!.next_action).toBe("ask_question");
  });

  it("rejects garbage and unknown fields", () => {
    expect(coerceDecision("hello")).toBeNull();
    const d = coerceDecision({
      extracted_data: { evil_field: "x", budget: 42 },
      missing_fields: ["nope", "location"],
      next_action: "dance",
      lead_status: "super_hot",
      response: "ok",
    });
    expect(d!.extracted_data).toEqual({});
    expect(d!.missing_fields).toEqual(["location"]);
    expect(d!.next_action).toBe("ask_question");
    expect(d!.lead_status).toBe("new");
  });

  it("parses fenced JSON from an LLM response", () => {
    const parsed = parseJsonLoose('```json\n{"a": 1}\n```') as { a: number };
    expect(parsed.a).toBe(1);
    const salvaged = parseJsonLoose('noise {"a": 2} trailing') as { a: number };
    expect(salvaged.a).toBe(2);
  });

  it("labels all fields", () => {
    expect(FIELD_LABELS.ro_capacity).toBe("RO capacity");
  });
});

describe("stage typing", () => {
  it("STAGES includes ended", () => {
    const stages: readonly Stage[] = ["greeting", "discovery", "qualifying", "closing", "ended"];
    expect(stages.length).toBe(5);
  });
});
