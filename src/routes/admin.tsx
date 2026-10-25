import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Database,
  FileSearch,
  Loader2,
  MapPin,
  Pill,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  HardDrive,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  amIAdmin,
  getAdminAnalytics,
  getAdminOverview,
  getSystemHealth,
  listAdminScans,
  listAdminUsers,
  listAuditLog,
} from "@/lib/admin.functions";
import { LANGUAGES } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard | MedScan AI" },
      {
        name: "description",
        content:
          "Administrative control centre for MedScan AI — platform usage, user management, scan monitoring and system health.",
      },
      { property: "og:title", content: "Admin Dashboard | MedScan AI" },
      {
        property: "og:description",
        content: "Platform usage, user management, scan monitoring and system health for MedScan AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AppShell>
      <AdminGate />
    </AppShell>
  ),
});

const COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

function AdminGate() {
  const check = useServerFn(amIAdmin);
  const { data, isLoading, error } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => check(),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.isAdmin) {
    return (
      <Card className="glass mx-auto max-w-lg p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 font-display text-xl font-bold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is restricted to MedScan AI administrators. If you believe this is a mistake,
          contact your platform administrator.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </Card>
    );
  }

  return <AdminDashboard />;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <Card className="glass p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-bold">{value.toLocaleString()}</p>
        </div>
      </div>
    </Card>
  );
}

