// Voice call session over the FastAPI WebSocket protocol (/ws/calls/{id}).
import { api } from "@/lib/api";
import { BrowserSpeechToText } from "@/lib/stt";
import { BrowserTextToSpeech } from "@/lib/tts";
import { useCallback, useEffect, useRef, useState } from "react";

export type CallPhase = "idle" | "connecting" | "ai_speaking" | "listening" | "processing" | "ending" | "ended" | "failed";
export interface TranscriptItem {
  speaker: "customer" | "ai" | "system";
  message: string;
  sequence_number: number;
}

const SILENCE_TIMEOUT_MS = 8000;
const WS_CONNECT_TIMEOUT_MS = 10000;

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
  const speechTokenRef = useRef(0);

  const [phase, setPhaseState] = useState<CallPhase>("idle");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [agentState, setAgentState] = useState<{ collected: Record<string, string | null>; missing_fields: string[]; stage: string } | null>(null);

  const setPhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const pushLocal = useCallback((speaker: TranscriptItem["speaker"], message: string) => {
    seqRef.current += 1;
    setTranscript((previous) => [...previous, { speaker, message, sequence_number: seqRef.current }]);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  }, []);

  const sendFrame = useCallback((frame: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Real-time connection is not ready. Please end this call and start a new one.");
      return false;
    }
    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send the voice message.");
      return false;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => {
      if (endedRef.current || phaseRef.current !== "listening" || !callId) return;
      if (sendFrame({ type: "silence" })) setPhase("processing");
    }, SILENCE_TIMEOUT_MS);
  }, [callId, clearSilenceTimer, sendFrame, setPhase]);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    clearSilenceTimer();
    setLiveTranscript("");
    const token = ++speechTokenRef.current;
    setPhase("ai_speaking");
    const tts = ttsRef.current;
    if (!tts?.available) return true;
    try {
      await tts.speak(text);
    } catch (error) {
      setError(error instanceof Error ? `Voice playback failed: ${error.message}` : "Voice playback failed.");
    }
    return token === speechTokenRef.current && !endedRef.current;
  }, [clearSilenceTimer, setPhase]);

  const startListening = useCallback(() => {
    if (endedRef.current) return;
    const stt = sttRef.current;
    if (!stt?.available) {
      setError("Speech recognition is not supported in this browser. Try a supported desktop Chrome browser.");
      setPhase("failed");
      return;
    }
    if (stt.isActive) return;
    setPhase("listening");
    armSilenceTimer();
    stt.start().catch((error) => {
      clearSilenceTimer();
      if (endedRef.current) return;
      setError(error instanceof Error ? `Could not start listening: ${error.message}` : "Could not start listening.");
      setPhase("failed");
    });
  }, [armSilenceTimer, clearSilenceTimer, setPhase]);

  const endCallRest = useCallback(async (reason: string) => {
    if (endedRef.current || !callId) return;
    endedRef.current = true;
    speechTokenRef.current += 1;
    clearSilenceTimer();
    setPhase("ending");
    sttRef.current?.stop();
    ttsRef.current?.cancel();
    const ws = wsRef.current;
    wsRef.current = null;
    try { ws?.close(); } catch { /* already closed */ }
    try {
      await api.endCall(callId, reason);
      setPhase("ended");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not end the call on the server.";
      setError(`Call ended locally, but server update failed: ${message}`);
      setPhase("failed");
    }
  }, [callId, clearSilenceTimer, setPhase]);

  const handleFinalUtterance = useCallback((text: string) => {
    if (endedRef.current || busyRef.current || !callId) return;
    const trimmed = text.trim();
    if (!trimmed) { startListening(); return; }
    busyRef.current = true;
    clearSilenceTimer();
    setLiveTranscript("");
    pushLocal("customer", trimmed);
    setPhase("processing");
    if (!sendFrame({ type: "customer_message", message: trimmed })) {
      busyRef.current = false;
      setPhase("failed");
    }
  }, [callId, clearSilenceTimer, pushLocal, sendFrame, setPhase, startListening]);

  const start = useCallback(async () => {
    if (startedRef.current || !callId) return;
    startedRef.current = true;
    endedRef.current = false;
    busyRef.current = false;
    setError(null);
    setPhase("connecting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not provide microphone access. Use HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
    } catch (error) {
      setMicPermission("denied");
      setError(error instanceof Error ? error.message : "Microphone access failed. Allow microphone access and retry.");
      setPhase("failed");
      startedRef.current = false;
      return;
    }

    const stt = new BrowserSpeechToText();
    const tts = new BrowserTextToSpeech();
    if (!stt.available || !tts.available) {
      setError("This browser does not support the required Web Speech APIs. Try Chrome or Edge.");
      setPhase("failed");
      startedRef.current = false;
      return;
    }
    stt.onTranscript((text, isFinal) => {
      if (endedRef.current) return;
      if (isFinal) {
        const finalText = stt.consumeTranscript();
        if (finalText) handleFinalUtterance(finalText);
      } else setLiveTranscript(text);
    });
    stt.onError((code) => {
      if (endedRef.current) return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setMicPermission("denied");
        setError("Speech recognition was blocked. Check browser microphone and speech permissions.");
        setPhase("failed");
      } else if (code !== "no-speech" && code !== "aborted") {
        setError(`Speech recognition error: ${code}`);
      }
    });
    sttRef.current = stt;
    ttsRef.current = tts;

    try {
      const { greeting } = await api.greeting(callId);
      pushLocal("ai", greeting);
      const ws = new WebSocket(api.wsUrl(callId));
      wsRef.current = ws;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out connecting to the call server.")), WS_CONNECT_TIMEOUT_MS);
        ws.onopen = () => { clearTimeout(timeout); resolve(); };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error("Could not connect to the real-time call server.")); };
        ws.onclose = () => { clearTimeout(timeout); if (ws.readyState !== WebSocket.OPEN) reject(new Error("Call server closed the connection.")); };
      });
      ws.onmessage = async (event) => {
        let frame: Record<string, any>;
        try { frame = JSON.parse(String(event.data)); }
        catch { setError("Received an invalid message from the call server."); return; }
        switch (frame.type) {
          case "ai_message": {
            if (endedRef.current) return;
            const message = String(frame.message ?? "");
            pushLocal("ai", message);
            setAgentState((previous) => ({
              collected: frame.collected ?? previous?.collected ?? {},
              missing_fields: frame.missing_fields ?? previous?.missing_fields ?? [],
              stage: frame.stage ?? previous?.stage ?? "discovery",
            }));
            busyRef.current = false;
            const completed = await speak(message);
            if (!completed || endedRef.current) return;
            if (frame.should_end_call) await endCallRest("Agent completed the call objective.");
            else startListening();
            break;
          }
          case "call_ended":
            if (!endedRef.current) await endCallRest("Agent completed the call objective.");
            break;
          case "error":
            setError(String(frame.detail ?? "Call server error."));
            busyRef.current = false;
            if (String(frame.detail).includes("already ended")) await endCallRest("Call already ended.");
            else startListening();
            break;
          default: break;
        }
      };
      ws.onerror = () => {
        if (!endedRef.current) { setError("Real-time connection lost."); setPhase("failed"); }
      };
      ws.onclose = () => {
        if (!endedRef.current && phaseRef.current !== "failed") {
          setError("Call connection closed unexpectedly.");
          setPhase("failed");
        }
      };
      const greetingFinished = await speak(greeting);
      if (greetingFinished) startListening();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start the call.";
      setError(message);
      setPhase("failed");
      startedRef.current = false;
      sttRef.current?.stop();
      ttsRef.current?.cancel();
      try { wsRef.current?.close(); } catch { /* noop */ }
    }
  }, [callId, endCallRest, handleFinalUtterance, pushLocal, setPhase, speak, startListening]);

  const interrupt = useCallback(() => {
    if (endedRef.current || phaseRef.current !== "ai_speaking") return;
    speechTokenRef.current += 1;
    ttsRef.current?.cancel();
    sttRef.current?.stop();
    if (!sendFrame({ type: "interrupt" })) {
      setPhase("failed");
      return;
    }
    startListening();
  }, [sendFrame, setPhase, startListening]);

  const end = useCallback(() => { void endCallRest("Operator ended the call."); }, [endCallRest]);

  useEffect(() => () => {
    endedRef.current = true;
    speechTokenRef.current += 1;
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    sttRef.current?.stop();
    ttsRef.current?.cancel();
    try { wsRef.current?.close(); } catch { /* noop */ }
  }, []);

  return { phase, transcript, liveTranscript, error, micPermission, agentState, start, end, interrupt };
}
