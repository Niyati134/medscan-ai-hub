import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  ChevronDown,
  Flame,
  Loader2,
  PhoneCall,
  Siren,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getHealthRisks } from "@/lib/scan.functions";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

const TONE = {
  low: "bg-success/15 text-success border-success/30",
  moderate: "bg-warning/15 text-warning border-warning/40",
  high: "bg-destructive/15 text-destructive border-destructive/30",
} as const;

export function HealthRisks({ medicines }: { medicines: string[] }) {
  const [open, setOpen] = useState(true);
  const fn = useServerFn(getHealthRisks);
  const { data, isLoading } = useQuery({
    queryKey: ["risks", medicines.sort().join("|")],
    queryFn: () => fn({ data: { medicines } }),
    enabled: medicines.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (!medicines.length) return null;

  return (
    <Card className="glass overflow-hidden shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">AI health risk analysis</h3>
            <p className="text-xs text-muted-foreground">
              Personalised review of your regimen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className={cn("border", TONE[data.overall])}>
              {data.overall} risk
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 p-5 pt-4">
          {isLoading || !data ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Analysing potential risks…
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Section
                title="Possible risks"
                icon={<Flame className="h-4 w-4" />}
                items={data.risks}
                tone="warning"
              />
              <Section
                title="Red flags to watch"
                icon={<AlertOctagon className="h-4 w-4" />}
                items={data.redFlags}
                tone="warning"
              />
              <Section
                title="Emergency symptoms"
                icon={<Siren className="h-4 w-4" />}
                items={data.emergencySymptoms}
                tone="destructive"
              />
              <Section
                title="When to call your doctor"
                icon={<PhoneCall className="h-4 w-4" />}
                items={data.whenToCallDoctor}
                tone="primary"
              />
            </div>
          )}
          {!isLoading && data && <MedicalDisclaimer prominent />}
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Collapse
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "warning" | "destructive" | "primary";
}) {
  const cls =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5 text-warning"
        : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div className={cn("rounded-xl border p-4", cls)}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
        {icon} {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-foreground/70">Nothing specific flagged.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-foreground/90">
          {items.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
