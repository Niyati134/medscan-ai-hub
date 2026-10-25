import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertTriangle,
  Clock,
  Download,
  Droplet,
  FileText,
  Lock,
  Phone,
  Pill,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getPublicShare, type PublicShare } from "@/lib/shares.functions";
import type { ParsedMedicine } from "@/lib/scan.functions";

export const Route = createFileRoute("/s/$token")({
  validateSearch: z.object({}).passthrough(),
  component: SharePage,
  head: () => ({
    meta: [
      { title: "Shared medical report — MedScan AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SharePage() {
  const { token } = Route.useParams();
  const fetchShare = useServerFn(getPublicShare);
  const [password, setPassword] = useState("");
  const [submittedPw, setSubmittedPw] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["public-share", token, submittedPw ?? null],
    queryFn: () => fetchShare({ data: { token, password: submittedPw } }),
  });

  if (isLoading) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">Loading shared report…</p>
      </Centered>
    );
  }

  if (!data) return null;

  if (!data.ok) {
    if (data.reason === "password_required" || data.reason === "bad_password") {
      return (
        <Centered>
          <Card className="w-full max-w-sm p-6">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Password required</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              This report is password protected. Enter the password shared with you.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmittedPw(password);
                setTimeout(() => refetch(), 0);
              }}
              className="space-y-3"
            >
              <Input
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
              {data.reason === "bad_password" && (
                <p className="text-xs text-destructive">Incorrect password.</p>
              )}
              <Button className="w-full bg-gradient-primary" disabled={isFetching}>
                Unlock report
              </Button>
            </form>
          </Card>
        </Centered>
      );
    }
    const msg =
      data.reason === "not_found"
        ? "This link doesn't exist."
        : data.reason === "expired"
          ? "This link has expired."
          : "This link has been revoked.";
    return (
      <Centered>
        <Card className="max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-3 font-display text-xl font-semibold">Report unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        </Card>
      </Centered>
    );
  }

  return <DoctorReport share={data} />;
}

