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
import { LayoutGrid, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

interface CampaignForm {
  name: string;
  product: string;
  description: string;
  price_label: string;
  category: string;
  highlights: string;
}

const EMPTY: CampaignForm = {
  name: "",
  product: "",
  description: "",
  price_label: "",
  category: "",
  highlights: "",
};

export default function Catalog() {
  const [search, setSearch] = useState("");
  const campaignsResource = useApiResource(() => api.listCampaigns(search), [search]);
  const campaigns = campaignsResource.data;

  const createCampaign = async (body: Parameters<typeof api.createCampaign>[0]) =>
    api.createCampaign(body);
  const seedCampaigns = async () => api.seedCampaigns();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // First visit with an empty catalog materializes the default campaign rows.
  useEffect(() => {
    if (campaigns && campaigns.length === 0 && !search) {
      seedCampaigns()
        .then(() => campaignsResource.refresh())
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, search]);

  const submit = async () => {
    setSaving(true);
    try {
      const highlights = form.highlights
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean)
        .slice(0, 6);
      const priceMatch = form.price_label.match(/[\d,]+/);
      const price = priceMatch ? Number(priceMatch[0].replace(/,/g, "")) : 0;
      const campaign = await createCampaign({
        name: form.name,
        product: form.product || form.name,
        description: form.description || undefined,
        price,
        price_label: form.price_label || "Price on request",
        category: form.category || "General",
        highlights,
      });
      toast.success("Campaign added to the catalog.");
      setDialogOpen(false);
      setForm(EMPTY);
      navigate(`/dashboard/catalog/${campaign.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create campaign.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      active="/dashboard/catalog"
      title="Campaign Catalog"
      description="Outbound programs the AI agent calls about. Open a campaign to review its brief and launch calls."
      actions={
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New campaign
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns, products, categories…"
          className="bg-card pl-9"
        />
      </div>

      {campaignsResource.loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="studio-frame h-52 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {campaigns && campaigns.length === 0 && (
        <Card className="studio-frame shadow-none">
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <LayoutGrid className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No campaigns match</p>
            <p className="text-sm text-muted-foreground">
              Try a different search, or create a new campaign.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns?.map((c) => (
          <Card key={c.id} className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-muted-foreground">
                  {c.category}
                </Badge>
                {c.active ? null : (
                  <Badge variant="outline" className="border-amber-300/60 bg-amber-50 text-amber-800">
                    Paused
                  </Badge>
                )}
              </div>
              <Link to={`/dashboard/catalog/${c.id}`} className="mt-3 block">
                <p className="text-sm font-semibold hover:underline">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.product}</p>
              </Link>
              {c.description ? (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {c.description}
                </p>
              ) : null}
              <div className="studio-hairline mt-4 flex items-center justify-between pt-3">
                <span className="text-sm font-medium">{c.price_label}</span>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/dashboard/catalog/${c.id}`}>View</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              The agent uses this brief when speaking with customers about the product.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="c-name">Campaign name *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Commercial RO Outreach"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="c-category">Category</Label>
                <Input
                  id="c-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Water Treatment"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-price">Price label</Label>
                <Input
                  id="c-price"
                  value={form.price_label}
                  onChange={(e) => setForm({ ...form, price_label: e.target.value })}
                  placeholder="From ₹1,85,000"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-desc">Brief</Label>
              <Textarea
                id="c-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the agent should accomplish on these calls…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-highlights">Highlights (one per line)</Label>
              <Textarea
                id="c-highlights"
                rows={3}
                value={form.highlights}
                onChange={(e) => setForm({ ...form, highlights: e.target.value })}
                placeholder={"500–5000 LPH capacities\nInstallation + maintenance"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || form.name.trim().length < 3}>
              {saving ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
