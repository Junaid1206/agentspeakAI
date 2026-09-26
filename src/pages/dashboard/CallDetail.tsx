import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import {
  LEAD_LABELS,
  OUTCOME_LABELS,
  STATUS_LABELS,
  formatDate,
  formatDuration,
  leadClass,
  statusClass,
  titleCase,
} from "@/lib/call-display";
import { useQuery } from "convex/react";
import {
  Activity,
  Bot,
  CheckCheck,
  ListChecks,
  Mic,
  PhoneCall,
  ScrollText,
  Sparkles,
  User,
} from "lucide-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { api as apiRef } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Link, useParams } from "react-router";

export default function CallDetail() {
  const { callId } = useParams<{ callId: string }>();
  const call = useQuery(api.calls.get, callId ? { id: callId as never } : "skip");
  const transcript = useQuery(api.calls.transcript, callId ? { call_id: callId as never } : "skip");
  const summary = useQuery(api.calls.summary, callId ? { call_id: callId as never } : "skip");
  const agentState = useQuery(api.calls.agentState, callId ? { call_id: callId as never } : "skip");
  const events = useQuery(api.calls.events, callId ? { call_id: callId as never } : "skip");
  const comments = useQuery(
    apiRef.comments.listForCall,
    callId ? { call_id: callId as never } : "skip",
  ) as
    | Array<{ _id: string; author: string; body: string; created_at: number }>
    | undefined;
  const addComment = useMutation(apiRef.comments.add);

  if (call === undefined) {
    return (
      <AppShell active="/dashboard/calls" title="Call details">
        <div className="studio-frame h-64 animate-pulse rounded-lg" />
      </AppShell>
    );
  }

  if (call === null) {
    return (
      <AppShell active="/dashboard/calls" title="Call not found">
        <Card className="studio-frame shadow-none">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            This call does not exist.
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/calls">Back to call history</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const isActive = ["queued", "calling", "connected", "in_conversation"].includes(call.status);
  const collected = (agentState?.collected ?? {}) as Record<string, string | null>;
  const filledEntries = Object.entries(collected).filter(
    ([, v]) => typeof v === "string" && v.trim(),
  );
  const [commentDraft, setCommentDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const postComment = async () => {
    if (!commentDraft.trim() || !callId) return;
    setPosting(true);
    try {
      await addComment({
        customer_id: call.customer_id as never,
        call_id: callId as never,
        body: commentDraft,
      });
      toast.success("Note added.");
      setCommentDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the note.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <AppShell
      active="/dashboard/calls"
      title={`Call · ${call.customer?.name ?? "Unknown"}`}
      description={`Browser Voice Demo · ${formatDate(call.started_at)}`}
      actions={
        isActive ? (
          <Button asChild size="sm">
            <Link to={`/dashboard/calls/${callId}/live`}>
              <Mic className="size-4" />
              Open live console
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: transcript + summary */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ScrollText className="size-4 text-muted-foreground" />
                <p className="studio-label">Full transcript</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {transcript?.length ?? 0} entries
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {!transcript && (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                )}
                {transcript && transcript.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No conversation was recorded on this call.
                  </p>
                )}
                {transcript?.map((m) => (
                  <div
                    key={m._id}
                    className={
                      m.speaker === "customer"
                        ? "rounded-lg border border-border/60 bg-secondary/40 p-3"
                        : m.speaker === "ai"
                          ? "rounded-lg border border-border/60 bg-card p-3"
                          : "rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground"
                    }
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      {m.speaker === "ai" ? (
                        <Bot className="size-3.5 text-muted-foreground" />
                      ) : m.speaker === "customer" ? (
                        <User className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Activity className="size-3.5" />
                      )}
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {m.speaker === "ai" ? "Sam (AI)" : m.speaker === "customer" ? call.customer?.name ?? "Customer" : "System"}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatDate(m.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{m.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                <p className="studio-label">AI summary</p>
                {summary ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Generated {formatDate(summary.generated_at)}
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {isActive ? "Available after the call ends" : "Pending"}
                  </span>
                )}
              </div>
              {!summary && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {isActive
                    ? "The summary is generated from the actual transcript when the call ends."
                    : "No summary was generated for this call."}
                </p>
              )}
              {summary && (
                <>
                  <p className="mt-3 text-sm leading-relaxed">{summary.summary}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {[
                      ["Intent", summary.customer_intent],
                      ["Budget", summary.budget],
                      ["Timeline", summary.timeline],
                      ["Location", summary.location],
                      ["Application", summary.application],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right font-medium">{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {summary.key_requirements?.length > 0 && (
                    <div className="mt-4">
                      <p className="studio-label">Key requirements</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {summary.key_requirements.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: call info + agent state + events */}
        <div className="space-y-4">
          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <PhoneCall className="size-4 text-muted-foreground" />
                <p className="studio-label">Call information</p>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                {[
                  ["Customer", call.customer?.name ?? "—"],
                  ["Phone", call.customer?.phone_number ?? "—"],
                  ["Mode", call.mode === "browser" ? "Browser Voice Demo" : "Telephony"],
                  ["Status", STATUS_LABELS[call.status] ?? call.status],
                  ["Duration", formatDuration(call.duration_seconds)],
                  ["Outcome", OUTCOME_LABELS[call.outcome] ?? call.outcome],
                  ["Lead status", LEAD_LABELS[call.lead_status] ?? call.lead_status],
                  ["Follow-up", call.follow_up_required ? "Required" : "Not required"],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="studio-hairline mt-4 flex gap-2 pt-4">
                <Badge variant="outline" className={statusClass(call.status)}>
                  {STATUS_LABELS[call.status] ?? call.status}
                </Badge>
                <Badge variant="outline" className={leadClass(call.lead_status)}>
                  {LEAD_LABELS[call.lead_status] ?? call.lead_status}
                </Badge>
              </div>
              {call.error_message ? (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  {call.error_message}
                </p>
              ) : null}

              {/* Team notes on this call */}
              <div className="studio-hairline mt-5 pt-4">
                <p className="studio-label">Team notes</p>
                <div className="mt-3 space-y-2">
                  {comments?.length === 0 && (
                    <p className="text-xs text-muted-foreground">No notes on this call yet.</p>
                  )}
                  {comments?.map((c) => (
                    <div key={c._id} className="rounded-md border border-border/60 bg-secondary/40 p-2.5">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {c.author} · {formatDate(c.created_at)}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">{c.body}</p>
                    </div>
                  ))}
                  {!comments && (
                    <div className="h-8 animate-pulse rounded bg-muted" />
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Textarea
                    rows={2}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Add a note for the team about this call…"
                    className="bg-card text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={posting || !commentDraft.trim()}
                    onClick={postComment}
                  >
                    <Send className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-muted-foreground" />
                <p className="studio-label">Agent state</p>
                {agentState ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {agentState.stage} · turn {agentState.turn_count}
                  </span>
                ) : null}
              </div>
              {!agentState && (
                <p className="mt-4 text-sm text-muted-foreground">No agent state was recorded.</p>
              )}
              {agentState && filledEntries.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No requirements were collected yet.
                </p>
              )}
              {filledEntries.length > 0 && (
                <dl className="mt-4 space-y-2 text-sm">
                  {filledEntries.map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">{titleCase(k)}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <CheckCheck className="size-4 text-muted-foreground" />
                <p className="studio-label">Event log</p>
              </div>
              <div className="mt-3 space-y-1.5">
                {events && events.length === 0 && (
                  <p className="text-sm text-muted-foreground">No events recorded.</p>
                )}
                {events?.slice(0, 12).map((e) => (
                  <div key={e._id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium">{e.event}</span>
                    <span className="text-muted-foreground">{formatDate(e.created_at)}</span>
                  </div>
                ))}
                {!events && Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-muted" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
