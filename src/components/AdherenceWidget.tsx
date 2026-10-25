import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdherence, listScans, type ParsedMedicine } from "@/lib/scan.functions";

export function AdherenceWidget() {
  const fetchAd = useServerFn(getAdherence);
  const fetchScans = useServerFn(listScans);
  const { data: adh } = useQuery({
    queryKey: ["adherence-7"],
    queryFn: () => fetchAd({ data: { days: 7 } }),
  });
  const { data: scans } = useQuery({ queryKey: ["scans"], queryFn: () => fetchScans() });

  const { weeklyPct, days } = useMemo(() => {
    const meds = (scans ?? []).flatMap((s) =>
      ((s.medicines as unknown as ParsedMedicine[]) ?? []).flatMap((m) =>
        (m.slots ?? []).map(() => 1),
      ),
    );
    const dailyDoses = meds.length; // expected doses per day across all active scans
    const dayBuckets: { date: string; taken: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = (adh?.logs ?? []).filter((l) => l.taken_on === key).length;
      dayBuckets.push({ date: key, taken: count });
    }
    const totalExpected = dailyDoses * 7;
    const totalTaken = dayBuckets.reduce((s, d) => s + d.taken, 0);
    const pct = totalExpected === 0 ? 0 : Math.min(100, Math.round((totalTaken / totalExpected) * 100));
    return { weeklyPct: pct, days: dayBuckets };
  }, [adh, scans]);

  const maxTaken = Math.max(1, ...days.map((d) => d.taken));

  return (
    <Card className="glass p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display font-bold">Weekly adherence</h3>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </div>
        </div>
        <p className="font-display text-2xl font-bold text-primary">{weeklyPct}%</p>
      </div>
      <Progress value={weeklyPct} className="mt-4 h-2" />
      <div className="mt-4 flex h-16 items-end justify-between gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-md bg-gradient-primary transition-all"
              style={{ height: `${(d.taken / maxTaken) * 100}%`, minHeight: 4 }}
              title={`${d.date}: ${d.taken} doses`}
            />
            <span className="text-[10px] text-muted-foreground">
              {new Date(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
