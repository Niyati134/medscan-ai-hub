import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { checkInteractions, type InteractionSeverity } from "@/lib/scan.functions";
import { cn } from "@/lib/utils";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

const TONE: Record<InteractionSeverity, { cls: string; label: string; icon: React.ReactNode }> = {
  low: {
    cls: "border-success/40 bg-success/5 text-success",
    label: "Low risk",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  moderate: {
    cls: "border-warning/40 bg-warning/5 text-warning",
    label: "Moderate risk",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  high: {
    cls: "border-destructive/40 bg-destructive/5 text-destructive",
    label: "High risk",
    icon: <ShieldX className="h-4 w-4" />,
  },
};

export function InteractionPanel({ medicines }: { medicines: string[] }) {
  const fn = useServerFn(checkInteractions);
  const { data, isLoading, error } = useQuery({
    queryKey: ["interactions", medicines.sort().join("|")],
    queryFn: () => fn({ data: { medicines } }),
    enabled: medicines.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  if (medicines.length < 2) return null;

  if (isLoading) {
    return (
      <Card className="flex items-center gap-3 p-5 bg-gradient-card border-border/60">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Checking for drug interactions…</p>
      </Card>
    );
  }
  if (error || !data) return null;

  const tone = TONE[data.overallRisk];

  return (
    <Card className={cn("p-5 border bg-gradient-card shadow-card", tone.cls)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{tone.icon}</div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-foreground">Interaction check</h3>
            <Badge className={cn("border-0", tone.cls)}>{tone.label}</Badge>
          </div>
          {data.summary && (
            <p className="mt-1 text-sm text-foreground/80">{data.summary}</p>
          )}
          {data.interactions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No significant interactions detected between these medicines.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.interactions.map((i, idx) => {
                const t = TONE[i.severity];
                return (
                  <div
                    key={idx}
                    className={cn("rounded-xl border p-3 bg-background/60", t.cls)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border-0", t.cls)}>
                        <AlertTriangle className="mr-1 h-3 w-3" /> {t.label}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">
                        {i.medicines.join("  ×  ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground/80">{i.description}</p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium text-foreground">Recommendation: </span>
                      <span className="text-foreground/80">{i.recommendation}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <MedicalDisclaimer prominent />
      </div>
    </Card>
  );
}
