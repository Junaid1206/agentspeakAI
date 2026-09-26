import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { CreditCard, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { formatDate } from "@/lib/call-display";
import { toast } from "sonner";

export default function Billing() {
  const packs = useQuery(api.billing.packs);
  const balance = useQuery(api.billing.myBalance) as
    | { credits: number; orders: Array<{ _id: string; pack_name: string; credits: number; amount_usd: number; status: string; provider: string; created_at: number }> }
    | undefined;
  const createCheckout = useAction(api.billing.createCheckout);
  const cancelOrder = useMutation(api.billing.cancelOrder);
  const [buying, setBuying] = useState<string | null>(null);
  const navigate = useNavigate();

  const buy = async (packKey: string) => {
    setBuying(packKey);
    try {
      const url = await createCheckout({ pack_key: packKey });
      // Full-page redirect: Stripe Checkout when configured, demo pay page otherwise.
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed.");
      setBuying(null);
    }
  };

  return (
    <AppShell
      active="/dashboard/billing"
      title="Billing & Credits"
      description="One credit equals one minute of agent calling time."
      actions={
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <ShieldCheck className="size-3.5" />
          {balance?.credits ?? 0} credits
        </Badge>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Checkout runs through Stripe when API keys are configured. In this environment no Stripe
          key is set, so purchases complete through a clearly-labelled simulated checkout — no card
          is charged and the order is marked as a demo transaction in your history.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {!packs &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="studio-frame h-56 animate-pulse rounded-lg" />
          ))}
        {packs?.map((p) => (
          <Card key={p.key} className="studio-frame flex flex-col shadow-none">
            <CardContent className="flex flex-1 flex-col p-6">
              <p className="studio-label">{p.name}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                ${p.amount_usd}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.credits} calling credits
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                ≈ {p.credits} minutes of two-way AI conversation, including transcription, agent
                reasoning and call documentation.
              </p>
              <Button
                className="mt-5"
                disabled={buying !== null}
                onClick={() => buy(p.key)}
              >
                <CreditCard className="size-4" />
                {buying === p.key ? "Opening checkout…" : "Buy credits"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="studio-frame mt-4 shadow-none">
        <CardContent className="p-5">
          <p className="studio-label">Order history</p>
          {!balance && (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}
          {balance && balance.orders.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No purchases yet — credit packs appear here once bought.
            </p>
          )}
          {balance && balance.orders.length > 0 && (
            <div className="mt-4 divide-y divide-border/60">
              {balance.orders.map((o) => (
                <div key={o._id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{o.pack_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.created_at)} · via {o.provider === "stripe" ? "Stripe" : "simulated checkout"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      +{o.credits} credits · ${o.amount_usd}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        o.status === "paid"
                          ? "border-emerald-300/60 bg-emerald-50 text-emerald-800"
                          : o.status === "simulated"
                            ? "border-amber-300/60 bg-amber-50 text-amber-800"
                            : "border-border bg-secondary text-muted-foreground"
                      }
                    >
                      {o.status === "paid" ? "Paid" : o.status === "simulated" ? "Demo purchase" : "Pending"}
                    </Badge>
                    {o.status === "pending" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={async () => {
                          await cancelOrder({ order_id: o._id as never });
                          toast.success("Order cancelled.");
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
