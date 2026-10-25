import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  FileSearch,
  Pill,
  TrendingUp,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { listScans, type ParsedMedicine } from "@/lib/scan.functions";
import { getSavingsSummary } from "@/lib/price.functions";
import { useMember } from "@/lib/useMember";
import { IndianRupee, TrendingDown, Wallet } from "lucide-react";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <AppShell>
      <Analytics />
    </AppShell>
  ),
});

const COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

function Analytics() {
  const fetchScans = useServerFn(listScans);
  const { activeMemberId } = useMember();
  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["scans", activeMemberId],
    queryFn: () => fetchScans({ data: { memberId: activeMemberId } }),
  });
  const fetchSavings = useServerFn(getSavingsSummary);
  const { data: savings } = useQuery({
    queryKey: ["savings-summary", activeMemberId],
    queryFn: () => fetchSavings({ data: { memberId: activeMemberId } }),
  });

  const stats = useMemo(() => {
    const meds = (s: (typeof scans)[number]) =>
      (Array.isArray(s.medicines) ? (s.medicines as unknown as ParsedMedicine[]) : []);

    const total = scans.length;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = scans.filter((s) => new Date(s.created_at) >= monthStart).length;

    const allMeds = scans.flatMap(meds);
    const avgPer = total ? allMeds.length / total : 0;

    const medCount = new Map<string, number>();
    const catCount = new Map<string, number>();
    for (const m of allMeds) {
      const name = m.name?.split(/\s+/)[0] ?? "Unknown";
      medCount.set(name, (medCount.get(name) ?? 0) + 1);
      const c = m.category || "Other";
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
    }

    const topMeds = [...medCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const categories = [...catCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Most expensive medicines (by AI-estimated retail price)
    const priceMap = new Map<string, number>();
    const altOpps = new Set<string>();
    for (const m of allMeds) {
      const name = m.name ?? "Unknown";
      const p = Number(m.price) || 0;
      if (p > (priceMap.get(name) ?? 0)) priceMap.set(name, p);
      if (Array.isArray(m.equivalents) && m.equivalents.some((e) => (e.price || 0) > 0 && (e.price || 0) < p)) {
        altOpps.add(name);
      }
    }
    const expensiveMeds = [...priceMap.entries()]
      .filter(([, p]) => p > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, price]) => ({ name, price }));

    // Scans over last 6 months
    const monthly = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.set(d.toLocaleString(undefined, { month: "short", year: "2-digit" }), 0);
    }
    for (const s of scans) {
      const d = new Date(s.created_at);
      const key = d.toLocaleString(undefined, { month: "short", year: "2-digit" });
      if (monthly.has(key)) monthly.set(key, (monthly.get(key) ?? 0) + 1);
    }
    const overTime = [...monthly.entries()].map(([month, count]) => ({ month, count }));

    return {
      total,
      thisMonth,
      avgPer,
      totalMeds: allMeds.length,
      topMeds,
      categories,
      overTime,
      expensiveMeds,
      altOppCount: altOpps.size,
      recent: scans.slice(0, 6),
    };
  }, [scans]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading analytics…</div>;
  }

  if (scans.length === 0) {
    return (
      <Card className="glass p-10 text-center">
        <Activity className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No scan data yet.{" "}
          <Link to="/upload" className="text-primary hover:underline">
            Upload a prescription
          </Link>{" "}
          to see analytics.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Health analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Insights from your prescription history.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={FileSearch} label="Total scans" value={String(stats.total)} />
        <Kpi icon={Calendar} label="This month" value={String(stats.thisMonth)} />
        <Kpi icon={Pill} label="Medicines tracked" value={String(stats.totalMeds)} />
        <Kpi icon={TrendingUp} label="Avg / scan" value={stats.avgPer.toFixed(1)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={Wallet}
          label="Total money saved"
          value={`₹${(savings?.totalSaved ?? 0).toFixed(2)}`}
        />
        <Kpi
          icon={TrendingDown}
          label="Generic opportunities"
          value={String(stats.altOppCount)}
        />
        <Kpi
          icon={IndianRupee}
          label="Switches recorded"
          value={String(savings?.count ?? 0)}
        />
      </div>

      {stats.expensiveMeds.length > 0 && (
        <Card className="glass p-6 shadow-card">
          <h3 className="font-display text-lg font-bold">Most expensive medicines</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Highest AI-estimated retail price across your scans
          </p>
          <div className="space-y-2">
            {stats.expensiveMeds.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{m.name}</span>
                <span className="font-display font-bold text-primary">
                  ₹{m.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass p-6 shadow-card">
          <h3 className="font-display text-lg font-bold">Scans over time</h3>
          <p className="mb-4 text-xs text-muted-foreground">Last 6 months</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.overTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ fill: "#2563eb", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glass p-6 shadow-card">
          <h3 className="font-display text-lg font-bold">Category distribution</h3>
          <p className="mb-4 text-xs text-muted-foreground">Across all medicines</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categories}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => e.name}
                  labelLine={false}
                >
                  {stats.categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="glass p-6 shadow-card">
        <h3 className="font-display text-lg font-bold">Top medicines</h3>
        <p className="mb-4 text-xs text-muted-foreground">Most frequently prescribed</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topMeds}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="glass p-6 shadow-card">
        <h3 className="font-display text-lg font-bold">Recent activity</h3>
        <div className="mt-4 space-y-2">
          {stats.recent.map((s) => (
            <Link
              key={s.id}
              to="/results"
              search={{ id: s.id }}
              className="flex items-center justify-between rounded-xl border border-transparent p-3 transition hover:border-border hover:bg-muted/40"
            >
              <div>
                <p className="text-sm font-medium">{s.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
              <Badge variant="outline">
                {Array.isArray(s.medicines) ? s.medicines.length : 0} meds
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="glass p-6 shadow-card">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <p className="text-xs text-muted-foreground">
            Analytics are derived from your scan history. Consult a doctor before changing any
            medication.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="glass relative overflow-hidden p-5 shadow-card">
      <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-40" />
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </Card>
  );
}
