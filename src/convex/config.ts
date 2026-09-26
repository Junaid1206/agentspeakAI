import { query } from "./_generated/server";

/** Report deployment capability status for the UI (no secrets returned). */
export const status = query({
  args: {},
  handler: async () => {
    return {
      llm_available: !!process.env.VLY_INTEGRATION_KEY,
      llm_model: "gpt-4o-mini (platform gateway)",
      call_mode: "browser",
      telephony_provider: "twilio (modular, requires credentials)",
      stt: "browser Web Speech API (demo mode)",
      tts: "browser SpeechSynthesis (demo mode)",
    };
  },
});
