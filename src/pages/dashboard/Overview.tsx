import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import {
  LEAD_LABELS,
  formatDate,
  formatDuration,
  leadClass,
  statusClass,
  STATUS_LABELS,
} from "@/lib/call-display";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api";
import { ArrowUpRight, Clock, PhoneCall, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

export default function Overview() {
  const statsResource = useApiResource(() => api.stats(), []);
  const callsResource = useApiResource(() => api.listCalls(), []);
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  const stats = statsResource.data;
  const calls = callsResource.data;

  const metrics = [
    { label: "Total Calls", value: stats?.total_calls ?? 0 },
    { label: "Completed", value: stats?.completed_calls ?? 0 },
    { label: "Failed", value: stats?.failed_calls ?? 0 },
    { label: "Interested Leads", value: stats?.interested_leads ?? 0 },
    { label: "Follow-ups Required", value: stats?.follow_ups_required ?? 0 },
    { label: "Avg. Duration", value: formatDuration(stats?.avg_duration_seconds) },
  ];

  const startFirstCall = async () => {
    const customers = await api.listCustomers();
    if (customers.length === 0) {
      toast.error("Add a customer first, then start a call from their card.");
      navigate("/dashboard/customers");
      return;
    }
    setStarting(true);
    try {
      const call = await api.createCall(customers[0].id);
      navigate(`/dashboard/calls/${call.id}/live`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the call.");
    } finally {
      setStarting(false);
    }
  };

  const hasBackendError = statsResource.error || callsResource.error;

  return (
    <AppShell
      active="/dashboard"
      title="Overview"
      description="Live operational metrics computed from PostgreSQL by the FastAPI backend."
      actions={
        <Button variant="outline" size="sm" onClick={startFirstCall} disabled={starting}>
          <PhoneCall className="size-4" />
          {starting ? "Starting…" : "Quick start a call"}
        </Button>
      }
    >
      {hasBackendError ? (
        <Card className="mb-4 border-destructive/40 bg-destructive/5 shadow-none">
          <CardContent className="flex flex-col gap-2 p-5 text-sm">
            <p className="font-medium text-destructive">API unavailable</p>
            <p className="text-muted-foreground">
              {statsResource.error ?? callsResource.error} — start the backend with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                uvicorn main:app --port 8000
              </code>{" "}
              from the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/backend</code>{" "}
              folder, then refresh.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <Card key={m.label} className="studio-frame shadow-none">
            <CardContent className="p-4">
              <p className="studio-label">{m.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="studio-frame shadow-none lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="studio-label">Recent calls</p>
              <Link
                to="/dashboard/calls"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                All calls <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="mt-4 divide-y divide-border/60">
              {callsResource.loading && (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading calls…</p>
              )}
              {calls && calls.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No calls yet — add a customer and start your first call.
                </p>
              )}
              {calls?.slice(0, 6).map((call) => (
                <Link
                  key={call.id}
                  to={`/dashboard/calls/${call.id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {call.customer?.name ?? "Unknown customer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(call.started_at)} · {formatDuration(call.duration_seconds)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={statusClass(call.status)}>
                      {STATUS_LABELS[call.status] ?? call.status}
                    </Badge>
                    <Badge variant="outline" className={leadClass(call.lead_status)}>
                      {LEAD_LABELS[call.lead_status] ?? call.lead_status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="studio-frame shadow-none">
          <CardContent className="p-5">
            <p className="studio-label">Calls by status</p>
            <div className="mt-4 space-y-2.5">
              {stats
                ? Object.entries(stats.calls_by_status).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{STATUS_LABELS[key] ?? key}</span>
                      <span className="font-medium tabular-nums">{value}</span>
                    </div>
                  ))
                : Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-5 animate-pulse rounded bg-muted" />
                  ))}
            </div>
            <div className="studio-hairline mt-5 space-y-2.5 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-3.5" /> Avg. duration
                </span>
                <span className="font-medium tabular-nums">
                  {formatDuration(stats?.avg_duration_seconds)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-3.5" /> Customers
                </span>
                <span className="font-medium tabular-nums">{stats?.total_customers ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
