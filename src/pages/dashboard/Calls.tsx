import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/lib/call-display";
import { useQuery } from "convex/react";
import { Filter, PhoneOutgoing } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

type CallRow = {
  _id: string;
  status: string;
  outcome: string;
  lead_status: string;
  follow_up_required: boolean;
  started_at: number;
  duration_seconds?: number;
  customer_id: string;
  customer?: { name: string; phone_number: string } | null;
};

export default function Calls() {
  const calls = useQuery(api.calls.list) as CallRow[] | undefined;
  const [searchParams] = useSearchParams();
  const customerFilter = searchParams.get("customer") ?? "all";

  const [status, setStatus] = useState("all");
  const [lead, setLead] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!calls) return [];
    return calls.filter((c) => {
      if (customerFilter !== "all" && c.customer_id !== customerFilter) return false;
      if (status !== "all" && c.status !== status) return false;
      if (lead !== "all" && c.lead_status !== lead) return false;
      if (followUp === "required" && !c.follow_up_required) return false;
      if (followUp === "none" && c.follow_up_required) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = c.customer?.name?.toLowerCase() ?? "";
        const phone = c.customer?.phone_number ?? "";
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [calls, customerFilter, status, lead, followUp, search]);

  const resetFilters = () => {
    setStatus("all");
    setLead("all");
    setFollowUp("all");
    setSearch("");
  };

  return (
    <AppShell
      active="/dashboard/calls"
      title="Call History"
      description="Every call with outcome, lead status and follow-up state."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
          Filters
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[150px] bg-card text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={lead} onValueChange={setLead}>
          <SelectTrigger className="h-8 w-[150px] bg-card text-xs">
            <SelectValue placeholder="Lead status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leads</SelectItem>
            {Object.entries(LEAD_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={followUp} onValueChange={setFollowUp}>
          <SelectTrigger className="h-8 w-[170px] bg-card text-xs">
            <SelectValue placeholder="Follow-up" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any follow-up</SelectItem>
            <SelectItem value="required">Follow-up required</SelectItem>
            <SelectItem value="none">No follow-up</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or phone…"
          className="h-8 w-[210px] bg-card text-xs"
        />
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
          Reset
        </Button>
      </div>

      <Card className="studio-frame overflow-hidden shadow-none">
        <CardContent className="p-0">
          {!calls && (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}

          {calls && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <PhoneOutgoing className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No calls match these filters</p>
              <p className="text-sm text-muted-foreground">
                {calls.length === 0
                  ? "Start a call from a customer card to see it here."
                  : "Try resetting the filters."}
              </p>
              {calls.length === 0 ? (
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link to="/dashboard/customers">Go to customers</Link>
                </Button>
              ) : null}
            </div>
          )}

          {calls && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-secondary/50 text-left">
                    {["Customer", "Phone", "Date", "Duration", "Status", "Outcome", "Lead", "Follow-up"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((call) => (
                    <tr key={call._id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <Link
                          to={`/dashboard/calls/${call._id}`}
                          className="font-medium hover:underline"
                        >
                          {call.customer?.name ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{call.customer?.phone_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(call.started_at)}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusClass(call.status)}>
                          {STATUS_LABELS[call.status] ?? call.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={leadClass(call.lead_status)}>
                          {LEAD_LABELS[call.lead_status] ?? call.lead_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {call.follow_up_required ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
