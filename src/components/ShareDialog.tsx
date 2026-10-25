import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Share2, ShieldCheck, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createShare } from "@/lib/shares.functions";

type Props = {
  trigger?: React.ReactNode;
  shareType?: "scan" | "emergency" | "member";
  scanId?: string | null;
  memberId?: string | null;
  defaultTitle?: string;
};

export function ShareDialog({
  trigger,
  shareType = "scan",
  scanId = null,
  memberId = null,
  defaultTitle = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState<"24h" | "7d" | "30d" | "never">("7d");
  const [title, setTitle] = useState(defaultTitle);
  const [pwOn, setPwOn] = useState(false);
  const [password, setPassword] = useState("");
  const [includeAdherence, setIncludeAdherence] = useState(true);
  const [includeAi, setIncludeAi] = useState(true);
  const [includeEmergency, setIncludeEmergency] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const create = useServerFn(createShare);
  const qc = useQueryClient();

  const mutate = useMutation({
    mutationFn: async () =>
      create({
        data: {
          shareType,
          scanId,
          memberId,
          title: title || null,
          expiry,
          password: pwOn && password.length >= 4 ? password : null,
          includeEmergency,
          includeAdherence,
          includeAi,
        },
      }),
    onSuccess: async ({ token }) => {
      const url = `${window.location.origin}/s/${token}`;
      setLink(url);
      try {
        const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
        setQr(dataUrl);
      } catch {
        setQr(null);
      }
      qc.invalidateQueries({ queryKey: ["shares"] });
      toast.success("Share link created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  };

  const reset = () => {
    setLink(null);
    setQr(null);
    setPassword("");
    setPwOn(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Share2 className="mr-2 h-4 w-4" /> Share with doctor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Share securely with doctor
          </DialogTitle>
          <DialogDescription>
            Generates a read-only link with optional password and expiration. You can revoke it
            anytime.
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t">Title (optional)</Label>
              <Input
                id="t"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow-up consult with Dr. Mehta"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Expires</Label>
              <Select value={expiry} onValueChange={(v) => setExpiry(v as typeof expiry)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {shareType === "scan" && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <Row
                  label="Adherence history (last 7 days)"
                  checked={includeAdherence}
                  onChange={setIncludeAdherence}
                />
                <Row
                  label="AI insights & risks"
                  checked={includeAi}
                  onChange={setIncludeAi}
                />
                <Row
                  label="Emergency contact"
                  checked={includeEmergency}
                  onChange={setIncludeEmergency}
                />
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Password protection</Label>
                <Switch checked={pwOn} onCheckedChange={setPwOn} />
              </div>
              {pwOn && (
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 4 characters"
                  minLength={4}
                />
              )}
            </div>

            <Button
              className="w-full bg-gradient-primary"
              disabled={mutate.isPending}
              onClick={() => mutate.mutate()}
            >
              {mutate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button onClick={copy} size="icon" variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {qr && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4">
                <img src={qr} alt="QR" className="h-44 w-44" />
                <p className="text-xs text-muted-foreground">Scan to open</p>
              </div>
            )}
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={reset}>
                Create another
              </Button>
              <Button asChild className="bg-gradient-primary">
                <a href={link} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
