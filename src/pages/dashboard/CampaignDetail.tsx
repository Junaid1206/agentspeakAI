import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/AppShell";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api";
import { CalendarClock, Megaphone, PhoneCall } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { formatDate, formatDuration } from "@/lib/call-display";
import { toast } from "sonner";

export default function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const id = campaignId ? Number(campaignId) : null;

  const campaignResource = useApiResource(
    () => (id ? api.getCampaign(id).catch(() => null) : Promise.resolve(null)),
    [id],
  );
  const customersResource = useApiResource(() => api.listCustomers(), []);
  const callsResource = useApiResource(() => api.listCalls(), []);

  const campaign = campaignResource.data;
  const customers = customersResource.data;
  const calls = callsResource.data;

  const createCall = async (customer_id: number) => api.createCall(customer_id);
  const scheduleCall = async (body: Parameters<typeof api.scheduleCall>[0]) =>
    api.scheduleCall(body);

  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (campaignResource.loading) {
    return (
      <AppShell active="/dashboard/catalog" title="Campaign">
        <div className="studio-frame h-64 animate-pulse rounded-lg" />
      </AppShell>
    );
  }
  if (!campaign) {
    return (
      <AppShell active="/dashboard/catalog" title="Campaign not found">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/catalog">Back to catalog</Link>
        </Button>
      </AppShell>
    );
  }

  const relatedCalls = (calls ?? []).slice(0, 5);

  const launch = async () => {
    if (!customerId) {
      toast.error("Choose a customer first.");
      return;
    }
    setBusy(true);
    try {
      if (when === "now") {
        const call = await createCall(Number(customerId));
        navigate(`/dashboard/calls/${call.id}/live`);
      } else {
        if (!scheduledFor) {
          toast.error("Pick a date and time.");
          return;
        }
        await scheduleCall({
          customer_id: Number(customerId),
          campaign_id: campaign.id,
          scheduled_for: new Date(scheduledFor).toISOString(),
          notes: notes || undefined,
        });
        toast.success("Call scheduled.");
        navigate("/dashboard/schedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      active="/dashboard/catalog"
      title={campaign.name}
      description={`${campaign.category} · ${campaign.product}`}
      actions={
        <Badge variant="outline" className="px-3 py-1.5">
          {campaign.price_label}
        </Badge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="studio-frame shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-muted-foreground" />
                <p className="studio-label">Campaign brief</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed">
                {campaign.description ?? "No brief written for this campaign yet."}
              </p>
              {campaign.highlights.length > 0 && (
                <>
                  <p className="studio-label mt-6">Highlights</p>
                  <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
                    {campaign.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="studio-frame shadow-none">
            <CardContent className="p-5">
              <p className="studio-label">Recent calls</p>
              {callsResource.loading && (
                <div className="mt-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              )}
              {calls && relatedCalls.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No calls yet — launch the first one from the panel on the right.
                </p>
              )}
              <div className="mt-3 divide-y divide-border/60">
                {relatedCalls.map((call) => (
                  <Link
                    key={call.id}
                    to={`/dashboard/calls/${call.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:bg-accent/30"
                  >
                    <span className="font-medium">{call.customer?.name ?? "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(call.started_at)} · {formatDuration(call.duration_seconds)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="studio-frame h-fit shadow-none">
          <CardContent className="p-5">
            <p className="studio-label">Launch outreach</p>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer">Customer</Label>
                {!customers || customers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No customers yet —{" "}
                    <Link to="/dashboard/customers" className="underline">
                      add one first
                    </Link>
                    .
                  </p>
                ) : (
                  <select
                    id="customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.phone_number}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={when === "now" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWhen("now")}
                >
                  <PhoneCall className="size-3.5" />
                  Call now
                </Button>
                <Button
                  type="button"
                  variant={when === "later" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWhen("later")}
                >
                  <CalendarClock className="size-3.5" />
                  Schedule
                </Button>
              </div>

              {when === "later" && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="when">Date &amp; time</Label>
                    <Input
                      id="when"
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="notes">Notes for the agent (optional)</Label>
                    <Textarea
                      id="notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Customer asked to be called after 5 pm…"
                    />
                  </div>
                </>
              )}

              <Button onClick={launch} disabled={busy || !customerId}>
                {busy ? "Working…" : when === "now" ? "Open voice session" : "Book the call"}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Calls run in Browser Voice Demo mode — simulated conversations, not real phone
                calls.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
