import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { Download, FileSearch, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listScans,
  deleteScan,
  getScan,
  getScanImageUrl,
  type ParsedMedicine,
} from "@/lib/scan.functions";
import { generateMedicalReport } from "@/lib/pdf-report";
import { useMember } from "@/lib/useMember";

export const Route = createFileRoute("/history")({
  component: () => (
    <AppShell>
      <History />
    </AppShell>
  ),
});

type SortMode = "newest" | "oldest" | "most-meds";

function History() {
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const fetchList = useServerFn(listScans);
  const removeFn = useServerFn(deleteScan);
  const fetchScan = useServerFn(getScan);
  const fetchImg = useServerFn(getScanImageUrl);
  const qc = useQueryClient();
  const { activeMemberId } = useMember();
  const { data, isLoading } = useQuery({
    queryKey: ["scans", activeMemberId],
    queryFn: () => fetchList({ data: { memberId: activeMemberId } }),
  });

  const items = useMemo(() => {
    const list = (data ?? []).filter((s) => {
      const meds = (Array.isArray(s.medicines) ? (s.medicines as unknown as ParsedMedicine[]) : []);
      const hay = `${s.file_name} ${meds.map((m) => m.name).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
      if (dateFilter !== "all") {
        const created = new Date(s.created_at);
        const now = new Date();
        const days = dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (created < cutoff) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "oldest")
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === "most-meds") {
        const ac = Array.isArray(a.medicines) ? a.medicines.length : 0;
        const bc = Array.isArray(b.medicines) ? b.medicines.length : 0;
        return bc - ac;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [data, q, dateFilter, sort]);

  const remove = async (id: string) => {
    await removeFn({ data: { id } });
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["scans"] });
  };

  const download = async (id: string) => {
    toast.loading("Generating report…", { id: `pdf-${id}` });
    try {
      const scan = await fetchScan({ data: { id } });
      let imgDataUrl: string | null = null;
      try {
        const { url } = await fetchImg({ data: { path: scan.image_path } });
        const res = await fetch(url);
        const blob = await res.blob();
        imgDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      } catch {
        /* optional */
      }
      const meds = (Array.isArray(scan.medicines) ? (scan.medicines as unknown as ParsedMedicine[]) : []);
      generateMedicalReport(
        {
          id: scan.id,
          file_name: scan.file_name,
          created_at: scan.created_at,
          ocr_text: scan.ocr_text,
          medicines: meds,
        },
        imgDataUrl,
      );
      toast.success("Report downloaded", { id: `pdf-${id}` });
    } catch {
      toast.error("Failed to generate PDF", { id: `pdf-${id}` });
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Scan history</h1>
          <p className="mt-1 text-sm text-muted-foreground">All your past prescription scans.</p>
        </div>
        <Button asChild className="bg-gradient-primary">
          <Link to="/upload">New scan</Link>
        </Button>
      </div>

      <Card className="p-4 bg-gradient-card border-border/60 shadow-card">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by file or medicine name..."
              className="pl-9"
            />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="most-meds">Most medicines</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden bg-gradient-card border-border/60 shadow-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Prescription</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Medicines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const meds = Array.isArray(s.medicines) ? s.medicines.length : 0;
                return (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FileSearch className="h-4 w-4" />
                        </div>
                        <span className="font-medium">{s.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{meds}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          s.status === "completed"
                            ? "bg-success/15 text-success border-0"
                            : "bg-destructive/15 text-destructive border-0"
                        }
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/results" search={{ id: s.id }}>View</Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => download(s.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No scans match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
