import { Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable, non-alarming disclaimer for AI-generated medical content.
 * `prominent` is used for higher-risk panels (interactions, health risks).
 */
export function MedicalDisclaimer({
  prominent = false,
  className,
  children,
}: {
  prominent?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const text =
    children ??
    "AI-generated information is for informational purposes only and is not a substitute for professional medical advice.";

  if (prominent) {
    return (
      <div
        role="note"
        className={cn(
          "mt-5 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-foreground/80",
          className,
        )}
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <span>{text} Always confirm with your doctor or pharmacist before making any changes.</span>
      </div>
    );
  }

  return (
    <p
      role="note"
      className={cn(
        "mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
