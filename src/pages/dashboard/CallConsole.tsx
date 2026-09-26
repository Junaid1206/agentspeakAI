import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { titleCase } from "@/lib/call-display";
import { useVoiceCall, type CallPhase } from "@/hooks/use-voice-call";
import { useQuery } from "convex/react";
import {
  Bot,
  Hand,
  Mic,
  PhoneOff,
  Play,
  Square,
  User,
  Waves,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { useState } from "react";

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  ai_speaking: "Sam is speaking…",
  listening: "Listening…",
  processing: "Processing…",
  ending: "Ending call…",
  ended: "Call ended",
  failed: "Failed",
};

const PHASE_TONE: Record<CallPhase, string> = {
  idle: "bg-secondary text-secondary-foreground",
  connecting: "bg-amber-50 text-amber-800 border-amber-300/60",
  ai_speaking: "bg-sky-50 text-sky-800 border-sky-300/60",
  listening: "bg-emerald-50 text-emerald-800 border-emerald-300/60",
  processing: "bg-violet-50 text-violet-800 border-violet-300/60",
  ending: "bg-amber-50 text-amber-800 border-amber-300/60",
  ended: "bg-emerald-50 text-emerald-800 border-emerald-300/60",
  failed: "bg-red-50 text-red-800 border-red-300/60",
};

export default function CallConsole() {
  const { callId } = useParams<{ callId: string }>();
  const call = useQuery(api.calls.get, callId ? { id: callId as never } : "skip");
  const dbTranscript = useQuery(
    api.calls.transcript,
    callId ? { call_id: callId as never } : "skip",
  );
  const agentState = useQuery(api.calls.agentState, callId ? { call_id: callId as never } : "skip");
  const voice = useVoiceCall(callId ?? null);

  const isActive = !["ended", "failed"].includes(voice.phase);
  const missing: string[] = agentState?.missing_fields ?? [];
  const collected = Object.entries(
    ((agentState?.collected ?? {}) as Record<string, string | null>),
  ).filter(([, v]) => typeof v === "string" && v.trim());

  return (
    <AppShell
      active="/dashboard/calls"
      title="Live Call Console"
      description="Browser Voice Demo — microphone in, AI voice out. Not a real phone call."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Conversation stage */}
          <Card className="studio-frame shadow-none">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-5 py-4">
                <div className="flex items-center gap-8">
                  {/* Customer (you) */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={cn(
                        "flex size-16 items-center justify-center rounded-full border bg-card",
                        voice.phase === "listening"
                          ? "border-emerald-300 ring-4 ring-emerald-100"
                          : "border-border",
                      )}
                    >
                      <User className="size-6 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      You ({call?.customer?.name ?? "Customer"})
                    </span>
                  </div>

                  {/* Waveform */}
                  <div className="flex h-10 items-center gap-1">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-muted-foreground/40"
                        style={{
                          height: `${voice.phase === "ai_speaking" || voice.phase === "listening" ? 6 + ((i * 7) % 26) : 5}px`,
                          animation:
                            voice.phase === "ai_speaking" || voice.phase === "listening"
                              ? `pulse 1s ease-in-out ${i * 60}ms infinite alternate`
                              : undefined,
                        }}
                      />
                    ))}
                  </div>

                  {/* AI */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={cn(
                        "flex size-16 items-center justify-center rounded-full border bg-card",
                        voice.phase === "ai_speaking"
                          ? "border-sky-300 ring-4 ring-sky-100"
                          : "border-border",
                      )}
                    >
                      <Bot className="size-6 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground">Sam (AI agent)</span>
                  </div>
                </div>

                <Badge variant="outline" className={cn("px-3 py-1", PHASE_TONE[voice.phase])}>
                  {PHASE_LABEL[voice.phase]}
                </Badge>

                {voice.liveTranscript && voice.phase === "listening" ? (
                  <p className="max-w-md text-center text-sm italic text-muted-foreground">
                    “{voice.liveTranscript}”
                  </p>
                ) : null}

                {voice.phase === "idle" && (
                  <div className="flex flex-col items-center gap-2">
                    <Button onClick={() => voice.start()} size="lg" className="gap-2">
                      <Play className="size-4" />
                      Start voice session
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {voice.noCredits
                        ? "No calling credits — top up on the Billing page."
                        : `${voice.credits} calling credit${voice.credits === 1 ? "" : "s"} available`}
                    </span>
                  </div>
                )}

                {isActive && voice.phase !== "idle" && (
                  <div className="flex gap-2">
                    {voice.phase === "ai_speaking" ? (
                      <Button variant="outline" size="sm" onClick={voice.interrupt}>
                        <Hand className="size-4" />
                        Interrupt &amp; speak
                      </Button>
                    ) : null}
                    <Button variant="destructive" size="sm" onClick={voice.end}>
                      <PhoneOff className="size-4" />
                      End call
                    </Button>
                  </div>
                )}

                {voice.phase === "ended" && callId ? (
                  <Button asChild size="sm">
                    <Link to={`/dashboard/calls/${callId}`}>View call report</Link>
                  </Button>
                ) : null}

                {voice.error ? (
                  <p className="max-w-md rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">
                    {voice.error}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Live transcript */}
          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Waves className="size-4 text-muted-foreground" />
                <p className="studio-label">Conversation</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {voice.transcript.length} turns
                </span>
              </div>
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {(dbTranscript ?? voice.transcript).length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    The conversation appears here in real time.
                  </p>
                )}
                {(dbTranscript ?? voice.transcript).map((m) => (
                  <div
                    key={(m as { _id?: string; sequence_number: number })._id ?? m.sequence_number}
                    className={cn(
                      "rounded-lg border p-3",
                      m.speaker === "customer"
                        ? "border-border/60 bg-secondary/40"
                        : m.speaker === "ai"
                          ? "border-border/60 bg-card"
                          : "border-dashed border-border/60 text-xs text-muted-foreground",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      {m.speaker === "ai" ? (
                        <Bot className="size-3.5 text-muted-foreground" />
                      ) : m.speaker === "customer" ? (
                        <User className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Square className="size-3 text-muted-foreground" />
                      )}
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {m.speaker === "ai" ? "Sam (AI)" : m.speaker === "customer" ? "You" : "System"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{m.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <p className="studio-label">Session</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{call?.customer?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{call?.customer?.phone_number ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium">Browser Voice Demo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mic</span>
                  <span className="font-medium">
                    {voice.micPermission === "granted"
                      ? "Granted"
                      : voice.micPermission === "denied"
                        ? "Denied"
                        : "Not requested"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <p className="studio-label">Agent state</p>
              {collected.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Information the agent collects appears here as the conversation progresses.
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                {collected.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">{titleCase(k)}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                ))}
              </div>
              {missing.length > 0 && (
                <>
                  <div className="studio-hairline mt-4 pt-3">
                    <p className="text-xs text-muted-foreground">Still needed</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {missing.map((f) => (
                        <Badge key={f} variant="outline" className="text-muted-foreground">
                          {titleCase(f)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <p className="studio-label">How it works</p>
              <ol className="mt-3 list-inside list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>Your speech is transcribed by the browser STT engine.</li>
                <li>The agent loads call state and sends context to the LLM.</li>
                <li>The LLM returns a structured decision (extracted fields, next question).</li>
                <li>The response is persisted, then spoken by TTS.</li>
              </ol>
              <div className="mt-3 flex items-center gap-2">
                <Mic className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Silence over 8s triggers a polite check-in.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
