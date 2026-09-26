// ---------------------------------------------------------------------------
// Calling provider abstraction.
//
// The agent core never imports a provider directly — it works on call rows and
// the orchestrator. Providers only handle transport specifics:
//   - BrowserCallingProvider: WebRTC-style demo session (mic + browser STT/TTS)
//   - TwilioCallingProvider: REST call initiation for real telephony mode
// ---------------------------------------------------------------------------

export interface CallSession {
  provider_call_id: string;
  status: "queued" | "calling" | "connected" | "ended";
}

export interface CallingProvider {
  readonly name: string;
  /** True when this provider can actually place calls in the current env. */
  readonly available: boolean;
  initiateCall(input: {
    to: string;
    from?: string;
  }): Promise<CallSession>;
  endCall(session: CallSession): Promise<void>;
  getCallStatus(session: CallSession): Promise<CallSession["status"]>;
}

/** Real telephony provider (Twilio) via REST API. Requires credentials. */
export class TwilioCallingProvider implements CallingProvider {
  readonly name = "twilio";
  readonly available: boolean;
  private creds: { accountSid: string; authToken: string; from: string } | null;

  constructor(creds: { accountSid: string; authToken: string; from: string } | null) {
    this.creds = creds;
    this.available = !!creds;
  }

  async initiateCall(input: { to: string; from?: string }): Promise<CallSession> {
    if (!this.creds) {
      throw new Error(
        "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER to enable telephony mode.",
      );
    }
    const { accountSid, authToken, from } = this.creds;
    const body = new URLSearchParams({
      To: input.to,
      From: input.from ?? from,
      // Twilio reads this TwiML to run the call; it posts audio webhooks back.
      Twiml: `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/></Response>`,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Twilio call failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { sid: string; status: string };
    return { provider_call_id: data.sid, status: "calling" };
  }

  async endCall(session: CallSession): Promise<void> {
    if (!this.creds) return;
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.creds.accountSid}/Calls/${session.provider_call_id}.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${this.creds.accountSid}:${this.creds.authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Status: "completed" }),
      },
    ).catch(() => {
      // end-call failure must not crash the lifecycle; event already logged.
    });
  }

  async getCallStatus(session: CallSession): Promise<CallSession["status"]> {
    if (!this.creds) return "ended";
    const res = await fetch(
      `https://api.twilio.com/2010-04-1/Accounts/${this.creds.accountSid}/Calls/${session.provider_call_id}.json`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${this.creds.accountSid}:${this.creds.authToken}`)}`,
        },
      },
    );
    if (!res.ok) return "ended";
    const data = (await res.json()) as { status: string };
    if (["in-progress", "ringing", "queued"].includes(data.status)) return "calling";
    return "ended";
  }
}

/**
 * Browser demo provider. The actual media transport lives client-side
 * (getUserMedia + Web Speech API); this provider models the session locally
 * and clearly labels calls as browser demo sessions, never as real phone calls.
 */
export class BrowserCallingProvider implements CallingProvider {
  readonly name = "browser-demo";
  readonly available = true;
  private seq = 0;

  async initiateCall(input: { to: string }): Promise<CallSession> {
    this.seq += 1;
    return {
      provider_call_id: `browser-${Date.now()}-${this.seq}`,
      status: "connected",
    };
  }

  async endCall(): Promise<void> {
    /* browser session ends when the console stops the media stream */
  }

  async getCallStatus(session: CallSession): Promise<CallSession["status"]> {
    return session.status === "ended" ? "ended" : "connected";
  }
}

export function makeCallingProvider(mode: "browser" | "telephony"): CallingProvider {
  if (mode === "telephony") {
    return new TwilioCallingProvider(null); // credentials are env-only in this sandbox
  }
  return new BrowserCallingProvider();
}
