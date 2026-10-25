import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Image as ImageIcon, FileCheck, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { scanPrescription } from "@/lib/scan.functions";
import { useMember } from "@/lib/useMember";

export const Route = createFileRoute("/upload")({
  component: () => (
    <AppShell>
      <UploadPage />
    </AppShell>
  ),
});

const MAX_EDGE_PX = 2000;
const SHRINK_THRESHOLD_BYTES = 1.5 * 1024 * 1024;

/** File extension derived from the (possibly re-encoded) file's MIME type, never from user text. */
function safeExtension(f: File): string {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return byType[f.type] ?? "jpg";
}

/**
 * Downscale large JPEG/PNG/WEBP photos to at most 2000px on the long edge and
 * re-encode as JPEG. Falls back to the original file whenever the browser cannot
 * decode it (e.g. HEIC) or the result would not be smaller.
 */
async function shrinkImage(f: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return f;
  try {
    const bitmap = await createImageBitmap(f);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (f.size <= SHRINK_THRESHOLD_BYTES && longEdge <= MAX_EDGE_PX) {
      bitmap.close();
      return f;
    }
    const scale = Math.min(1, MAX_EDGE_PX / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return f;
    }
    ctx.fillStyle = "#ffffff"; // flatten transparency (PNG) onto white before JPEG encoding
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const navigate = useNavigate();
  const runScanFn = useServerFn(scanPrescription);
  const { activeMemberId } = useMember();

  const runScan = async () => {
    // In-flight guard: survives rerenders and blocks double-clicks/races.
    if (!file || inFlightRef.current) return;
    inFlightRef.current = true;
    setScanning(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      // Phone photos are often 5-10 MB. Shrinking them first makes the upload and the
      // AI request much faster without hurting OCR quality.
      const prepared = await shrinkImage(file);
      const ext = safeExtension(prepared);
      const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("prescriptions")
        .upload(path, prepared, { contentType: prepared.type || undefined, upsert: false });
      if (upErr) {
        console.error("[upload] storage upload failed:", upErr.message);
        throw new Error("Could not upload the file. Please try again.");
      }

      const result = await runScanFn({ data: { imagePath: path, fileName: file.name, memberId: activeMemberId ?? undefined } });
      if (result.medicines.length === 0) {
        toast.warning("No medicines could be read. Try a clearer photo.");
      } else {
        toast.success(`Found ${result.medicines.length} medication${result.medicines.length === 1 ? "" : "s"}`);
      }
      navigate({ to: "/results", search: { id: result.scanId } });
    } catch (e) {
      toast.error(
        e instanceof Error && e.message
          ? e.message
          : "Unable to analyze this prescription right now. Please try again.",
      );
      setScanning(false);
    } finally {
      // Always release the guard so the user can retry or scan another file.
      inFlightRef.current = false;
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold">Upload prescription</h1>
        <p className="mt-1 text-sm text-muted-foreground">Drag and drop an image — our AI does the rest.</p>
      </div>

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            toast.error("File too large (max 10MB)");
            return;
          }
          if (!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(f.type)) {
            toast.error("Unsupported file type. Use JPG, PNG or WEBP.");
            return;
          }
          setFile(f);
        }}
        className={`relative overflow-hidden border-2 border-dashed bg-gradient-card p-12 transition-all ${
          dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/70"
        }`}
      >
        {scanning ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative h-48 w-48 overflow-hidden rounded-2xl border-2 border-primary/40 bg-muted">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-b from-primary via-primary-glow to-transparent animate-scan-line shadow-glow" />
              <div className="flex h-full items-center justify-center">
                <ScanLine className="h-16 w-16 text-primary/40" />
              </div>
            </div>
            <p className="mt-6 flex items-center gap-2 font-display text-lg font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" /> AI is analyzing your prescription...
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Detecting medications · Verifying dosages · Finding equivalents
            </p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 text-success">
              <FileCheck className="h-8 w-8" />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB · Ready to scan
            </p>
            <div className="mt-6 flex gap-2">
              <Button onClick={runScan} size="lg" className="bg-gradient-primary shadow-glow">
                <ScanLine className="mr-2 h-4 w-4" /> Start AI scan
              </Button>
              <Button variant="outline" onClick={() => setFile(null)}>
                Replace
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-primary shadow-glow">
                <Upload className="h-9 w-9 text-primary-foreground" />
              </div>
              <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-3xl bg-primary/40" />
            </div>
            <h3 className="mt-6 font-display text-xl font-bold">Drop your prescription here</h3>
            <p className="mt-1 text-sm text-muted-foreground">PNG or JPG · up to 10MB</p>
            <Button onClick={() => inputRef.current?.click()} className="mt-6 bg-gradient-primary">
              <ImageIcon className="mr-2 h-4 w-4" /> Browse files
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 10 * 1024 * 1024) {
                  toast.error("File too large (max 10MB)");
                  return;
                }
                if (!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(f.type)) {
                  toast.error("Unsupported file type. Use JPG, PNG or WEBP.");
                  return;
                }
                setFile(f);
              }}
            />
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Clear photo", desc: "Ensure good lighting and no glare on the paper." },
          { title: "Full page", desc: "Capture the entire prescription with all medications." },
          { title: "Privacy safe", desc: "Files are encrypted and only visible to you." },
        ].map((t) => (
          <Card key={t.title} className="p-4 bg-gradient-card border-border/60">
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
