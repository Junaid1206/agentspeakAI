import { api } from "@/convex/_generated/api";
import { BrowserSpeechToText } from "@/lib/voice/stt";
import { BrowserTextToSpeech } from "@/lib/voice/tts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

export type CallPhase =
  | "idle"
  | "connecting"
  | "ai_speaking"
  | "listening"
  | "processing"
  | "ending"
  | "ended"
  | "failed";

export interface TranscriptItem {
  speaker: "customer" | "ai" | "system";
  message: string;
  sequence_number: number;
}

const SILENCE_TIMEOUT_MS = 8000;

export function useVoiceCall(callId: string | null) {
  const sttRef = useRef<BrowserSpeechToText | null>(null);
  const ttsRef = useRef<BrowserTextToSpeech | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const endedRef = useRef(false);
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const startedRef = useRef(false);

  const [phase, setPhaseState] = useState<CallPhase>("idle");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const call = useQuery(
    api.calls.get,
    callId ? { id: callId as never } : "skip",
  );

  const markCalling = useMutation(api.calls.markCalling);
  const markConnected = useMutation(api.calls.markConnected);
  const logEventMutation = useMutation(api.calls.logEvent);
  const endCallMutation = useMutation(api.calls.endCall);

  const greetingAction = useAction(api.agent.orchestrator.greeting);
  const turnAction = useAction(api.agent.orchestrator.turn);
  const silenceAction = useAction(api.agent.orchestrator.silence);
  const summarizeAction = useAction(api.agent.orchestrator.summarize);

  // Credits: 1 credit = 1 call minute. Sessions need at least 1 credit to start.
  const balance = useQuery(api.billing.myBalance) as
    | { credits: number; orders: unknown[] }
    | undefined;
  const noCredits = (balance?.credits ?? 0) < 1;

  // Keep latest actions reachable from long-lived callbacks (recognition events).
  const actionsRef = useRef({ greetingAction, turnAction, silenceAction, summarizeAction });
  useEffect(() => {
    actionsRef.current = { greetingAction, turnAction, silenceAction, summarizeAction };
  }, [greetingAction, turnAction, silenceAction, summarizeAction]);

  const setPhase = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const pushLocal = useCallback((speaker: TranscriptItem["speaker"], message: string) => {
    seqRef.current += 1;
    setTranscript((prev) => [
      ...prev,
      { speaker, message, sequence_number: seqRef.current },
    ]);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(async () => {
      if (endedRef.current || phaseRef.current !== "listening") return;
      try {
        const result = await actionsRef.current.silenceAction({ call_id: callId as never });
        pushLocal("ai", result.response);
        await speak(result.response);
        if (result.should_end_call) {
          await endCallInternal("Customer remained silent after repeated prompts.");
        } else {
          startListening();
        }
      } catch (e) {
        console.warn("[voice] silence handling failed", e);
        startListening();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, SILENCE_TIMEOUT_MS);
  }, [callId, clearSilenceTimer, pushLocal]);

  const speak = useCallback(
    async (text: string) => {
      clearSilenceTimer();
      setLiveTranscript("");
      setPhase("ai_speaking");
      const tts = ttsRef.current;
      if (!tts?.available) {
        await logEventMutation({
          call_id: callId as never,
          event: "tts_failed",
          detail: "Speech synthesis unavailable",
        });
        return;
      }
      try {
        await tts.speak(text);
      } catch (e) {
        await logEventMutation({
          call_id: callId as never,
          event: "tts_failed",
          detail: e instanceof Error ? e.message : "tts error",
        });
      }
    },
    [callId, clearSilenceTimer, logEventMutation, setPhase],
  );

  const startListening = useCallback(() => {
    if (endedRef.current) return;
    const stt = sttRef.current;
    if (!stt?.available) {
      setError("Speech recognition is not available in this browser.");
      setPhase("failed");
      return;
    }
    armSilenceTimer();
    stt.start().catch((e) => {
      setError(e instanceof Error ? e.message : "Could not start listening.");
      setPhase("failed");
    });
  }, [armSilenceTimer]);

  const handleFinalUtterance = useCallback(
    async (text: string) => {
      if (endedRef.current || busyRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) {
        startListening();
        return;
      }
      busyRef.current = true;
      clearSilenceTimer();
      setLiveTranscript("");
      pushLocal("customer", trimmed);
      setPhase("processing");
      try {
        const result = await actionsRef.current.turnAction({
          call_id: callId as never,
          message: trimmed,
        });
        pushLocal("ai", result.response);
        await speak(result.response);
        if (result.should_end_call) {
          await endCallInternal("Agent completed the call objective.");
        } else {
          startListening();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Agent turn failed.";
        setError(message);
        pushLocal("system", `Agent error: ${message}`);
        startListening();
      } finally {
        busyRef.current = false;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [callId, clearSilenceTimer, pushLocal, speak, startListening],
  );

  const endCallInternal = useCallback(
    async (reason: string) => {
      if (endedRef.current || !callId) return;
      endedRef.current = true;
      clearSilenceTimer();
      setPhase("ending");
      sttRef.current?.stop();
      ttsRef.current?.cancel();
      try {
        await endCallMutation({
          id: callId as never,
          final_status: "completed",
          outcome: "completed",
          lead_status: (call?.lead_status ?? "follow_up") as never,
          follow_up_required: call?.follow_up_required ?? true,
          reason,
        });
      } catch (e) {
        console.warn("[voice] end-call mutation failed", e);
      }
      try {
        await actionsRef.current.summarizeAction({ call_id: callId as never });
      } catch (e) {
        console.warn("[voice] summary generation failed", e);
      }
      setPhase("ended");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callId, clearSilenceTimer, endCallMutation],
  );

  const start = useCallback(async () => {
    if (startedRef.current || !callId) return;
    if (noCredits) {
      setError(
        "No calling credits left. Top up your balance on the Billing page to run more sessions.",
      );
      setPhase("failed");
      return;
    }
    startedRef.current = true;
    setError(null);
    setPhase("connecting");

    // Mic permission up-front so Web Speech has access.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
      setError("Microphone access was denied. Allow the microphone and try again.");
      setPhase("failed");
      startedRef.current = false;
      return;
    }

    const stt = new BrowserSpeechToText();
    const tts = new BrowserTextToSpeech();
    if (!stt.available || !tts.available) {
      setError("This browser does not support the Web Speech API. Try Chrome or Edge.");
      setPhase("failed");
      startedRef.current = false;
      return;
    }
    stt.onTranscript((text, isFinal) => {
      if (isFinal) {
        const finalText = stt.consumeTranscript();
        if (finalText) void handleFinalUtterance(finalText);
      } else {
        setLiveTranscript(text);
      }
    });
    stt.onError((err) => {
      if (err === "not-allowed" || err === "service-not-allowed") {
        setMicPermission("denied");
        setError("Speech recognition was blocked. Allow microphone access and retry.");
        setPhase("failed");
      }
      // 'no-speech' and 'aborted' are handled by the silence timer instead.
    });
    sttRef.current = stt;
    ttsRef.current = tts;

    try {
      await markCalling({ id: callId as never });
      pushLocal("system", "Browser Voice Demo session opened (simulated call, not a phone call).");

      const { greeting } = await actionsRef.current.greetingAction({ call_id: callId as never });
      await markConnected({ id: callId as never });
      pushLocal("ai", greeting);
      await speak(greeting);
      startListening();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start the call.";
      setError(message);
      setPhase("failed");
      startedRef.current = false;
    }
  }, [callId, markCalling, markConnected, pushLocal, speak, startListening, handleFinalUtterance]);

  /** Operator button: stop AI speech and let the customer talk (soft barge-in). */
  const interrupt = useCallback(() => {
    if (phaseRef.current !== "ai_speaking") return;
    ttsRef.current?.cancel();
    startListening();
  }, [startListening]);

  const end = useCallback(() => {
    void endCallInternal("Operator ended the call.");
  }, [endCallInternal]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      endedRef.current = true;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      sttRef.current?.stop();
      ttsRef.current?.cancel();
    };
  }, []);

  return {
    phase,
    transcript,
    liveTranscript,
    error,
    micPermission,
    call,
    start,
    end,
    interrupt,
    credits: balance?.credits ?? 0,
    noCredits,
  };
}
