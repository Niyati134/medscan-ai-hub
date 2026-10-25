import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sunrise, Sun, Sunset, Moon, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getAdherence,
  logMedicineTaken,
  type ParsedMedicine,
  type TimeSlot,
} from "@/lib/scan.functions";

const SLOTS: { key: TimeSlot; label: string; icon: React.ComponentType<{ className?: string }>; bg: string }[] = [
  { key: "morning", label: "Morning", icon: Sunrise, bg: "from-amber-500/20 to-orange-500/10" },
  { key: "afternoon", label: "Afternoon", icon: Sun, bg: "from-yellow-500/20 to-amber-500/10" },
  { key: "evening", label: "Evening", icon: Sunset, bg: "from-orange-500/20 to-rose-500/10" },
  { key: "night", label: "Night", icon: Moon, bg: "from-indigo-500/20 to-violet-500/10" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PrescriptionTimeline({
  scanId,
  medicines,
}: {
  scanId: string;
  medicines: ParsedMedicine[];
}) {
  const qc = useQueryClient();
  const fetchAd = useServerFn(getAdherence);
  const logFn = useServerFn(logMedicineTaken);
  const date = today();

  const { data } = useQuery({
    queryKey: ["adherence", scanId, date],
    queryFn: () => fetchAd({ data: { scanId, days: 1 } }),
  });

  const taken = useMemo(() => {
    const set = new Set<string>();
    (data?.logs ?? []).forEach((l) => {
      if (l.taken_on === date) set.add(`${l.medicine_id}|${l.slot}`);
    });
    return set;
  }, [data, date]);

  const mut = useMutation({
    mutationFn: (vars: { med: ParsedMedicine; slot: TimeSlot; nextTaken: boolean }) =>
      logFn({
        data: {
          scanId,
          medicineId: vars.med.id,
          medicineName: vars.med.name,
          slot: vars.slot,
          takenOn: date,
          taken: vars.nextTaken,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adherence"] }),
  });

  const grouped = useMemo(() => {
    const map: Record<TimeSlot, ParsedMedicine[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    medicines.forEach((m) => {
      (m.slots ?? []).forEach((s) => map[s].push(m));
    });
    return map;
  }, [medicines]);

  const totalDoses = SLOTS.reduce((s, slot) => s + grouped[slot.key].length, 0);
  const takenCount = SLOTS.reduce(
    (s, slot) =>
      s + grouped[slot.key].filter((m) => taken.has(`${m.id}|${slot.key}`)).length,
    0,
  );
  const pct = totalDoses === 0 ? 0 : Math.round((takenCount / totalDoses) * 100);

  if (totalDoses === 0) return null;

  return (
    <Card className="glass p-6 shadow-card">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">Today's schedule</h3>
          <p className="text-sm text-muted-foreground">
            Tap a medicine to mark it as taken.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Adherence</p>
          <p className="font-display text-2xl font-bold text-primary">{pct}%</p>
        </div>
      </div>

      <Progress value={pct} className="mb-6 h-2" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map((slot) => {
          const meds = grouped[slot.key];
          const Icon = slot.icon;
          return (
            <div
              key={slot.key}
              className={cn(
                "rounded-2xl border border-border/60 p-4 bg-gradient-to-br",
                slot.bg,
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 shadow-soft">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-semibold">{slot.label}</span>
                </div>
                <Badge variant="outline" className="bg-background/60 font-normal">
                  {meds.length}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {meds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No doses</p>
                ) : (
                  meds.map((m) => {
                    const key = `${m.id}|${slot.key}`;
                    const isTaken = taken.has(key);
                    const isLoading =
                      mut.isPending && mut.variables?.med.id === m.id && mut.variables?.slot === slot.key;
                    return (
                      <Button
                        key={key}
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          mut.mutate({ med: m, slot: slot.key, nextTaken: !isTaken })
                        }
                        className={cn(
                          "h-auto w-full justify-start gap-2 rounded-lg border border-transparent bg-background/60 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-background",
                          isTaken && "border-success/30 bg-success/10 text-success hover:bg-success/15",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            isTaken
                              ? "border-success bg-success text-success-foreground"
                              : "border-border",
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isTaken ? (
                            <Check className="h-3 w-3" />
                          ) : null}
                        </span>
                        <span className="truncate">{m.name}</span>
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
