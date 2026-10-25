import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import {
  Download,
  FileText,
  Printer,
  MapPin,
  Share2,
  Sparkles,
  Pill,
  IndianRupee,
  Gauge,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MedicineCard } from "@/components/MedicineCard";
import { getScan, getScanImageUrl, type ParsedMedicine } from "@/lib/scan.functions";
import { translateTexts } from "@/lib/i18n.functions";
import { LANGUAGES, languageName, type LanguageCode } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InteractionPanel } from "@/components/InteractionPanel";
import { HealthInsights } from "@/components/HealthInsights";
import { HealthRisks } from "@/components/HealthRisks";
import { PrescriptionTimeline } from "@/components/PrescriptionTimeline";
import { ResultsSkeleton } from "@/components/ResultsSkeleton";
import { ShareDialog } from "@/components/ShareDialog";
import { PriceComparison } from "@/components/PriceComparison";
import { generateMedicalReport } from "@/lib/pdf-report";
import { toast } from "sonner";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

export const Route = createFileRoute("/results")({
  validateSearch: z.object({ id: z.string().uuid().optional() }),
  component: () => (
    <AppShell>
      <Results />
    </AppShell>
  ),
});

function Results() {
  const { id } = Route.useSearch();
  const fetchScan = useServerFn(getScan);
  const fetchImg = useServerFn(getScanImageUrl);
  const { data, isLoading, error } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => fetchScan({ data: { id: id! } }),
    enabled: !!id,
  });

  if (!id) {
    return (
      <Card className="glass p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">No scan selected.</p>
        <Button asChild className="mt-4 bg-gradient-primary">
          <Link to="/upload">Scan a prescription</Link>
        </Button>
      </Card>
    );
  }
  if (isLoading) return <ResultsSkeleton />;
  if (error || !data) {
    return (
      <Card className="glass p-8 text-center">
        <p className="text-sm text-destructive">Could not load this scan.</p>
      </Card>
    );
  }

  // Older or hand-edited rows may hold non-array JSON or medicines without an id.
  const medicines: ParsedMedicine[] = (
    Array.isArray(data.medicines) ? (data.medicines as unknown as ParsedMedicine[]) : []
  )
    .filter((m): m is ParsedMedicine => !!m && typeof m === "object")
    .map((m, i) => ({ ...m, id: m.id || `m${i + 1}` }));
  const totalPrice = medicines.reduce((s, m) => s + (m.price || 0), 0);
  const totalSavings = medicines.reduce(
    (s, m) =>
      s +
      Math.max(
        0,
        (m.price || 0) -
          (m.equivalents?.length ? Math.min(...m.equivalents.map((e) => e.price)) : m.price || 0),
      ),
    0,
  );
  const avgConfidence =
    medicines.length > 0
      ? medicines.reduce((s, m) => s + (m.confidence || 0), 0) / medicines.length
      : 0;
  const categories = Array.from(
    new Set(medicines.map((m) => m.category).filter(Boolean) as string[]),
  );
  const medNames = medicines.map((m) => m.name);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: "MedScan AI", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  };

  const downloadPdf = async () => {
    if (!data) return;
    toast.loading("Generating report…", { id: "pdf" });
    try {
      let imgDataUrl: string | null = null;
      try {
        const { url } = await fetchImg({ data: { path: data.image_path } });
        const res = await fetch(url);
        const blob = await res.blob();
        imgDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      } catch {
        /* image optional */
      }
      generateMedicalReport(
        {
          id: data.id,
          file_name: data.file_name,
          created_at: data.created_at,
          ocr_text: data.ocr_text,
          medicines,
        },
        imgDataUrl,
      );
      toast.success("Report downloaded", { id: "pdf" });
    } catch (e) {
      toast.error("Failed to generate PDF", { id: "pdf" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant="secondary" className="mb-2 bg-success/15 text-success border-0">
            <Sparkles className="mr-1 h-3 w-3" /> Scan complete
          </Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight">Prescription analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.file_name} · {medicines.length} medication{medicines.length === 1 ? "" : "s"}{" "}
            detected
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/locator" search={{ kind: "pharmacy", q: medicines[0]?.name }}>
              <MapPin className="mr-2 h-4 w-4" /> Nearby pharmacies
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
          <ShareDialog
            shareType="scan"
            scanId={data.id}
            defaultTitle={`Prescription · ${new Date(data.created_at).toLocaleDateString()}`}
          />
          <Button size="sm" className="bg-gradient-primary" onClick={downloadPdf}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<IndianRupee className="h-4 w-4" />}
          label="Total cost"
          value={`₹${totalPrice.toFixed(2)}`}
          tone="primary"
        />
        <StatCard
          icon={<Pill className="h-4 w-4" />}
          label="Possible savings"
          value={`₹${totalSavings.toFixed(2)}`}
          tone="success"
        />
        <StatCard
          icon={<Gauge className="h-4 w-4" />}
          label="AI confidence"
          value={`${(avgConfidence * 100).toFixed(0)}%`}
          tone="primary"
          progress={avgConfidence}
        />
      </div>

      {medicines.length === 0 ? (
        <Card className="glass p-10 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't extract any medicines. Try a clearer image.
          </p>
          <Button asChild className="mt-4 bg-gradient-primary">
            <Link to="/upload">Try again</Link>
          </Button>
        </Card>
      ) : (
        <>
          {/* Prescription summary */}
          <Card className="glass relative overflow-hidden p-6 shadow-card">
            <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-50" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold">Prescription summary</h3>
                {categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <Badge key={c} variant="outline" className="font-normal">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                  {medicines.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-foreground/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="font-medium">{m.name}</span>
                      {m.dosage && (
                        <span className="text-muted-foreground">· {m.dosage}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {/* Multi-language medicine explanations */}
          <TranslatePanel medicines={medicines} />

          {/* Daily medicine schedule + adherence */}
          <PrescriptionTimeline scanId={data.id} medicines={medicines} />

          {/* Parallel: insights + risks + interactions */}
          <HealthInsights medicines={medNames} />
          <PriceComparison medicines={medNames} scanId={data.id} />
          <HealthRisks medicines={medNames} />
          <InteractionPanel medicines={medNames} />

          {/* Medicine cards with staggered animation */}
          <div className="grid gap-4 lg:grid-cols-2">
            {medicines.map((m, i) => (
              <div
                key={m.id}
                className="animate-stagger"
                style={{ animationDelay: `${Math.min(i * 80, 600)}ms` }}
              >
                <MedicineCard med={m} />
              </div>
            ))}
          </div>
        </>
      )}

      {data.ocr_text && (
        <Card className="glass p-6 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-bold">Raw extracted text</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {data.ocr_text}
              </p>
              <Button asChild variant="link" className="mt-2 h-auto p-0 text-primary">
                <Link to="/chat">Ask AI about these medications →</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success";
  progress?: number;
}) {
  const toneCls = tone === "success" ? "text-success" : "text-primary";
  return (
    <Card className="glass relative overflow-hidden p-5 shadow-card transition hover:shadow-glow">
      <div className="absolute inset-0 -z-10 bg-gradient-glow opacity-40" />
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={toneCls}>{icon}</span>
      </div>
      <p className={`mt-2 font-display text-3xl font-bold ${toneCls}`}>{value}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-700"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}

/** Translate all medicine AI explanations into a chosen language via Gemini. */
function TranslatePanel({ medicines }: { medicines: ParsedMedicine[] }) {
  const doTranslate = useServerFn(translateTexts);
  const [lang, setLang] = useState<LanguageCode>("hi");
  const [output, setOutput] = useState<Record<string, string> | null>(null);

  const translate = useMutation({
    mutationFn: async () => {
      const targets = medicines.filter((m) => m.aiExplanation);
      const res = await doTranslate({
        data: {
          texts: targets.map((m) => m.aiExplanation as string),
          targetLanguage: lang,
        },
      });
      const map: Record<string, string> = {};
      targets.forEach((m, i) => {
        map[m.id] = res.translations[i] ?? "";
      });
      return map;
    },
    onSuccess: (map) => {
      setOutput(map);
      toast.success(`Explanations translated to ${languageName(lang)}`);
    },
    onError: (e: Error) => toast.error(e.message || "Translation failed"),
  });

  return (
    <Card className="glass p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
            <Languages className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Read in your language</h3>
            <p className="text-xs text-muted-foreground">
              Translate the AI explanation for every medicine.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={lang} onValueChange={(v) => setLang(v as LanguageCode)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.filter((l) => l.code !== "en").map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.native} ({l.label})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-gradient-primary"
            disabled={translate.isPending}
            onClick={() => translate.mutate()}
          >
            {translate.isPending ? "Translating…" : "Translate"}
          </Button>
        </div>
      </div>
      <MedicalDisclaimer>
        Translations are AI-generated and for informational purposes only; they are not a
        substitute for professional medical advice.
      </MedicalDisclaimer>
      {output && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {medicines
            .filter((m) => output[m.id])
            .map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">{m.name}</p>
                <p className="mt-1 text-sm text-foreground/80">{output[m.id]}</p>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