function DoctorReport({ share }: { share: Extract<PublicShare, { ok: true }> }) {
  const meds = (share.scan?.medicines ?? []) as ParsedMedicine[];
  const adherencePct = useMemo(() => {
    if (!share.adherenceDays.length) return null;
    const t = share.adherenceDays.reduce((a, d) => a + d.taken, 0);
    const x = share.adherenceDays.reduce((a, d) => a + d.total, 0);
    return x > 0 ? Math.round((t / x) * 100) : null;
  }, [share.adherenceDays]);

  const downloadPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, W, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Doctor Report — MedScan AI", 40, 32);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated ${new Date().toLocaleString()}`, 40, 50);

    let y = 100;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Patient", 40, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Name: ${share.patient.name}`, 40, y);
    y += 14;
    if (share.patient.subline) {
      doc.text(share.patient.subline, 40, y);
      y += 14;
    }
    if (share.patient.blood) {
      doc.text(`Blood group: ${share.patient.blood}`, 40, y);
      y += 14;
    }
    if (share.patient.allergies) {
      doc.text(`Allergies: ${share.patient.allergies}`, 40, y);
      y += 14;
    }
    if (share.patient.conditions) {
      doc.text(`Conditions: ${share.patient.conditions}`, 40, y);
      y += 14;
    }
    if (share.include.emergency && share.patient.contactPhone) {
      doc.text(
        `Emergency contact: ${share.patient.contactName ?? ""} ${share.patient.contactPhone}`,
        40,
        y,
      );
      y += 14;
    }

    if (meds.length) {
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Prescription", 40, y);
      autoTable(doc, {
        startY: y + 8,
        head: [["Medicine", "Generic", "Dosage", "Frequency", "Duration"]],
        body: meds.map((m) => [m.name, m.generic, m.dosage, m.frequency, m.duration]),
        headStyles: { fillColor: [37, 99, 235] },
        bodyStyles: { fontSize: 9 },
      });
    }

    if (adherencePct !== null) {
      // @ts-expect-error lastAutoTable
      const cy: number = doc.lastAutoTable?.finalY ?? y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`7-day adherence: ${adherencePct}%`, 40, cy + 30);
    }

    doc.save(`doctor-report-${share.patient.name.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Stethoscope className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-bold">MedScan AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <ShieldCheck className="h-3 w-3" /> Read-only doctor view
            </Badge>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            <Button size="sm" className="bg-gradient-primary" onClick={downloadPdf}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 animate-fade-up">
        {share.title && (
          <h1 className="font-display text-2xl font-bold tracking-tight">{share.title}</h1>
        )}

        <Card className="glass overflow-hidden p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Patient
              </p>
              <h2 className="font-display text-2xl font-bold">{share.patient.name}</h2>
              {share.patient.subline && (
                <p className="text-sm text-muted-foreground">{share.patient.subline}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> Shared{" "}
                {new Date(share.createdAt).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> {share.viewCount} view
                {share.viewCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              icon={<Droplet className="h-4 w-4 text-destructive" />}
              label="Blood group"
              value={share.patient.blood}
            />
            <Field
              icon={<AlertTriangle className="h-4 w-4 text-warning" />}
              label="Allergies"
              value={share.patient.allergies}
            />
            {share.patient.conditions && (
              <div className="sm:col-span-2">
                <Field
                  icon={<ShieldAlert className="h-4 w-4 text-primary" />}
                  label="Medical conditions"
                  value={share.patient.conditions}
                />
              </div>
            )}
            {share.include.emergency && share.patient.contactPhone && (
              <Field
                icon={<Phone className="h-4 w-4 text-primary" />}
                label="Emergency contact"
                value={
                  share.patient.contactName
                    ? `${share.patient.contactName} · ${share.patient.contactPhone}`
                    : share.patient.contactPhone
                }
              />
            )}
          </div>
        </Card>

        {meds.length > 0 && (
          <Card className="glass p-6 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-bold">Prescription</h3>
              <Badge variant="secondary" className="ml-auto">
                {meds.length} medicine{meds.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="grid gap-3">
              {meds.map((m, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card/60 p-4 shadow-soft"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-semibold">{m.name}</p>
                      {m.generic && (
                        <p className="text-xs text-muted-foreground">{m.generic}</p>
                      )}
                    </div>
                    {m.category && (
                      <Badge variant="outline" className="text-xs">
                        {m.category}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <Kv k="Dosage" v={m.dosage} />
                    <Kv k="Frequency" v={m.frequency} />
                    <Kv k="Duration" v={m.duration} />
                  </div>
                  {m.timing && (
                    <p className="mt-2 text-xs text-muted-foreground">Timing: {m.timing}</p>
                  )}
                  {share.include.ai && m.aiExplanation && (
                    <p className="mt-3 rounded-lg bg-primary/5 p-3 text-xs text-foreground/80">
                      {m.aiExplanation}
                    </p>
                  )}
                  {share.include.ai && m.sideEffects?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.sideEffects.slice(0, 6).map((s, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] font-normal">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {share.include.adherence && share.adherenceDays.length > 0 && (
          <Card className="glass p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">7-day adherence</h3>
              {adherencePct !== null && (
                <Badge className="bg-success/15 text-success border-0">{adherencePct}%</Badge>
              )}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {share.adherenceDays.map((d) => {
                const pct = d.total > 0 ? d.taken / d.total : 0;
                return (
                  <div key={d.date} className="text-center">
                    <div className="mx-auto h-20 w-full overflow-hidden rounded-lg bg-muted">
                      <div
                        className="mt-auto h-full bg-gradient-primary transition-all"
                        style={{
                          height: `${Math.max(8, pct * 100)}%`,
                          transform: "translateY(0)",
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {share.scan?.ocr_text && (
          <Card className="glass p-6 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                Original prescription text
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {share.scan.ocr_text}
            </p>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          AI-generated summary. Not a substitute for professional medical advice.
        </p>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function Kv({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-sm">{v || "—"}</p>
    </div>
  );
}
