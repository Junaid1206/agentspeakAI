import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router";

/**
 * The FastAPI billing flow completes simulated purchases inline on the Billing
 * page (orders are marked "Demo purchase" without a page redirect), while real
 * Stripe purchases redirect to Stripe's hosted checkout. This route remains for
 * backward compatibility with old links.
 */
export default function BillingCheckout() {
  return (
    <AppShell active="/dashboard/billing" title="Checkout">
      <Card className="studio-frame mx-auto max-w-md shadow-none">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Purchases are now handled directly on the billing page.
          <div className="mt-4">
            <Button asChild size="sm">
              <Link to="/dashboard/billing">Go to billing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
