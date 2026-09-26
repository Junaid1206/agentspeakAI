import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link, useParams } from "react-router";
import { formatDate } from "@/lib/call-display";

export default function KnowledgePost() {
  const { postId } = useParams<{ postId: string }>();
  const post = useQuery(api.knowledge.get, postId ? { id: postId as never } : "skip");

  if (post === undefined) {
    return (
      <AppShell active="/dashboard/knowledge" title="Post">
        <div className="studio-frame h-64 animate-pulse rounded-lg" />
      </AppShell>
    );
  }
  if (post === null) {
    return (
      <AppShell active="/dashboard/knowledge" title="Post not found">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/knowledge">Back to knowledge base</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="/dashboard/knowledge"
      title={post.title}
      description={`${post.author} · ${formatDate(post.created_at)}`}
    >
      <Card className="studio-frame shadow-none">
        <CardContent className="p-8">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <p className="studio-label">Playbook</p>
          </div>
          {post.summary ? (
            <p className="mt-4 border-l-2 border-border pl-4 text-sm italic leading-relaxed text-muted-foreground">
              {post.summary}
            </p>
          ) : null}
          <div className="mt-6 space-y-4">
            {post.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {para}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/knowledge">
            <ArrowLeft className="size-4" />
            All playbooks
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
