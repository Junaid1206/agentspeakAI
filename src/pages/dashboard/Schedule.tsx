import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/AppShell";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/call-display";
import { toast } from "sonner";

export default function Schedule() {
  const slotsResource = useApiResource(() => api.listSchedule(), []);
  const customersResource = useApiResource(() => api.listCustomers(), []);
  const campaignsResource = useApiResource(() => api.listCampaigns(), []);

  const slots = slotsResource.data;
  const customers = customersResource.data;
  const campaigns = campaignsResource.data;

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!customerId || !when) {
      toast.error("Choose a customer and a time.");
      return;
    }
    setSaving(true);
    try {
      await api.scheduleCall({
        customer_id: Number(customerId),
        campaign_id: campaignId ? Number(campaignId) : undefined,
        scheduled_for: new Date(when).toISOString(),
        notes: notes || undefined,
      });
      toast.success("Call booked.");
      setOpen(false);
      setCustomerId("");
      setCampaignId("");
      setWhen("");
      setNotes("");
      slotsResource.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not book the call.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id: number) => {
    try {
      await api.cancelSchedule(id);
      toast.success("Scheduled call cancelled.");
      slotsResource.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel.");
    }
  };

  const now = Date.now();
  const upcoming = (slots ?? []).filter(
    (s) => s.status === "scheduled" && new Date(s.scheduled_for).getTime() >= now,
  );
  const past = (slots ?? []).filter(
    (s) => s.status !== "scheduled" || new Date(s.scheduled_for).getTime() < now,
  );

  return (
    <AppShell
      active="/dashboard/schedule"
      title="Call Schedule"
      description="Pre-book agent call slots with campaign context and notes for the agent."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus className="size-4" />
          Book a call
        </Button>
      }
    >
      <Card className="studio-frame shadow-none">
        <CardContent className="p-5">
          <p className="studio-label">Upcoming</p>
          {slotsResource.loading && (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}
          {slots && upcoming.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing booked yet — schedule a call from here or from any campaign.
            </p>
          )}
          <div className="mt-3 divide-y divide-border/60">
            {upcoming.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md border border-border/80 bg-secondary">
                    <CalendarClock className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {s.customer?.name ?? `Customer #${s.customer_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.scheduled_for)}
                      {s.campaign_name ? ` · ${s.campaign_name}` : ""}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => cancel(s.id)}
                >
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card className="studio-frame mt-4 shadow-none">
          <CardContent className="p-5">
            <p className="studio-label">Past &amp; cancelled</p>
            <div className="mt-3 divide-y divide-border/60">
              {past.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    {s.customer?.name ?? `Customer #${s.customer_id}`}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {formatDate(s.scheduled_for)}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      s.status === "cancelled"
                        ? "border-red-200/60 bg-red-50 text-red-700"
                        : "border-border bg-secondary text-muted-foreground"
                    }
                  >
                    {s.status === "cancelled" ? "Cancelled" : "Past"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book an agent call</DialogTitle>
            <DialogDescription>
              The agent will use the campaign brief and your notes during the conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Customer</Label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Select a customer…</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone_number}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Campaign (optional)</Label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">No specific campaign</option>
                {campaigns?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-when">Date &amp; time</Label>
              <Input
                id="s-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-notes">Notes for the agent</Label>
              <Textarea
                id="s-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the agent should know before dialing…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !customerId || !when}>
              {saving ? "Booking…" : "Book call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
