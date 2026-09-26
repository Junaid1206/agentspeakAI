// ---------------------------------------------------------------------------
// TTS provider abstraction. Browser implementation uses SpeechSynthesis.
// A cloud TTS provider can be swapped in without touching call UI code.
// ---------------------------------------------------------------------------

export interface TextToSpeechProvider {
  readonly name: string;
  readonly available: boolean;
  /** Speak text; resolves when playback finishes. */
  speak(text: string): Promise<void>;
  /** Abort current playback (used for barge-in). */
  cancel(): void;
}

export class BrowserTextToSpeech implements TextToSpeechProvider {
  readonly name = "browser-speechsynthesis";
  readonly available: boolean;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.available = typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred =
      voices.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|zira|aria/i.test(v.name)) ??
      voices.find((v) => /en[-_]US/i.test(v.lang)) ??
      voices.find((v) => /en/i.test(v.lang)) ??
      voices[0];
    return preferred ?? null;
  }

  async speak(text: string): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      throw new Error("Speech synthesis is not supported in this browser.");
    }
    this.cancel();
    if (!this.voice) this.voice = this.pickVoice();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.02;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(new Error(e.error || "tts_failed"));
      window.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}
