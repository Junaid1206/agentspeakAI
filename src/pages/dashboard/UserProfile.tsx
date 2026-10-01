import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Camera, Loader2, Save, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const INDUSTRIES = [
  ["healthcare", "Healthcare / Medical"],
  ["ecommerce", "E-commerce"],
  ["retail", "Retail"],
  ["real_estate", "Real estate"],
  ["hospitality", "Hotels / Hospitality"],
  ["education", "Education"],
  ["finance", "Finance / Insurance"],
  ["technology", "Technology / IT"],
  ["manufacturing", "Manufacturing"],
  ["professional_services", "Professional services / Agency"],
  ["other", "Other"],
];

const EMPTY = { name: "", company: "", jobTitle: "", industry: "", useCase: "", aiGoals: "", teamSize: "1–5", website: "" };

export default function UserProfile() {
  const { user } = useAuth();
  const saveProfile = useMutation(api.userProfiles.saveProfile);
  const generateImageUploadUrl = useMutation(api.userProfiles.generateProfileImageUploadUrl);
  const saveProfileImage = useMutation(api.userProfiles.saveProfileImage);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      name: user.name ?? current.name,
      company: user.company ?? user.organization ?? current.company,
      jobTitle: user.jobTitle ?? current.jobTitle,
      industry: user.industry ?? current.industry,
      useCase: user.useCase ?? user.aiUseCase ?? current.useCase,
      aiGoals: user.aiGoals ?? current.aiGoals,
      teamSize: user.teamSize ?? current.teamSize,
      website: user.website ?? current.website,
    }));
  }, [user]);

  const set = (key: keyof typeof EMPTY, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Choose a JPG, PNG, or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Profile photo must be 5 MB or smaller."); return; }
    setUploadingPhoto(true);
    try {
      const uploadUrl = await generateImageUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Image upload failed.");
      const { storageId } = await response.json();
      await saveProfileImage({ storageId });
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload profile photo.");
    } finally { setUploadingPhoto(false); }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveProfile({ ...form, website: form.website.trim() || undefined });
      toast.success("Your profile has been saved.");
      if (searchParams.get("setup") === "1") navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell active="/dashboard/profile" title="Your user profile" description="Tell AgentSpeak AI who you are, what field you work in, and what you want AI to do.">
      <div className="mx-auto max-w-3xl space-y-4">
        {searchParams.get("setup") === "1" && user?.profileCompleted !== true && (
          <Card className="border-primary/30 bg-primary/5 shadow-none">
            <CardContent className="p-4 text-sm">Complete this profile to continue to your workspace. Your answers are saved to your account.</CardContent>
          </Card>
        )}
        <Card className="studio-frame shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><UserRound className="size-5" /></div>
              <div><CardTitle>About you and your AI use</CardTitle><CardDescription>These details belong to your user account, not to an individual customer.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="mb-5 flex items-center gap-4 rounded-lg border p-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">{user?.image ? <img src={user.image} alt="Profile" className="size-full object-cover" /> : <UserRound className="size-7 text-muted-foreground" />}</div>
                <div className="min-w-0 flex-1 space-y-1"><p className="text-sm font-medium">Profile photo</p><p className="text-xs text-muted-foreground">JPG, PNG, or WebP · Max 5 MB</p><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">{uploadingPhoto ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{uploadingPhoto ? "Uploading…" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingPhoto} onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><label className="text-sm font-medium">Full name *</label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" maxLength={120} required /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Verified email</label><Input value={user?.email ?? "Not verified — sign in with email OTP"} disabled aria-label="Verified email" /><p className="text-xs text-muted-foreground">{user?.email ? "This is the email linked to your account." : "No verified email is linked to this session. Sign out, then sign in using your email and verification code."}</p></div>
                <div className="space-y-2"><label className="text-sm font-medium">Company / organization *</label><Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" maxLength={160} required /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Your role *</label><Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="Founder, Sales Manager, Doctor…" maxLength={120} required /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Industry *</label><select value={form.industry} onChange={(e) => set("industry", e.target.value)} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select your industry</option>{INDUSTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-2"><label className="text-sm font-medium">Team size *</label><select value={form.teamSize} onChange={(e) => set("teamSize", e.target.value)} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{["Just me","1–5","6–20","21–50","51–200","201–1000","1000+"].map((x) => <option key={x}>{x}</option>)}</select></div>
                <div className="space-y-2 sm:col-span-2"><label className="text-sm font-medium">Website (optional)</label><Input type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" maxLength={300} /></div>
                <div className="space-y-2 sm:col-span-2"><label className="text-sm font-medium">Why are you using AgentSpeak AI? *</label><textarea value={form.useCase} onChange={(e) => set("useCase", e.target.value)} placeholder="e.g. I want to automate appointment reminders and qualify inbound leads." maxLength={600} required rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                <div className="space-y-2 sm:col-span-2"><label className="text-sm font-medium">What should AI help you achieve? *</label><textarea value={form.aiGoals} onChange={(e) => set("aiGoals", e.target.value)} placeholder="e.g. Reduce manual calling, capture qualified enquiries, and schedule follow-ups." maxLength={800} required rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
              </div>
              <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Save profile</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
