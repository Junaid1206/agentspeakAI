// Browser SpeechSynthesis adapter. A cloud TTS provider can implement the
// same interface without changing the call console.
export interface TextToSpeechProvider {
  readonly name: string;
  readonly available: boolean;
  speak(text: string): Promise<void>;
  cancel(): void;
}

export class BrowserTextToSpeech implements TextToSpeechProvider {
  readonly name = "browser-speechsynthesis";
  readonly available: boolean;
  private voice: SpeechSynthesisVoice | null = null;
  private settleCurrent: (() => void) | null = null;

  constructor() {
    this.available = typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|zira|aria/i.test(v.name)) ??
      voices.find((v) => /en[-_]US/i.test(v.lang)) ??
      voices.find((v) => /en/i.test(v.lang)) ?? voices[0] ?? null;
  }

  async speak(text: string): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      throw new Error("Speech synthesis is not supported in this browser.");
    }
    this.cancel();
    if (!this.voice) this.voice = this.pickVoice();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (this.settleCurrent === settle) this.settleCurrent = null;
        resolve();
      };
      this.settleCurrent = settle;
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.02;
      utterance.pitch = 1;
      utterance.onend = settle;
      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        if (this.settleCurrent === settle) this.settleCurrent = null;
        // Cancellation is an expected control action, not a call failure.
        if (event.error === "canceled" || event.error === "interrupted") resolve();
        else reject(new Error(event.error || "tts_failed"));
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        this.settleCurrent = null;
        reject(error);
      }
    });
  }

  cancel(): void {
    const settle = this.settleCurrent;
    this.settleCurrent = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    settle?.();
  }
}
