import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Database,
  Gauge,
  Mic,
  PhoneCall,
  ScrollText,
  Waves,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md border border-border/80 bg-card">
        <PhoneCall className="size-3.5 text-primary" />
      </span>
      <span className="text-sm font-semibold tracking-tight">Aria Calling Studio</span>
    </Link>
  );
}

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background"
    >
      {/* Header */}
      <header className="border-b border-border/80">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open the studio
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border/80">
        <div className="mx-auto w-full max-w-5xl px-6 py-24 text-center">
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="studio-label"
          >
            AI Outbound Calling Agent
          </motion.p>
          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl"
          >
            Voice conversations, handled end to end.
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground"
          >
            Aria calls, listens, qualifies and documents — an agentic voice workflow with explicit
            conversation state, structured extraction and a complete audit trail in the dashboard.
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              to="/auth"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start calling
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-5 text-sm font-medium transition-colors hover:bg-accent"
            >
              View the dashboard
            </Link>
          </motion.div>

          {/* Demo-mode label */}
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mx-auto mt-10 max-w-md rounded-md border border-dashed border-border px-4 py-2.5 text-xs text-muted-foreground"
          >
            Runs in Browser Voice Demo mode — microphone in, AI voice out. Conversations are
            simulated, never presented as real phone calls.
          </motion.p>
        </div>
      </section>

      {/* Conversation strip — editorial example */}
      <section className="border-b border-border/80 bg-secondary/40">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-20 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <p className="studio-label">The conversation</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              An agent that keeps its place in the story.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Aria tracks nine structured fields across the call. Answered questions are never
              repeated; the next question is always chosen from what is still missing — capacity,
              location, budget, timeline, application.
            </p>
          </div>
          <div className="studio-frame rounded-lg p-5 shadow-none">
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border/60 bg-card p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Aria (AI)</p>
                <p className="mt-1 leading-relaxed">
                  Hello Rahul, this is Aria from WaterFlow Solutions regarding your RO enquiry. What
                  capacity are you looking for?
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Rahul</p>
                <p className="mt-1 leading-relaxed">Around 500 LPH, for my hotel in Bangalore.</p>
              </div>
              <div className="rounded-md border border-border/60 bg-card p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Aria (AI)</p>
                <p className="mt-1 leading-relaxed">
                  Great — a 500 LPH system for the hotel in Bangalore. What budget do you have in
                  mind?
                </p>
              </div>
              <div className="rounded-md border border-dashed border-border/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Agent state
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  ro_capacity: 500 LPH · location: Bangalore · budget: —
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature plates */}
      <section className="border-b border-border/80">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <p className="studio-label text-center">The architecture</p>
          <h2 className="mx-auto mt-4 max-w-lg text-center text-2xl font-semibold tracking-tight">
            Four working parts, one loop.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Mic,
                title: "Browser voice",
                body: "Microphone capture with browser speech recognition, isolated behind an STT provider interface that can be swapped for server-side transcription.",
              },
              {
                icon: Bot,
                title: "Agent orchestrator",
                body: "Every turn runs a structured decision loop: extract fields, detect what is missing, choose the next action, then speak it aloud.",
              },
              {
                icon: Database,
                title: "Relational persistence",
                body: "Customers, calls, transcripts, agent states, event logs and AI summaries are all stored as queryable records — metrics computed live.",
              },
              {
                icon: ScrollText,
                title: "Call documentation",
                body: "When the call ends, the transcript is summarized into intent, requirements, budget and follow-up — ready for review in the dashboard.",
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
                className="studio-frame rounded-lg p-5 shadow-none"
              >
                <f.icon className="size-4 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">{f.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="border-b border-border/80 bg-secondary/40">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-16 sm:grid-cols-3">
          {[
            { icon: Gauge, stat: "9 fields", label: "structured per call" },
            { icon: Waves, stat: "8 s", label: "silence check-in window" },
            { icon: PhoneCall, stat: "0 repeats", label: "answered questions" },
          ].map((s) => (
            <div key={s.stat} className="flex items-center gap-4">
              <s.icon className="size-5 text-muted-foreground" />
              <div>
                <p className="text-xl font-semibold tracking-tight">{s.stat}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-md text-2xl font-semibold tracking-tight">
            Add a customer. Press start. Talk.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            The full loop — greeting, discovery, qualification, summary — runs live in your browser.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enter the studio
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>Aria Calling Studio</span>
          <span>Browser Voice Demo · simulated conversations</span>
        </div>
      </footer>
    </motion.div>
  );
}