function AdminDashboard() {
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const fetchHealth = useServerFn(getSystemHealth);
  const fetchUsers = useServerFn(listAdminUsers);
  const fetchScans = useServerFn(listAdminScans);
  const fetchAudit = useServerFn(listAuditLog);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [language, setLanguage] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [scanStatus, setScanStatus] = useState("all");
  const [scanPage, setScanPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setUserPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchOverview() });
  const analytics = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });
  const health = useQuery({ queryKey: ["admin-health"], queryFn: () => fetchHealth() });
  const users = useQuery({
    queryKey: ["admin-users", debounced, language, userPage],
    queryFn: () =>
      fetchUsers({ data: { page: userPage, pageSize: 10, search: debounced, language } }),
  });
  const scans = useQuery({
    queryKey: ["admin-scans", scanStatus, scanPage],
    queryFn: () => fetchScans({ data: { page: scanPage, pageSize: 10, status: scanStatus } }),
  });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => fetchAudit({ data: { limit: 25 } }) });

  useEffect(() => {
    if (overview.error) toast.error("Could not load platform statistics");
  }, [overview.error]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const userPages = Math.max(1, Math.ceil((users.data?.total ?? 0) / 10));
  const scanPages = Math.max(1, Math.ceil((scans.data?.total ?? 0) / 10));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide operational metrics. No patient health details are shown here.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> Administrator
        </Badge>
      </div>

      {/* Overview */}
      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : overview.error ? (
        <Card className="glass p-6 text-center text-sm text-muted-foreground">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          Failed to load platform statistics.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Registered users" value={overview.data?.totalUsers ?? 0} />
          <StatCard icon={Activity} label="Active users (30d)" value={overview.data?.activeUsers ?? 0} />
          <StatCard icon={FileSearch} label="Total scans" value={overview.data?.totalScans ?? 0} />
          <StatCard icon={Pill} label="Medicines detected" value={overview.data?.totalMedicines ?? 0} />
          <StatCard icon={FileSearch} label="Scans (7 days)" value={overview.data?.scans7d ?? 0} />
          <StatCard icon={FileSearch} label="Scans (30 days)" value={overview.data?.scans30d ?? 0} />
          <StatCard icon={BellRing} label="Reminders" value={overview.data?.totalReminders ?? 0} />
          <StatCard icon={Users} label="Family members" value={overview.data?.totalFamilyMembers ?? 0} />
          <StatCard icon={Share2} label="Doctor share links" value={overview.data?.totalShares ?? 0} />
          <StatCard icon={Sparkles} label="AI chat messages" value={overview.data?.totalChatMessages ?? 0} />
        </div>
      )}

      {/* Analytics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Registrations & scans over time</h2>
          {analytics.isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={analytics.data?.timeline ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="signups" stroke={COLORS[0]} strokeWidth={2} name="Signups" />
                <Line type="monotone" dataKey="scans" stroke={COLORS[3]} strokeWidth={2} name="Scans" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="glass p-5">
          <h2 className="mb-4 font-display text-base font-semibold">AI scan usage (medicines detected)</h2>
          {analytics.isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.data?.timeline ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="medicines" fill={COLORS[1]} radius={[6, 6, 0, 0]} name="Medicines" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="glass p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Most detected medicines</h2>
          {analytics.isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (analytics.data?.topMedicines.length ?? 0) === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No scan data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.data?.topMedicines ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" allowDecimals={false} fontSize={12} />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS[2]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="glass p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Medicine categories</h2>
          {analytics.isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (analytics.data?.categories.length ?? 0) === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No category data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={analytics.data?.categories ?? []}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label
                >
                  {(analytics.data?.categories ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* System health */}
      <Card className="glass p-5">
        <h2 className="mb-4 font-display text-base font-semibold">System health</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: "ai", label: "AI (Gemini)", icon: Sparkles },
            { key: "storage", label: "Storage", icon: HardDrive },
            { key: "database", label: "Database", icon: Database },
            { key: "maps", label: "Maps", icon: MapPin },
          ].map(({ key, label, icon: Icon }) => {
            const ok = health.data?.[key as "ai" | "storage" | "database" | "maps"];
            return (
              <div key={key} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {label}
                </span>
                {health.isLoading ? (
                  <Skeleton className="h-5 w-20 rounded-full" />
                ) : (
                  <Badge variant={ok ? "secondary" : "destructive"}>
                    {ok ? "Configured" : "Unavailable"}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Users */}
      <Card className="glass p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">User management</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name"
                className="w-52 pl-8"
              />
            </div>
            <Select
              value={language}
              onValueChange={(v) => {
                setLanguage(v);
                setUserPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {users.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : users.error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Failed to load users.</p>
        ) : (users.data?.users.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No users match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Language</th>
                  <th className="py-2 pr-3">Joined</th>
                  <th className="py-2 pr-3">Last activity</th>
                  <th className="py-2 pr-3">Scans</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.users.map((u) => (
                  <tr key={u.id} className="border-t border-border/50">
                    <td className="py-2 pr-3 font-medium">{u.displayName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.email}</td>
                    <td className="py-2 pr-3 uppercase">{u.language}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(u.createdAt)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(u.lastActivity)}</td>
                    <td className="py-2 pr-3">{u.scans}</td>
                    <td className="py-2">
                      <Badge variant={u.status === "active" ? "secondary" : "outline"}>{u.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          page={userPage}
          pages={userPages}
          total={users.data?.total ?? 0}
          onChange={setUserPage}
        />
      </Card>

      {/* Scans */}
      <Card className="glass p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Scan monitoring</h2>
          <Select
            value={scanStatus}
            onValueChange={(v) => {
              setScanStatus(v);
              setScanPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scans.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : scans.error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Failed to load scans.</p>
        ) : (scans.data?.scans.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No scans recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Scan ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Medicines</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {scans.data?.scans.map((s) => (
                  <tr key={s.id} className="border-t border-border/50">
                    <td className="py-2 pr-3 font-mono text-xs">{s.id.slice(0, 8)}</td>
                    <td className="py-2 pr-3">{s.user}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{s.medicineCount}</td>
                    <td className="py-2">
                      <Badge variant={s.status === "completed" ? "secondary" : "outline"}>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          page={scanPage}
          pages={scanPages}
          total={scans.data?.total ?? 0}
          onChange={setScanPage}
        />
      </Card>

      {/* Audit log */}
      <Card className="glass p-5">
        <h2 className="mb-4 font-display text-base font-semibold">Admin audit log</h2>
        {audit.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (audit.data?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No administrative actions recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {audit.data?.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{a.actor}</span> — {a.action}
                  {a.target ? <span className="text-muted-foreground"> ({a.target})</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Page {page} of {pages} · {total.toLocaleString()} records
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
