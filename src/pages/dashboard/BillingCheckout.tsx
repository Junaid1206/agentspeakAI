import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { CreditCard, Lock, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

export default function BillingCheckout() {
  const { orderId } = useParams<{ orderId: string }>();
  const order = useQuery(api.billing.getOrder, orderId ? { order_id: orderId as never } : "skip");
  const complete = useMutation(api.billing.completeSimulated);
  const cancelOrder = useMutation(api.billing.cancelOrder);
  const navigate = useNavigate();

  // If the order vanished (already handled / cancelled), bounce back.
  useEffect(() => {
    if (order === null) navigate("/dashboard/billing", { replace: true });
  }, [order, navigate]);

  if (!order) {
    return (
      <AppShell active="/dashboard/billing" title="Checkout">
        <div className="studio-frame h-64 animate-pulse rounded-lg" />
      </AppShell>
    );
  }

  const pay = async () => {
    try {
      await complete({ order_id: order._id as never });
      toast.success("Demo purchase complete — credits added.");
      navigate("/dashboard/billing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed.");
    }
  };

  const abort = async () => {
    await cancelOrder({ order_id: order._id as never });
    navigate("/dashboard/billing");
  };

  return (
    <AppShell active="/dashboard/billing" title="Checkout">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>
            <strong>Simulated checkout.</strong> No Stripe key is configured in this environment, so
            this page demonstrates the payment flow without charging anything. Configure Stripe keys
            to route this step through real Stripe Checkout automatically.
          </p>
        </div>

        <Card className="studio-frame shadow-none">
          <CardContent className="p-6">
            <p className="studio-label">Order summary</p>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{order.pack_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Calling credits</span>
                <span className="font-medium tabular-nums">+{order.credits}</span>
              </div>
              <div className="studio-hairline flex justify-between pt-3 text-base">
                <span className="font-medium">Total due</span>
                <span className="font-semibold tabular-nums">${order.amount_usd}.00</span>
              </div>
            </div>
            <Button className="mt-6 w-full" size="lg" onClick={pay}>
              <Lock className="size-4" />
              Pay ${order.amount_usd}.00 (demo)
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={abort}>
              Cancel order
            </Button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <CreditCard className="size-3.5" />
              Real card payments are handled by Stripe Checkout once keys are configured.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
