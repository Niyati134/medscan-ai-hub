import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IndianRupee,
  TrendingDown,
  Sparkles,
  ChevronDown,
  Pill,
  Factory,
  CheckCircle2,
  AlertTriangle,
  Tag,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPriceComparison,
  saveAlternativeSelection,
  type PriceComparison as PC,
  type PriceAlternative,
} from "@/lib/price.functions";
import { useMember } from "@/lib/useMember";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

export function PriceComparison({
  medicines,
  scanId,
}: {
  medicines: string[];
  scanId?: string;
}) {
  const fetchPrices = useServerFn(getPriceComparison);
  const saveSel = useServerFn(saveAlternativeSelection);
  const { activeMemberId } = useMember();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["price-comparison", medicines.sort().join("|")],
    queryFn: () => fetchPrices({ data: { medicines } }),
    enabled: medicines.length > 0,
    staleTime: 1000 * 60 * 60,
  });

  const select = useMutation({
    mutationFn: (vars: { item: PC; alt: PriceAlternative }) =>
      saveSel({
        data: {
          scanId,
          memberId: activeMemberId,
          originalName: vars.item.brandName,
          originalPrice: vars.item.marketPrice,
          alternativeName: vars.alt.name,
          alternativeManufacturer: vars.alt.manufacturer,
          alternativePrice: vars.alt.price,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Saved · ₹${r.savings.toFixed(2)} potential savings`);
      qc.invalidateQueries({ queryKey: ["savings-summary"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (medicines.length === 0) return null;

  if (isLoading) {
    return (
      <Card className="glass p-6 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-primary/10" />
          <div>
            <p className="text-sm font-medium">Comparing prices…</p>
            <p className="text-xs text-muted-foreground">Finding generic alternatives</p>
          </div>
        </div>
      </Card>
    );
  }

  const list = data ?? [];
  const totalOriginal = list.reduce((s, p) => s + p.marketPrice, 0);
  const totalCheapest = list.reduce((s, p) => {
    const min = p.alternatives.length
      ? Math.min(...p.alternatives.map((a) => a.price).filter((n) => n > 0))
      : p.marketPrice;
    return s + (Number.isFinite(min) ? min : p.marketPrice);
  }, 0);
  const totalSavings = Math.max(0, totalOriginal - totalCheapest);
  const monthly = totalSavings * 4;
  const yearly = totalSavings * 52;
  const opportunityCount = list.filter(
    (p) => p.alternatives.some((a) => a.price > 0 && a.price < p.marketPrice),
  ).length;

  return (
    <Card className="glass relative overflow-hidden p-6 shadow-card">
      <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-40" />
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
          <TrendingDown className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold">Price comparison & generic alternatives</h3>
          <p className="text-xs text-muted-foreground">
            AI-estimated INR retail prices. Always confirm with a licensed pharmacist.
          </p>
        </div>
      </div>

      {/* Savings KPIs */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SavingsKpi
          label="Original cost"
          value={`₹${totalOriginal.toFixed(2)}`}
          tone="muted"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <SavingsKpi
          label="Cheapest mix"
          value={`₹${totalCheapest.toFixed(2)}`}
          tone="primary"
          icon={<Pill className="h-4 w-4" />}
        />
        <SavingsKpi
          label="Per refill savings"
          value={`₹${totalSavings.toFixed(2)}`}
          tone="success"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <SavingsKpi
          label="Yearly potential"
          value={`₹${yearly.toFixed(0)}`}
          tone="success"
          icon={<Sparkles className="h-4 w-4" />}
          hint={`Monthly ≈ ₹${monthly.toFixed(0)}`}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className="bg-success/15 text-success border-0">
          {opportunityCount} substitution{opportunityCount === 1 ? "" : "s"} found
        </Badge>
        {totalSavings > 0 && totalOriginal > 0 && (
          <Badge variant="outline">
            Save {Math.round((totalSavings / totalOriginal) * 100)}% overall
          </Badge>
        )}
      </div>

      <Tabs defaultValue="cards" className="mt-5">
        <TabsList>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="table">Comparison table</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4 space-y-3">
          {list.map((p) => (
            <MedRow
              key={p.medicineKey}
              item={p}
              onSelect={(alt) => select.mutate({ item: p, alt })}
              busy={select.isPending}
            />
          ))}
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Generic</TableHead>
                  <TableHead className="text-right">Per strip</TableHead>
                  <TableHead className="text-right">Per tablet</TableHead>
                  <TableHead className="text-right">Cheapest alt</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const cheapest = p.alternatives
                    .filter((a) => a.price > 0)
                    .sort((a, b) => a.price - b.price)[0];
                  const save =
                    cheapest && p.marketPrice > 0
                      ? Math.round(
                          ((p.marketPrice - cheapest.price) / p.marketPrice) * 100,
                        )
                      : 0;
                  return (
                    <TableRow key={p.medicineKey}>
                      <TableCell className="font-medium">{p.brandName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.genericName || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{p.pricePerStrip.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{p.pricePerTablet.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {cheapest ? `₹${cheapest.price.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {save > 0 ? (
                          <Badge className="bg-success/15 text-success border-0">
                            -{save}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      <MedicalDisclaimer>
        AI-estimated prices and generic alternatives are indicative only. Confirm availability,
        pricing and substitution with your pharmacist or doctor.
      </MedicalDisclaimer>
    </Card>
  );
}

function MedRow({
  item,
  onSelect,
  busy,
}: {
  item: PC;
  onSelect: (a: PriceAlternative) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cheapest =
    item.alternatives.filter((a) => a.price > 0).sort((a, b) => a.price - b.price)[0];
  const savePct =
    cheapest && item.marketPrice > 0
      ? Math.round(((item.marketPrice - cheapest.price) / item.marketPrice) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-bold truncate">{item.brandName}</p>
            {item.manufacturer && (
              <Badge variant="outline" className="font-normal">
                <Factory className="mr-1 h-3 w-3" /> {item.manufacturer}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.genericName || "Generic unknown"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-md bg-muted/60 px-2 py-0.5">
              Strip ₹{item.pricePerStrip.toFixed(2)}
            </span>
            <span className="rounded-md bg-muted/60 px-2 py-0.5">
              Tablet ₹{item.pricePerTablet.toFixed(2)}
            </span>
            <span className="rounded-md bg-muted/60 px-2 py-0.5">
              Pack {item.packSize}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {savePct > 0 && (
            <Badge className="bg-success/15 text-success border-0">Save {savePct}%</Badge>
          )}
          <ChevronDown
            className={cn("h-5 w-5 text-muted-foreground transition", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 p-4">
          {item.alternatives.length === 0 ? (
            <p className="text-sm text-muted-foreground">No equivalent alternatives found.</p>
          ) : (
            <div className="space-y-2">
              {item.alternatives.map((a) => (
                <div
                  key={a.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    {a.manufacturer && (
                      <p className="truncate text-xs text-muted-foreground">{a.manufacturer}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-primary">
                      ₹{a.price.toFixed(2)}
                    </span>
                    {a.savingsPercent > 0 && (
                      <Badge className="bg-success/15 text-success border-0">
                        -{a.savingsPercent}%
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(a)}
                      disabled={busy}
                    >
                      Save choice
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {item.substitutionNotes && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <CheckCircle2 className="h-3 w-3" /> Why this works
              </p>
              {item.substitutionNotes}
            </div>
          )}
          {item.warnings && (
            <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
                <AlertTriangle className="h-3 w-3" /> Before switching
              </p>
              {item.warnings}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" /> AI estimates · verify with a pharmacist
          </div>
        </div>
      )}
    </div>
  );
}

function SavingsKpi({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "muted";
  icon: React.ReactNode;
  hint?: string;
}) {
  const toneCls =
    tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wider">{label}</span>
        <span className={toneCls}>{icon}</span>
      </div>
      <p className={cn("mt-1 font-display text-xl font-bold", toneCls)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
