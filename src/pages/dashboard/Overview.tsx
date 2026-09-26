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
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowUpRight, Clock, PhoneCall, Users } from "lucide-react";
import { Link } from "react-router";

export default function Overview() {
  const stats = useQuery(api.dashboard.stats);
  const calls = useQuery(api.calls.list);

  const metrics = [
    { label: "Total Calls", value: stats?.total_calls ?? 0 },
    { label: "Completed", value: stats?.completed_calls ?? 0 },
    { label: "Failed", value: stats?.failed_calls ?? 0 },
    { label: "Interested Leads", value: stats?.interested_leads ?? 0 },
    { label: "Follow-ups Required", value: stats?.follow_ups_required ?? 0 },
    { label: "Avg. Duration", value: formatDuration(stats?.avg_duration_seconds) },
  ];

  const statusCounts = stats?.calls_by_status;

  return (
    <AppShell
      active="/dashboard"
      title="Overview"
      description="Live operational metrics computed from the database."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/customers">
            <Users className="size-4" />
            Customers
          </Link>
        </Button>
      }
    >
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
              {!calls && (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading calls…</p>
              )}
              {calls && calls.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No calls yet — add a customer and start your first call.
                </p>
              )}
              {calls?.slice(0, 6).map((call) => (
                <Link
                  key={call._id}
                  to={`/dashboard/calls/${call._id}`}
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
              {statusCounts
                ? Object.entries(statusCounts).map(([key, value]) => (
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
                  <PhoneCall className="size-3.5" /> Customers
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
