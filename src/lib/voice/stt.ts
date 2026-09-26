// ---------------------------------------------------------------------------
// STT provider abstraction. The browser implementation uses the Web Speech
// API; a server-side STT provider can replace it without touching the call
// console, because the console only depends on the SpeechToTextProvider shape.
// ---------------------------------------------------------------------------

export interface SpeechToTextProvider {
  readonly name: string;
  readonly available: boolean;
  /** Begin listening; resolves when speech ends (final transcript available). */
  start(): Promise<void>;
  stop(): void;
  /** Latest final transcript chunk since last consume. */
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

  constructor(lang = "en-US") {
    this.available = !!getRecognitionCtor();
    this.lang = lang;
  }

  private lang: string;

  async start(): Promise<void> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      throw new Error("Speech recognition is not supported in this browser.");
    }
    this.finalText = "";
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          this.finalText += text;
        } else {
          interim += text;
        }
      }
      this.onTranscriptCb?.(this.finalText + interim, false);
    };
    rec.onerror = (event: any) => {
      const code = event?.error ?? "stt_error";
      // 'no-speech' is a normal timeout, not a hard failure.
      this.onErrorCb?.(code);
      this.active = false;
    };
    rec.onend = () => {
      this.active = false;
      if (this.finalText.trim()) {
        this.onTranscriptCb?.(this.finalText, true);
      }
    };

    this.recognition = rec;
    this.active = true;
    rec.start();
  }

  stop(): void {
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.active = false;
  }

  consumeTranscript(): string {
    const t = this.finalText.trim();
    this.finalText = "";
    return t;
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
