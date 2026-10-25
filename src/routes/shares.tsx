import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Link as LinkIcon,
  Lock,
  ShieldOff,
  Trash2,
  Eye,
  Clock,
  Share2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listShares, revokeShare, deleteShare } from "@/lib/shares.functions";

export const Route = createFileRoute("/shares")({
  component: () => (
    <AppShell>
      <SharesPage />
    </AppShell>
  ),
});

function SharesPage() {
  const fetchAll = useServerFn(listShares);
  const revoke = useServerFn(revokeShare);
  const remove = useServerFn(deleteShare);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["shares"],
    queryFn: () => fetchAll(),
  });

  const revokeM = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shares"] });
      toast.success("Link revoked");
    },
  });
  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shares"] });
      toast.success("Link deleted");
    },
  });

  const now = Date.now();
  const active = data.filter((s) => !s.revoked && (!s.expires_at || new Date(s.expires_at).getTime() > now));
  const expired = data.filter((s) => s.revoked || (s.expires_at && new Date(s.expires_at).getTime() <= now));
  const totalViews = data.reduce((s, x) => s + x.view_count, 0);

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
    toast.success("Link copied");
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Badge className="mb-2 border-0 bg-primary/15 text-primary">
          <Share2 className="mr-1 h-3 w-3" /> Doctor portal
        </Badge>
        <h1 className="font-display text-3xl font-bold tracking-tight">Shared reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage secure links you've shared with doctors. Revoke any link at any time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<LinkIcon className="h-4 w-4" />} label="Active shares" value={active.length} />
        <Stat icon={<ShieldOff className="h-4 w-4" />} label="Expired / revoked" value={expired.length} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Total views" value={totalViews} />
      </div>

      <Section title="Active links" empty={active.length === 0 && !isLoading}>
        {active.map((s) => (
          <ShareRow
            key={s.id}
            row={s}
            onCopy={() => copy(s.token)}
            onRevoke={() => revokeM.mutate(s.id)}
            onDelete={() => removeM.mutate(s.id)}
          />
        ))}
      </Section>

      {expired.length > 0 && (
        <Section title="Expired or revoked">
          {expired.map((s) => (
            <ShareRow
              key={s.id}
              row={s}
              onCopy={() => copy(s.token)}
              onDelete={() => removeM.mutate(s.id)}
              dim
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="glass relative overflow-hidden p-5">
      <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-40" />
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p>
    </Card>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {empty ? (
        <Card className="glass p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No share links yet. Open a scan and click <strong>Share with doctor</strong>.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function ShareRow({
  row,
  onCopy,
  onRevoke,
  onDelete,
  dim,
}: {
  row: Awaited<ReturnType<typeof listShares>>[number];
  onCopy: () => void;
  onRevoke?: () => void;
  onDelete: () => void;
  dim?: boolean;
}) {
  const exp = row.expires_at
    ? new Date(row.expires_at).toLocaleString()
    : "Never expires";
  return (
    <Card className={`glass p-4 ${dim ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{row.title || row.share_type.toUpperCase()}</p>
            {row.has_password && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Lock className="h-3 w-3" /> Password
              </Badge>
            )}
            {row.revoked && (
              <Badge variant="destructive" className="text-xs">
                Revoked
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">/s/{row.token}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {exp}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {row.view_count} view{row.view_count === 1 ? "" : "s"}
            </span>
            {row.last_viewed_at && (
              <span>Last opened {new Date(row.last_viewed_at).toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" onClick={onCopy} title="Copy">
            <Copy className="h-4 w-4" />
          </Button>
          {onRevoke && (
            <Button size="icon" variant="ghost" onClick={onRevoke} title="Revoke">
              <ShieldOff className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
