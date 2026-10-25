import { useState } from "react";
import {
  Pill,
  AlertTriangle,
  CheckCircle2,
  IndianRupee,
  ChevronDown,
  Clock,
  Repeat,
  CalendarDays,
  Utensils,
  ShieldAlert,
  Sparkles,
  Tag,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ParsedMedicine } from "@/lib/scan.functions";
import { SafetyBadges } from "@/components/SafetyBadges";

// Backwards-compat with old scans that only had {name, generic, dosage, uses, sideEffects, price, equivalents, confidence}
type AnyMed = Partial<ParsedMedicine> & {
  name: string;
  generic?: string;
  uses?: string[];
  sideEffects?: string[];
  equivalents?: { name: string; price: number }[];
};

function confidenceTone(c: number) {
  if (c >= 0.85) return { label: "High match", cls: "bg-success/15 text-success" };
  if (c >= 0.6) return { label: "Medium match", cls: "bg-warning/15 text-warning" };
  return { label: "Low match", cls: "bg-destructive/15 text-destructive" };
}

export function MedicineCard({ med }: { med: AnyMed }) {
  const [open, setOpen] = useState(false);
  const conf = med.confidence ?? 0.85;
  const tone = confidenceTone(conf);
  const cheapest = med.equivalents?.length
    ? Math.min(...med.equivalents.map((e) => e.price))
    : undefined;
  const savings = cheapest !== undefined && med.price ? Math.max(0, med.price - cheapest) : 0;

  return (
    <Card className="group overflow-hidden border-border/60 bg-gradient-card shadow-card transition-all hover:shadow-glow">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 p-5 text-left"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold leading-tight truncate">{med.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {med.generic || "—"}
              {med.category ? ` · ${med.category}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className={cn("border-0", tone.cls)}>
                {Math.round(conf * 100)}% · {tone.label}
              </Badge>
              {med.frequency && (
                <Badge variant="outline" className="font-normal">
                  <Repeat className="mr-1 h-3 w-3" /> {med.frequency}
                </Badge>
              )}
              {med.duration && (
                <Badge variant="outline" className="font-normal">
                  <CalendarDays className="mr-1 h-3 w-3" /> {med.duration}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 p-5 pt-4">
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="dosage">Dosage</TabsTrigger>
              <TabsTrigger value="side">Side effects</TabsTrigger>
              <TabsTrigger value="alts">Alternatives</TabsTrigger>
              <TabsTrigger value="ai">AI explain</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-3">
              <SafetyBadges med={med} />
              <Row icon={<Tag className="h-4 w-4" />} label="Category" value={med.category || "—"} />
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-success" /> Uses
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(med.uses ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No uses listed.</p>
                  )}
                  {med.uses?.map((u) => (
                    <Badge key={u} variant="outline" className="font-normal">
                      {u}
                    </Badge>
                  ))}
                </div>
              </div>
              {(med.precautions ?? []).length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ShieldAlert className="h-3 w-3 text-warning" /> Precautions
                  </p>
                  <ul className="space-y-1 text-sm">
                    {med.precautions!.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span className="text-warning">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dosage" className="mt-4 space-y-3">
              <Row icon={<Pill className="h-4 w-4" />} label="Dose" value={med.dosage || "—"} />
              <Row icon={<Clock className="h-4 w-4" />} label="Timing" value={med.timing || "—"} />
              <Row icon={<Repeat className="h-4 w-4" />} label="Frequency" value={med.frequency || "—"} />
              <Row icon={<CalendarDays className="h-4 w-4" />} label="Duration" value={med.duration || "—"} />
              {(med.foodInteractions ?? []).length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Utensils className="h-3 w-3" /> Food interactions
                  </p>
                  <ul className="space-y-1 text-sm">
                    {med.foodInteractions!.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-primary">•</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="side" className="mt-4">
              {(med.sideEffects ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No side effects reported.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {med.sideEffects!.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="alts" className="mt-4">
              <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</p>
                  <p className="flex items-center font-display text-lg font-bold text-primary">
                    <IndianRupee className="h-4 w-4" />
                    {(med.price ?? 0).toFixed(2)}
                  </p>
                </div>
                {savings > 0 && (
                  <Badge className="bg-success/15 text-success border-0">
                    Save ₹{savings.toFixed(2)}
                  </Badge>
                )}
              </div>
              {(med.equivalents ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No equivalents found.</p>
              ) : (
                <div className="space-y-2">
                  {med.equivalents!.map((e) => (
                    <div
                      key={e.name}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{e.name}</span>
                      <span className="text-primary font-semibold">₹{e.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" /> AI explanation
                </p>
                <p className="text-sm leading-relaxed">
                  {med.aiExplanation ||
                    "No additional AI explanation available for this medicine."}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Collapse
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
