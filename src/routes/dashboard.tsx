import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Activity, ArrowUpRight, FileSearch, MapPin, Pill, TrendingUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listScans, type ParsedMedicine } from "@/lib/scan.functions";
import { useAuth } from "@/lib/useAuth";
import { AdherenceWidget } from "@/components/AdherenceWidget";
import { useMember } from "@/lib/useMember";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const { user } = useAuth();
  const { activeMemberId } = useMember();
  const fetchScans = useServerFn(listScans);
  const { data: scans = [] } = useQuery({
    queryKey: ["scans", activeMemberId],
    queryFn: () => fetchScans({ data: { memberId: activeMemberId } }),
  });

  const meds = (s: typeof scans[number]) =>
    (Array.isArray(s.medicines) ? (s.medicines as unknown as ParsedMedicine[]) : []);

  const totalScans = scans.length;
  const totalMeds = scans.reduce((sum, s) => sum + meds(s).length, 0);
  const avgConfidence = (() => {
    const all = scans.flatMap((s) => meds(s).map((m) => m.confidence ?? 0));
    if (!all.length) return 0;
    return (all.reduce((a, b) => a + b, 0) / all.length) * 100;
  })();
  const totalCost = scans.reduce(
    (sum, s) => sum + meds(s).reduce((a, m) => a + (Number(m.price) || 0), 0),
    0,
  );

  const stats = [
    { label: "Total Scans", value: String(totalScans), icon: FileSearch },
    { label: "Medicines Tracked", value: String(totalMeds), icon: Pill },
    { label: "Avg. Confidence", value: `${avgConfidence.toFixed(1)}%`, icon: Activity },
    { label: "Est. Spend", value: `₹${totalCost.toFixed(0)}`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="overflow-hidden rounded-2xl bg-gradient-hero p-6 text-primary-foreground shadow-glow md:p-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm opacity-80">Welcome back, {user?.email?.split("@")[0]}</p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">
              Ready to scan a prescription?
            </h1>
          </div>
          <Button asChild size="lg" className="h-11 bg-background text-foreground hover:bg-background/90">
            <Link to="/upload">
              <Upload className="mr-2 h-4 w-4" /> New scan
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5 bg-gradient-card border-border/60 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 bg-gradient-card border-border/60 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent scans</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {scans.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No scans yet.{" "}
                <Link to="/upload" className="text-primary hover:underline">
                  Upload your first prescription
                </Link>
                .
              </p>
            )}
            {scans.slice(0, 5).map((s) => (
              <Link
                key={s.id}
                to="/results"
                search={{ id: s.id }}
                className="flex items-center justify-between rounded-xl border border-transparent p-3 transition hover:border-border hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileSearch className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()} ·{" "}
                      {Array.isArray(s.medicines) ? s.medicines.length : 0} medicines
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-gradient-card border-border/60 shadow-card">
          <h2 className="font-display text-lg font-bold">Quick actions</h2>
          <div className="mt-4 space-y-2">
            {[
              { to: "/upload" as const, label: "Upload prescription", icon: Upload },
              { to: "/chat" as const, label: "Ask the AI assistant", icon: Activity },
              { to: "/locator" as const, label: "Find pharmacies & hospitals", icon: MapPin },
              { to: "/profile" as const, label: "Update profile", icon: Pill },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:bg-accent"
              >
                <a.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
                <ArrowUpRight className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <AdherenceWidget />
    </div>
  );
}
