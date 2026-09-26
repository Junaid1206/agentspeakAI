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
import { BookOpen, PenLine, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { formatDate } from "@/lib/call-display";
import { toast } from "sonner";

export default function Knowledge() {
  const [search, setSearch] = useState("");
  const posts = useQuery(api.knowledge.list, { search }) as
    | Array<{
        _id: string;
        title: string;
        summary?: string;
        author: string;
        published: boolean;
        created_at: number;
      }>
    | undefined;
  const createPost = useMutation(api.knowledge.create);
  const setPublished = useMutation(api.knowledge.setPublished);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await createPost({ title, body, summary: summary || undefined, publish: true });
      toast.success("Playbook published.");
      setOpen(false);
      setTitle("");
      setSummary("");
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      active="/dashboard/knowledge"
      title="Knowledge Base"
      description="Playbooks and scripts your team publishes — the reference layer behind the agent's conversations."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <PenLine className="size-4" />
          Write a post
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search playbooks…"
          className="bg-card pl-9"
        />
      </div>

      {!posts && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="studio-frame h-28 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {posts && posts.length === 0 && (
        <Card className="studio-frame shadow-none">
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <BookOpen className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              {search ? "No posts match your search" : "Nothing published yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try different keywords."
                : "Write the first playbook — objection handling, pricing scripts, qualification tips."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {posts?.map((p) => (
          <Card key={p._id} className="studio-frame shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-muted-foreground">
                  Playbook
                </Badge>
                {p.published ? null : (
                  <Badge variant="outline" className="border-amber-300/60 bg-amber-50 text-amber-800">
                    Draft
                  </Badge>
                )}
              </div>
              <Link to={`/dashboard/knowledge/${p._id}`} className="mt-3 block">
                <p className="text-sm font-semibold hover:underline">{p.title}</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {p.summary ?? ""}
                </p>
              </Link>
              <div className="studio-hairline mt-4 flex items-center justify-between pt-3 text-xs text-muted-foreground">
                <span>
                  {p.author} · {formatDate(p.created_at)}
                </span>
                {p.published ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={async () => {
                      await setPublished({ id: p._id as never, published: false });
                      toast.success("Moved to drafts.");
                    }}
                  >
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={async () => {
                      await setPublished({ id: p._id as never, published: true });
                      toast.success("Published.");
                    }}
                  >
                    Publish
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Write a playbook</DialogTitle>
            <DialogDescription>
              Short, practical guidance the team can reuse across campaigns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="k-title">Title</Label>
              <Input
                id="k-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Handling budget objections on first calls"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="k-summary">Summary</Label>
              <Input
                id="k-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line summary shown in the list"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="k-body">Body</Label>
              <Textarea
                id="k-body"
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the guidance in full…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving || title.trim().length < 4 || body.trim().length < 20}
            >
              {saving ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
