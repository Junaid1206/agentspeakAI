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
import { api, type Customer } from "@/lib/api";\nimport { useAuth } from "@/hooks/use-auth";
import { Pencil, PhoneCall, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

interface CustomerForm {
  name: string;
  phone_number: string;
  company_name: string;
  purpose: string;
  product: string;
  industry: string;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone_number: "",
  company_name: "",
  purpose: "",
  product: "",
  industry: "general",
};

export default function Customers() {
  const { user } = useAuth();\n  const [search, setSearch] = useState("");
  const customersResource = useApiResource(() => api.listCustomers(search), [search]);
  const callsResource = useApiResource(() => api.listCalls(), []);\n  const configResource = useApiResource(() => api.configStatus(), []);

  const customers = customersResource.data;
  const allCalls = callsResource.data;

  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [startingCall, setStartingCall] = useState<number | null>(null);

  const callCountFor = (customerId: number) =>
    allCalls?.filter((c) => c.customer_id === customerId).length ?? 0;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone_number: c.phone_number,
      company_name: c.company_name ?? "",
      purpose: c.purpose ?? "",
      product: c.product ?? "",
      industry: c.industry ?? "general",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.updateCustomer(editingId, form);
        toast.success("Customer updated.");
      } else {
        await api.createCustomer(form);
        toast.success("Customer added.");
      }
      setDialogOpen(false);
      customersResource.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteCustomer(deleteTarget.id);
      toast.success(`${deleteTarget.name} and all related calls were deleted.`);
      customersResource.refresh();
      callsResource.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const startCall = async (customerId: number) => {
    setStartingCall(customerId);
    try {
      const mode = configResource.data?.call_mode === "telephony" ? "telephony" : "browser";
      if (mode === "telephony" && !user?.callingPhoneNumber) {
        throw new Error("Add your calling phone number in My Profile before starting a real AI phone call.");
      }
      const call = await api.createCall(customerId, mode, user?.callingPhoneNumber);
      navigate(`/dashboard/calls/${call.id}/live`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the call.");
    } finally {
      setStartingCall(null);
    }
  };

  return (
    <AppShell
      active="/dashboard/customers"
      title="Customers"
      description="Contacts the AI agent reaches in browser demo sessions. Stored in PostgreSQL via FastAPI."
      actions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add customer
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone or company…"
          className="bg-card pl-9"
        />
      </div>

      {customersResource.loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="studio-frame h-36 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {customers && customers.length === 0 && !search && (
        <Card className="studio-frame shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-11 items-center justify-center rounded-full border border-border/80 bg-secondary">
              <UserPlus className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No customers yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first customer, then press Start Call to open a Browser Voice Demo session
              with the AI agent.
            </p>
            <Button size="sm" onClick={openCreate} className="mt-2">
              <Plus className="size-4" />
              Add customer
            </Button>
          </CardContent>
        </Card>
      )}

      {customers && customers.length === 0 && search && (
        <Card className="studio-frame shadow-none">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No customers match “{search}”.
          </CardContent>
        </Card>
      )}

      {customers && customers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c.id} className="studio-frame shadow-none">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone_number}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.company_name ? <p>Company · {c.company_name}</p> : null}
                  {c.product ? <p>Product · {c.product}</p> : null}
                  {c.purpose ? <p className="line-clamp-2">Purpose · {c.purpose}</p> : null}
                </div>
                <div className="studio-hairline mt-4 flex items-center justify-between pt-3">
                  <Badge variant="outline" className="text-muted-foreground">
                    {callCountFor(c.id)} call{callCountFor(c.id) === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={startingCall !== null}
                    onClick={() => startCall(c.id)}
                  >
                    <PhoneCall className="size-3.5" />
                    {startingCall === c.id ? "Starting…" : "Start Call"}
                  </Button>
                </div>
                <Link
                  to={`/dashboard/calls?customer=${c.id}`}
                  className="mt-3 block text-xs text-muted-foreground hover:text-foreground"
                >
                  View call history →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>
              Phone numbers are validated server-side (8–15 digits). The agent uses the product and
              purpose to frame the conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rahul Kumar"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number *</Label>
              <Input
                id="phone"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder="+919876543210"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Grand Lotus Hotels"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="industry">Industry *</Label>
              <select id="industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="general">General enquiry</option><option value="water_treatment">Water treatment / RO</option><option value="medical">Medical / healthcare</option><option value="shopping">Shopping / e-commerce</option><option value="business">Business / B2B</option><option value="support">Customer support</option>
              </select>
              <p className="text-xs text-muted-foreground">AI will adapt its call questions to this industry.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product">Product</Label>
              <Input
                id="product"
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
                placeholder="Commercial RO system"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                rows={2}
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Inbound enquiry about water treatment for a hotel property"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving || !form.name.trim() || !form.phone_number.trim()}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the customer and every related call, transcript, summary and
              agent state (database cascade). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
