// Browser SpeechRecognition adapter. A server STT provider can implement the
// same interface without changing the call console.
export interface SpeechToTextProvider {
  readonly name: string;
  readonly available: boolean;
  start(): Promise<void>;
  stop(): void;
  consumeTranscript(): string;
  onTranscript(cb: (text: string, isFinal: boolean) => void): void;
  onError(cb: (err: string) => void): void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export class BrowserSpeechToText implements SpeechToTextProvider {
  readonly name = "browser-webspeech";
  readonly available: boolean;
  private recognition: SpeechRecognitionLike | null = null;
  private finalText = "";
  private onTranscriptCb: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCb: ((err: string) => void) | null = null;
  private active = false;
  private lang: string;

  constructor(lang = "en-US") {
    this.available = !!getRecognitionCtor();
    this.lang = lang;
  }

  async start(): Promise<void> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) throw new Error("Speech recognition is not supported in this browser.");
    if (this.active) return;

    this.finalText = "";
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      if (this.recognition !== rec) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) this.finalText += text;
        else interim += text;
      }
      this.onTranscriptCb?.(this.finalText + interim, false);
    };
    rec.onerror = (event: any) => {
      if (this.recognition !== rec) return;
      const code = String(event?.error ?? "stt_error");
      this.onErrorCb?.(code);
      this.active = false;
    };
    rec.onend = () => {
      if (this.recognition !== rec) return;
      this.active = false;
      this.recognition = null;
      const final = this.finalText.trim();
      if (final) this.onTranscriptCb?.(final, true);
    };

    this.recognition = rec;
    try {
      rec.start();
      this.active = true;
    } catch (error) {
      this.recognition = null;
      this.active = false;
      throw error;
    }
  }

  stop(): void {
    const rec = this.recognition;
    this.recognition = null;
    this.active = false;
    try {
      rec?.abort?.();
      if (rec && !rec.abort) rec.stop();
    } catch {
      // Recognition may already have ended.
    }
  }

  consumeTranscript(): string {
    const text = this.finalText.trim();
    this.finalText = "";
    return text;
  }

  onTranscript(cb: (text: string, isFinal: boolean) => void): void {
    this.onTranscriptCb = cb;
  }

  onError(cb: (err: string) => void): void {
    this.onErrorCb = cb;
  }

  get isActive(): boolean {
    return this.active;
  }
}
