import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Heart, AlertOctagon, Leaf, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getHealthInsights } from "@/lib/scan.functions";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

export function HealthInsights({ medicines }: { medicines: string[] }) {
  const fn = useServerFn(getHealthInsights);
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", medicines.sort().join("|")],
    queryFn: () => fn({ data: { medicines } }),
    enabled: medicines.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  if (medicines.length === 0) return null;

  if (isLoading) {
    return (
      <Card className="glass p-6 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> Generating AI health insights…
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </Card>
    );
  }
  if (error || !data) return null;

  const hasContent =
    data.summary || data.tips.length || data.redFlags.length || data.lifestyle.length;
  if (!hasContent) return null;

  return (
    <Card className="glass relative overflow-hidden p-6 shadow-card">
      <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-60" />
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <h3 className="font-display text-lg font-bold">AI health insights</h3>
      </div>

      {data.summary && (
        <p className="mb-4 text-sm leading-relaxed text-foreground/85">{data.summary}</p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {data.tips.length > 0 && (
          <Section icon={<Heart className="h-4 w-4 text-primary" />} title="Tips">
            {data.tips.map((t) => (
              <Li key={t}>{t}</Li>
            ))}
          </Section>
        )}
        {data.lifestyle.length > 0 && (
          <Section icon={<Leaf className="h-4 w-4 text-success" />} title="Lifestyle">
            {data.lifestyle.map((t) => (
              <Li key={t}>{t}</Li>
            ))}
          </Section>
        )}
        {data.redFlags.length > 0 && (
          <Section
            icon={<AlertOctagon className="h-4 w-4 text-destructive" />}
            title="See a doctor if"
          >
            {data.redFlags.map((t) => (
              <Li key={t}>{t}</Li>
            ))}
          </Section>
        )}
      </div>
      <MedicalDisclaimer />
    </Card>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      <ul className="space-y-1.5 text-sm">{children}</ul>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary">•</span>
      <span className="text-foreground/85">{children}</span>
    </li>
  );
}
