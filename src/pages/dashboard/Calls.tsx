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
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api";
import {
  LEAD_LABELS,
  OUTCOME_LABELS,
  STATUS_LABELS,
  formatDate,
  formatDuration,
  leadClass,
  statusClass,
} from "@/lib/call-display";
import { Filter, PhoneOutgoing } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

export default function Calls() {
  const callsResource = useApiResource(() => api.listCalls(), []);
  const customersResource = useApiResource(() => api.listCustomers(), []);
  const [searchParams] = useSearchParams();
  const customerFilter = searchParams.get("customer") ?? "all";

  const calls = callsResource.data;
  const customers = customersResource.data;

  const [status, setStatus] = useState("all");
  const [lead, setLead] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!calls) return [];
    return calls.filter((c) => {
      if (customerFilter !== "all" && String(c.customer_id) !== customerFilter) return false;
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
      description="Every call with outcome, lead status and follow-up state — filtered server data from PostgreSQL."
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
        <Select
          value={customerFilter}
          onValueChange={(v) => {
            const url = new URL(window.location.href);
            if (v === "all") url.searchParams.delete("customer");
            else url.searchParams.set("customer", v);
            window.history.replaceState(null, "", url.toString());
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          <SelectTrigger className="h-8 w-[170px] bg-card text-xs">
            <SelectValue placeholder="Customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
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
          {callsResource.loading && (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}

          {callsResource.error && (
            <div className="p-10 text-center text-sm text-destructive">{callsResource.error}</div>
          )}

          {calls && filtered.length === 0 && !callsResource.error && (
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
                    {[
                      "Customer",
                      "Phone",
                      "Date",
                      "Duration",
                      "Status",
                      "Outcome",
                      "Lead",
                      "Follow-up",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((call) => (
                    <tr
                      key={call.id}
                      className="border-b border-border/50 last:border-0 hover:bg-accent/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/dashboard/calls/${call.id}`}
                          className="font-medium hover:underline"
                        >
                          {call.customer?.name ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {call.customer?.phone_number}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(call.started_at)}
                      </td>
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
