import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  TimerReset,
  Pill,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
} from "@/lib/reminders.functions";
import { useMember } from "@/lib/useMember";

export const Route = createFileRoute("/reminders")({
  component: () => (
    <AppShell>
      <Reminders />
    </AppShell>
  ),
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Reminder = {
  id: string;
  medicine_name: string;
  dosage: string | null;
  notes: string | null;
  times: string[];
  days_of_week: number[];
  active: boolean;
  snooze_until: string | null;
  start_date: string;
  end_date: string | null;
};

function Reminders() {
  const fetchFn = useServerFn(listReminders);
  const updateFn = useServerFn(updateReminder);
  const deleteFn = useServerFn(deleteReminder);
  const qc = useQueryClient();
  const { activeMemberId } = useMember();

  const { data, isLoading } = useQuery({
    queryKey: ["reminders", activeMemberId],
    queryFn: () => fetchFn({ data: { memberId: activeMemberId } }),
  });

  const reminders = (data ?? []) as Reminder[];
  const today = new Date();
  const dow = today.getDay();

  const todays = useMemo(
    () =>
      reminders
        .filter((r) => r.active && r.days_of_week.includes(dow))
        .flatMap((r) => r.times.map((t) => ({ r, t })))
        .sort((a, b) => a.t.localeCompare(b.t)),
    [reminders, dow],
  );

  const enableNotifs = async () => {
    if (typeof Notification === "undefined") return;
    const res = await Notification.requestPermission();
    if (res === "granted") toast.success("Notifications enabled");
    else toast.error("Notifications denied");
  };

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    toast.success("Reminder removed");
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const toggle = async (id: string, active: boolean) => {
    await updateFn({ data: { id, active } });
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const snooze = async (id: string, minutes: number) => {
    await updateFn({ data: { id, snooze_minutes: minutes } });
    toast.success(`Snoozed for ${minutes} min`);
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Medicine Reminders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule doses, get browser alerts, and never miss a medication.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={enableNotifs}>
            <Bell className="mr-2 h-4 w-4" /> Enable notifications
          </Button>
          <ReminderDialog memberId={activeMemberId} onCreated={() => qc.invalidateQueries({ queryKey: ["reminders"] })} />
        </div>
      </div>

      <Card className="p-6 bg-gradient-card border-border/60 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">Today · {DAYS[dow]}</h2>
          <Badge variant="secondary" className="ml-auto">{todays.length} dose{todays.length === 1 ? "" : "s"}</Badge>
        </div>
        {todays.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No doses scheduled today.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-6">
            {todays.map(({ r, t }, i) => (
              <li key={`${r.id}-${t}-${i}`} className="relative">
                <span className="absolute -left-[27px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-4 ring-background" />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 p-3">
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-base font-semibold text-primary">{t}</div>
                    <div>
                      <div className="font-medium">{r.medicine_name}</div>
                      {r.dosage && <div className="text-xs text-muted-foreground">{r.dosage}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => snooze(r.id, 10)}>
                      <TimerReset className="mr-1 h-3 w-3" /> 10m
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => snooze(r.id, 30)}>
                      30m
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="p-6 bg-gradient-card border-border/60 shadow-card">
        <h2 className="mb-4 font-display text-lg font-bold">All reminders</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No reminders yet — create your first one above.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {reminders.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-primary" />
                    <div>
                      <div className="font-semibold">{r.medicine_name}</div>
                      {r.dosage && <div className="text-xs text-muted-foreground">{r.dosage}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={r.active} onCheckedChange={(v) => toggle(r.id, v)} />
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.times.map((t) => (
                    <Badge key={t} variant="secondary" className="font-mono">
                      <Clock className="mr-1 h-3 w-3" /> {t}
                    </Badge>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {DAYS.map((d, i) => (
                    <span
                      key={d}
                      className={`text-[10px] rounded px-1.5 py-0.5 ${
                        r.days_of_week.includes(i)
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                {!r.active && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <BellOff className="h-3 w-3" /> Paused
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReminderDialog({ onCreated, memberId }: { onCreated: () => void; memberId: string | null }) {
  const createFn = useServerFn(createReminder);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [notes, setNotes] = useState("");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);

  const toggleDay = (i: number) =>
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()));

  const submit = async () => {
    if (!name.trim() || times.length === 0 || days.length === 0) {
      toast.error("Add a name, at least one time and one day");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          medicine_name: name.trim(),
          dosage: dosage.trim() || null,
          notes: notes.trim() || null,
          times,
          days_of_week: days,
          member_id: memberId,
        },
      });
      toast.success("Reminder created");
      onCreated();
      setOpen(false);
      setName("");
      setDosage("");
      setNotes("");
      setTimes(["09:00"]);
      setDays([0, 1, 2, 3, 4, 5, 6]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary">
          <Plus className="mr-2 h-4 w-4" /> New reminder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New medicine reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Medicine name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amoxicillin" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Dosage</Label>
              <Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="500 mg, 1 tablet" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="After food" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Times</Label>
            <div className="flex flex-wrap gap-2">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const next = [...times];
                      next[i] = e.target.value;
                      setTimes(next);
                    }}
                    className="w-32"
                  />
                  {times.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setTimes(times.filter((_, x) => x !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTimes([...times, "20:00"])}
                disabled={times.length >= 6}
              >
                <Plus className="mr-1 h-3 w-3" /> Add time
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    days.includes(i)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-primary">
            {saving ? "Saving…" : "Create reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
