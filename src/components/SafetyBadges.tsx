import { ShieldCheck, Wine, Baby, Car, Snowflake, FileCheck, FileX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ParsedMedicine } from "@/lib/scan.functions";

type Tone = "success" | "warning" | "destructive" | "muted";

const toneCls: Record<Tone, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/40",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
};

function severityFromText(text: string): Tone {
  if (!text) return "success";
  const t = text.toLowerCase();
  if (/(avoid|do not|never|severe|dangerous|contraindicat)/.test(t)) return "destructive";
  if (/(caution|may|can cause|consult|monitor|limit)/.test(t)) return "warning";
  return "success";
}

export function SafetyBadges({ med }: { med: Partial<ParsedMedicine> }) {
  const items: { icon: React.ReactNode; label: string; tone: Tone; tip: string }[] = [];

  if (med.rxStatus && med.rxStatus !== "Unknown") {
    const isRx = med.rxStatus === "Rx";
    items.push({
      icon: isRx ? <FileCheck className="h-3 w-3" /> : <FileX className="h-3 w-3" />,
      label: isRx ? "Prescription" : "OTC",
      tone: isRx ? "warning" : "success",
      tip: isRx ? "Requires a doctor's prescription" : "Available over the counter",
    });
  }

  if (med.foodInteractions?.length) {
    items.push({
      icon: <ShieldCheck className="h-3 w-3" />,
      label: "Food",
      tone: "warning",
      tip: med.foodInteractions.join(" • "),
    });
  }

  if (med.alcoholInteraction) {
    items.push({
      icon: <Wine className="h-3 w-3" />,
      label: "Alcohol",
      tone: severityFromText(med.alcoholInteraction),
      tip: med.alcoholInteraction,
    });
  }

  if (med.pregnancyWarning) {
    items.push({
      icon: <Baby className="h-3 w-3" />,
      label: "Pregnancy",
      tone: severityFromText(med.pregnancyWarning),
      tip: med.pregnancyWarning,
    });
  }

  if (med.drivingWarning) {
    items.push({
      icon: <Car className="h-3 w-3" />,
      label: "Driving",
      tone: severityFromText(med.drivingWarning),
      tip: med.drivingWarning,
    });
  }

  if (med.storage) {
    items.push({
      icon: <Snowflake className="h-3 w-3" />,
      label: "Storage",
      tone: "muted",
      tip: med.storage,
    });
  }

  if (!items.length) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Tooltip key={it.label}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn("gap-1 border font-normal cursor-help", toneCls[it.tone])}
              >
                {it.icon}
                {it.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{it.tip}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
