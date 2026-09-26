import { cn } from "@/lib/utils";

export const STATUS_STYLES: Record<string, string> = {
  queued: "border-border bg-secondary text-secondary-foreground",
  calling: "border-amber-300/60 bg-amber-50 text-amber-800",
  connected: "border-sky-300/60 bg-sky-50 text-sky-800",
  in_conversation: "border-emerald-300/60 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-300/60 bg-emerald-50 text-emerald-800",
  failed: "border-red-300/60 bg-red-50 text-red-800",
  no_answer: "border-orange-300/60 bg-orange-50 text-orange-800",
};

export const LEAD_STYLES: Record<string, string> = {
  new: "border-border bg-secondary text-secondary-foreground",
  interested: "border-emerald-300/60 bg-emerald-50 text-emerald-800",
  qualified: "border-teal-300/60 bg-teal-50 text-teal-800",
  not_interested: "border-red-200/60 bg-red-50 text-red-700",
  follow_up: "border-amber-300/60 bg-amber-50 text-amber-800",
};

export const OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending",
  interested: "Interested",
  not_interested: "Not interested",
  follow_up_required: "Follow-up required",
  information_collected: "Information collected",
  customer_unavailable: "Customer unavailable",
  customer_declined: "Customer declined",
  technical_failure: "Technical failure",
  completed: "Completed",
  failed: "Failed",
};

export const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  calling: "Calling",
  connected: "Connected",
  in_conversation: "In Conversation",
  completed: "Completed",
  failed: "Failed",
  no_answer: "No answer",
};

export const LEAD_LABELS: Record<string, string> = {
  new: "New",
  interested: "Interested",
  qualified: "Qualified",
  not_interested: "Not interested",
  follow_up: "Follow-up",
};

export function statusClass(status: string): string {
  return STATUS_STYLES[status] ?? STATUS_STYLES.queued;
}

export function leadClass(status: string): string {
  return LEAD_STYLES[status] ?? LEAD_STYLES.new;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function formatDate(ms?: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const statusChip = cn;
