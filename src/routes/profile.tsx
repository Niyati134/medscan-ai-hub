import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Mail, Shield, Droplet, AlertTriangle, Phone, Languages } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { LANGUAGES, type LanguageCode } from "@/lib/i18n";
import { listScans } from "@/lib/scan.functions";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/profile")({
  component: () => (
    <AppShell>
      <Profile />
    </AppShell>
  ),
});

function Profile() {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const fetchScans = useServerFn(listScans);
  const qc = useQueryClient();

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: scans } = useQuery({ queryKey: ["scans"], queryFn: () => fetchScans() });

  const [name, setName] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [allergies, setAllergies] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setBloodGroup(profile.blood_group ?? "");
    setAllergies(profile.allergies ?? "");
    setContactName(profile.emergency_contact_name ?? "");
    setContactPhone(profile.emergency_contact_phone ?? "");
    setLanguage((profile.preferred_language as LanguageCode | null) ?? "en");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: {
          display_name: name,
          blood_group: bloodGroup || null,
          allergies: allergies || null,
          emergency_contact_name: contactName || null,
          emergency_contact_phone: contactPhone || null,
          preferred_language: language,
        },
      });
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const initials = (name || user?.email || "U")
    .split(/[\s@]/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal and health information.
        </p>
      </div>

      <Card className="overflow-hidden bg-gradient-card border-border/60 shadow-card">
        <div className="h-32 bg-gradient-hero" />
        <div className="p-6">
          <div className="-mt-16 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar className="h-24 w-24 ring-4 ring-background">
                <AvatarFallback className="bg-gradient-primary text-2xl font-bold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="pb-2">
                <h2 className="font-display text-2xl font-bold">{name || "Set your name"}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Badge className="bg-success/15 text-success border-0">
              <Shield className="mr-1 h-3 w-3" /> Verified
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 bg-gradient-card border-border/60 shadow-card">
          <h3 className="mb-5 font-display text-lg font-bold">Personal information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="language">Preferred language</Label>
              <div className="relative">
                <Languages className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" />
                <Select value={language} onValueChange={(v) => setLanguage(v as LanguageCode)}>
                  <SelectTrigger id="language" className="pl-9">
                    <SelectValue placeholder="Choose a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.native} ({l.label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                AI chat replies and medicine explanations will use this language.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" className="pl-9" value={user?.email ?? ""} disabled />
              </div>
            </div>
          </div>

          <h3 className="mb-4 mt-8 font-display text-lg font-bold">Health profile</h3>
          <p className="-mt-3 mb-5 text-xs text-muted-foreground">
            Used for your printable Emergency Card.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="blood">Blood group</Label>
              <div className="relative">
                <Droplet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" />
                <Input
                  id="blood"
                  className="pl-9"
                  placeholder="e.g. O+"
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  maxLength={10}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cphone">Emergency contact phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                <Input
                  id="cphone"
                  className="pl-9"
                  placeholder="+91 …"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  maxLength={30}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cname">Emergency contact name</Label>
              <Input
                id="cname"
                placeholder="e.g. Spouse, parent"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="allergies">Allergies</Label>
              <div className="relative">
                <AlertTriangle className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-warning" />
                <Textarea
                  id="allergies"
                  className="min-h-[80px] pl-9"
                  placeholder="e.g. Penicillin, peanuts"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button disabled={saving || !name.trim()} onClick={save} className="bg-gradient-primary">
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-card border-border/60 shadow-card">
          <h3 className="mb-5 font-display text-lg font-bold">Account</h3>
          <div className="space-y-4 text-sm">
            <Row label="Total scans" value={String(scans?.length ?? 0)} />
            <Row
              label="Member since"
              value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            />
            <Row label="Blood group" value={profile?.blood_group || "—"} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
