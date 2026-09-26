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
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Pencil, PhoneCall, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

interface CustomerForm {
  name: string;
  phone_number: string;
  company_name: string;
  purpose: string;
  product: string;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone_number: "",
  company_name: "",
  purpose: "",
  product: "",
};

export default function Customers() {
  const customers = useQuery(api.customers.list) as
    | Array<{
        _id: string;
        name: string;
        phone_number: string;
        company_name?: string;
        purpose?: string;
        product?: string;
      }>
    | undefined;
  const allCalls = useQuery(api.calls.list);

  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const removeCustomer = useMutation(api.customers.remove);
  const createCall = useMutation(api.calls.create);
  const logEvent = useMutation(api.calls.logEvent);

  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [startingCall, setStartingCall] = useState<string | null>(null);

  const callCountFor = (customerId: string) =>
    allCalls?.filter((c) => c.customer_id === customerId).length ?? 0;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: { _id: string; name: string; phone_number: string; company_name?: string; purpose?: string; product?: string }) => {
    setEditingId(c._id as Id<"customers">);
    setForm({
      name: c.name,
      phone_number: c.phone_number,
      company_name: c.company_name ?? "",
      purpose: c.purpose ?? "",
      product: c.product ?? "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...form });
        toast.success("Customer updated.");
      } else {
        await createCustomer(form);
        toast.success("Customer added.");
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeCustomer({ id: deleteTarget.id as never });
      toast.success(`${deleteTarget.name} and all related calls were deleted.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const startCall = async (customerId: string) => {
    setStartingCall(customerId);
    try {
      const callId = await createCall({ customer_id: customerId as never, mode: "browser" });
      await logEvent({ call_id: callId, event: "call_initiated", detail: "Browser Voice Demo" });
      navigate(`/dashboard/calls/${callId}/live`);
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
      description="People the calling agent can reach in browser demo sessions."
      actions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add customer
        </Button>
      }
    >
      {!customers && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="studio-frame h-36 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {customers && customers.length === 0 && (
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

      {customers && customers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c._id} className="studio-frame shadow-none">
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
                      onClick={() => setDeleteTarget({ id: c._id, name: c.name })}
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
                    {callCountFor(c._id)} call{callCountFor(c._id) === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={startingCall !== null}
                    onClick={() => startCall(c._id)}
                  >
                    <PhoneCall className="size-3.5" />
                    {startingCall === c._id ? "Starting…" : "Start Call"}
                  </Button>
                </div>
                <Link
                  to={`/dashboard/calls?customer=${c._id}`}
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
              The agent uses the product and purpose to frame the conversation.
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
            <Button onClick={submit} disabled={saving || !form.name.trim() || !form.phone_number.trim()}>
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
              agent state. This cannot be undone.
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
