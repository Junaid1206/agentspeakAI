// Voice call session over the FastAPI WebSocket protocol (/ws/calls/{id}).
// Browser STT/TTS feed the socket; server agent decisions come back as frames.

import { api } from "@/lib/api";
import { BrowserSpeechToText } from "@/lib/voice/stt";
import { BrowserTextToSpeech } from "@/lib/voice/tts";
import { useCallback, useEffect, useRef, useState } from "react";

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

export function useVoiceCallRest(callId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
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
  const [agentState, setAgentState] = useState<{
    collected: Record<string, string | null>;
    missing_fields: string[];
    stage: string;
  } | null>(null);

  const setPhase = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const pushLocal = useCallback((speaker: TranscriptItem["speaker"], message: string) => {
    seqRef.current += 1;
    setTranscript((prev) => [...prev, { speaker, message, sequence_number: seqRef.current }]);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => {
      if (endedRef.current || phaseRef.current !== "listening" || !callId) return;
      wsRef.current?.send(JSON.stringify({ type: "silence" }));
      setPhase("processing");
    }, SILENCE_TIMEOUT_MS);
  }, [callId, clearSilenceTimer, setPhase]);

  const speak = useCallback(
    async (text: string) => {
      clearSilenceTimer();
      setLiveTranscript("");
      setPhase("ai_speaking");
      const tts = ttsRef.current;
      if (!tts?.available) return;
      try {
        await tts.speak(text);
      } catch {
        /* TTS failure logged server-side; continue via transcript */
      }
    },
    [clearSilenceTimer, setPhase],
  );

  const startListening = useCallback(() => {
    if (endedRef.current) return;
    const stt = sttRef.current;
    if (!stt?.available) return;
    armSilenceTimer();
    stt.start().catch(() => {
      setError("Could not restart listening.");
    });
  }, [armSilenceTimer]);

  const endCallRest = useCallback(
    async (reason: string) => {
      if (endedRef.current || !callId) return;
      endedRef.current = true;
      clearSilenceTimer();
      setPhase("ending");
      sttRef.current?.stop();
      ttsRef.current?.cancel();
      try {
        wsRef.current?.close();
      } catch {
        /* already closing */
      }
      try {
        await api.endCall(callId, reason);
      } catch (e) {
        console.warn("[voice] end-call failed", e);
      }
      setPhase("ended");
    },
    [callId, clearSilenceTimer, setPhase],
  );

  const handleFinalUtterance = useCallback(
    (text: string) => {
      if (endedRef.current || busyRef.current || !callId) return;
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
      wsRef.current?.send(JSON.stringify({ type: "customer_message", message: trimmed }));
    },
    [callId, clearSilenceTimer, pushLocal, setPhase, startListening],
  );

  const start = useCallback(async () => {
    if (startedRef.current || !callId) return;
    startedRef.current = true;
    setError(null);
    setPhase("connecting");

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
        if (finalText) handleFinalUtterance(finalText);
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
    });
    sttRef.current = stt;
    ttsRef.current = tts;

    // Greeting then socket.
    try {
      const { greeting } = await api.greeting(callId);
      pushLocal("ai", greeting);

      const ws = new WebSocket(api.wsUrl(callId));
      wsRef.current = ws;
      ws.onmessage = async (event) => {
        const frame = JSON.parse(event.data as string);
        switch (frame.type) {
          case "ai_message": {
            pushLocal("ai", frame.message as string);
            setAgentState((prev) => ({
              collected: frame.collected ?? prev?.collected ?? {},
              missing_fields: frame.missing_fields ?? prev?.missing_fields ?? [],
              stage: frame.stage ?? prev?.stage ?? "discovery",
            }));
            busyRef.current = false;
            await speak(frame.message as string);
            if (frame.should_end_call) {
              await endCallRest("Agent completed the call objective.");
            } else {
              startListening();
            }
            break;
          }
          case "call_ended":
            await endCallRest("Agent completed the call objective.");
            break;
          case "error":
            setError(frame.detail as string);
            busyRef.current = false;
            if (String(frame.detail).includes("already ended")) {
              await endCallRest("Call already ended.");
            } else {
              startListening();
            }
            break;
          default:
            break;
        }
      };
      ws.onerror = () => {
        setError("Real-time connection lost.");
        setPhase("failed");
      };

      await speak(greeting);
      startListening();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the call.");
      setPhase("failed");
      startedRef.current = false;
    }
  }, [callId, endCallRest, handleFinalUtterance, pushLocal, speak, startListening]);

  const interrupt = useCallback(() => {
    if (phaseRef.current !== "ai_speaking") return;
    ttsRef.current?.cancel();
    wsRef.current?.send(JSON.stringify({ type: "interrupt" }));
    startListening();
  }, [startListening]);

  const end = useCallback(() => {
    void endCallRest("Operator ended the call.");
  }, [endCallRest]);

  useEffect(() => {
    return () => {
      endedRef.current = true;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      sttRef.current?.stop();
      ttsRef.current?.cancel();
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  return {
    phase,
    transcript,
    liveTranscript,
    error,
    micPermission,
    agentState,
    start,
    end,
    interrupt,
  };
}
