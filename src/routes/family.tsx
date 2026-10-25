import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Users,
  Pencil,
  Trash2,
  Droplet,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Heart,
  Pill,
  BellRing,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  type FamilyMember,
} from "@/lib/family.functions";
import { listScans } from "@/lib/scan.functions";
import { listReminders } from "@/lib/reminders.functions";
import { useMember } from "@/lib/useMember";

export const Route = createFileRoute("/family")({
  component: () => (
    <AppShell>
      <Family />
    </AppShell>
  ),
});

const RELATIONSHIPS = ["Father", "Mother", "Child", "Spouse", "Sibling", "Other"] as const;
const GENDERS = ["Male", "Female", "Other"] as const;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Family() {
  const fetchMembers = useServerFn(listFamilyMembers);
  const fetchScans = useServerFn(listScans);
  const fetchReminders = useServerFn(listReminders);
  const { setActiveMemberId } = useMember();

  const { data: members = [] } = useQuery({
    queryKey: ["family-members"],
    queryFn: () => fetchMembers(),
  });
  const { data: scans = [] } = useQuery({
    queryKey: ["scans", "all"],
    queryFn: () => fetchScans(),
  });
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => fetchReminders(),
  });

  const totalMembers = members.length;
  const activeMeds = reminders.filter((r) => r.active).length;
  const upcomingReminders = reminders.filter((r) => r.active).length;
  const healthAlerts = members.filter(
    (m) => (m.allergies?.trim()?.length ?? 0) > 0 || (m.medical_conditions?.trim()?.length ?? 0) > 0,
  ).length;

  const statsBoxes = [
    { label: "Family members", value: String(totalMembers), icon: Users, tint: "from-primary/15 to-primary/5 text-primary" },
    { label: "Active medications", value: String(activeMeds), icon: Pill, tint: "from-success/15 to-success/5 text-success" },
    { label: "Upcoming reminders", value: String(upcomingReminders), icon: BellRing, tint: "from-warning/15 to-warning/5 text-warning" },
    { label: "Health alerts", value: String(healthAlerts), icon: ShieldAlert, tint: "from-destructive/15 to-destructive/5 text-destructive" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge className="mb-2 border-0 bg-primary/10 text-primary">
            <Heart className="mr-1 h-3 w-3" /> Family Health
          </Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight">Family management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track prescriptions, reminders and emergency info for everyone you care for.
          </p>
        </div>
        <MemberDialog
          mode="create"
          trigger={
            <Button className="bg-gradient-primary shadow-glow">
              <Plus className="mr-2 h-4 w-4" /> Add member
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsBoxes.map((s) => (
          <Card key={s.label} className="overflow-hidden p-5 bg-gradient-card border-border/60 shadow-card">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.tint}`}
            >
              <s.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      {members.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center bg-gradient-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold">No family members yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first family member to start managing their health.
          </p>
          <div className="mt-6">
            <MemberDialog
              mode="create"
              trigger={
                <Button className="bg-gradient-primary">
                  <Plus className="mr-2 h-4 w-4" /> Add member
                </Button>
              }
            />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const memberScans = scans.filter((s) => s.member_id === m.id).length;
            const memberReminders = reminders.filter((r) => r.member_id === m.id && r.active).length;
            return (
              <Card
                key={m.id}
                className="group overflow-hidden bg-gradient-card border-border/60 shadow-card transition-all hover:-translate-y-1 hover:shadow-glow"
              >
                <div className="relative h-24 bg-gradient-hero">
                  <div className="absolute right-3 top-3 flex gap-1">
                    <MemberDialog mode="edit" member={m} />
                    <DeleteMember id={m.id} />
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <div className="-mt-10 flex items-end gap-3">
                    <Avatar className="h-20 w-20 ring-4 ring-background">
                      {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                      <AvatarFallback className="bg-gradient-primary text-xl font-bold text-primary-foreground">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="mt-3">
                    <h3 className="font-display text-lg font-bold leading-tight">{m.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {m.relationship}
                      {m.age != null && ` · ${m.age} yrs`}
                      {m.gender && ` · ${m.gender}`}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.blood_group && (
                      <Badge variant="secondary" className="gap-1">
                        <Droplet className="h-3 w-3 text-destructive" /> {m.blood_group}
                      </Badge>
                    )}
                    {m.allergies && (
                      <Badge variant="secondary" className="gap-1 text-warning">
                        <AlertTriangle className="h-3 w-3" /> Allergies
                      </Badge>
                    )}
                    {m.medical_conditions && (
                      <Badge variant="secondary" className="gap-1 text-primary">
                        <Activity className="h-3 w-3" /> Conditions
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Scans</p>
                      <p className="font-display text-lg font-bold">{memberScans}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Reminders</p>
                      <p className="font-display text-lg font-bold">{memberReminders}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setActiveMemberId(m.id);
                        toast.success(`Switched to ${m.name}`);
                      }}
                    >
                      Switch <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="flex-1">
                      <Link to="/emergency" search={{ memberId: m.id }}>
                        <ShieldAlert className="mr-1 h-3 w-3" /> Card
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeleteMember({ id }: { id: string }) {
  const deleteFn = useServerFn(deleteFamilyMember);
  const qc = useQueryClient();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 bg-background/40 text-destructive hover:bg-background">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove family member?</AlertDialogTitle>
          <AlertDialogDescription>
            Their scans and reminders will be kept but unlinked from this profile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await deleteFn({ data: { id } });
              toast.success("Removed");
              qc.invalidateQueries({ queryKey: ["family-members"] });
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberDialog({
  mode,
  member,
  trigger,
}: {
  mode: "create" | "edit";
  member?: FamilyMember;
  trigger?: React.ReactNode;
}) {
  const createFn = useServerFn(createFamilyMember);
  const updateFn = useServerFn(updateFamilyMember);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(member?.name ?? "");
  const [relationship, setRelationship] = useState<string>(member?.relationship ?? "Other");
  const [gender, setGender] = useState<string>(member?.gender ?? "");
  const [age, setAge] = useState<string>(member?.age != null ? String(member.age) : "");
  const [bloodGroup, setBloodGroup] = useState<string>(member?.blood_group ?? "");
  const [allergies, setAllergies] = useState(member?.allergies ?? "");
  const [conditions, setConditions] = useState(member?.medical_conditions ?? "");
  const [contactName, setContactName] = useState(member?.emergency_contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(member?.emergency_contact_phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(member?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        relationship: relationship as (typeof RELATIONSHIPS)[number],
        gender: gender || null,
        age: age ? Number(age) : null,
        date_of_birth: null,
        blood_group: bloodGroup || null,
        allergies: allergies.trim() || null,
        medical_conditions: conditions.trim() || null,
        emergency_contact_name: contactName.trim() || null,
        emergency_contact_phone: contactPhone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        notes: null,
      };
      if (mode === "edit" && member) {
        await updateFn({ data: { id: member.id, ...payload } });
        toast.success("Updated");
      } else {
        await createFn({ data: payload });
        toast.success("Family member added");
      }
      qc.invalidateQueries({ queryKey: ["family-members"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-background/40 hover:bg-background">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add family member" : "Edit member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-gradient-primary text-lg text-primary-foreground">
                {initials(name || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1.5">
              <Label>Photo URL</Label>
              <Input
                placeholder="https://…"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender || "_none"} onValueChange={(v) => setGender(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={0}
                max={130}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Blood group</Label>
              <Select value={bloodGroup || "_none"} onValueChange={(v) => setBloodGroup(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {BLOOD_GROUPS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Allergies</Label>
              <Textarea
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                maxLength={500}
                placeholder="e.g. Penicillin, peanuts"
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Medical conditions</Label>
              <Textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Type 2 diabetes, asthma"
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-primary">
            {saving ? "Saving…" : mode === "create" ? "Add member" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
