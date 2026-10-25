// Browser notification + in-app reminder scheduler.
// Polls active reminders every minute, fires a notification when time matches.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listReminders } from "@/lib/reminders.functions";
import { useAuth } from "@/lib/useAuth";

type Reminder = {
  id: string;
  medicine_name: string;
  dosage: string | null;
  times: string[];
  days_of_week: number[];
  active: boolean;
  snooze_until: string | null;
  start_date: string;
  end_date: string | null;
};

const fired = new Set<string>(); // key = `${id}:${YYYY-MM-DD}:${HH:MM}`

/**
 * Parses a timestamp coming from the database. Values without an explicit
 * timezone are stored as UTC, so treat them as UTC instead of local time
 * (otherwise a future snooze can look like it is already in the past).
 */
function parseTimestamp(value: string): number | null {
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/** True while the reminder is snoozed; snoozing expires on its own. */
function isSnoozed(r: Reminder, now: Date): boolean {
  if (!r.snooze_until) return false;
  const until = parseTimestamp(r.snooze_until);
  if (until === null) return false; // unparseable value must not block reminders
  return until > now.getTime();
}

function shouldFire(r: Reminder, now: Date): string | null {
  if (!r.active) return null;
  // Snooze wins over every schedule check.
  if (isSnoozed(r, now)) return null;
  const today = now.toISOString().slice(0, 10);
  if (r.start_date && today < r.start_date) return null;
  if (r.end_date && today > r.end_date) return null;
  const dow = now.getDay();
  if (!r.days_of_week.includes(dow)) return null;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!r.times.includes(hhmm)) return null;
  return `${r.id}:${today}:${hhmm}`;
}

export function ReminderScheduler() {
  const { user } = useAuth();
  const fetchFn = useServerFn(listReminders);
  const { data } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => fetchFn(),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const ref = useRef<Reminder[]>([]);
  ref.current = (data ?? []) as Reminder[];

  useEffect(() => {
    if (!user) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const tick = () => {
      const now = new Date();
      for (const r of ref.current) {
        const key = shouldFire(r, now);
        if (!key || fired.has(key)) continue;
        fired.add(key);
        const title = `💊 Time to take ${r.medicine_name}`;
        const body = r.dosage ? `Dose: ${r.dosage}` : "Tap to confirm in MedScan AI";
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(title, { body, tag: key, icon: "/favicon.ico" });
          }
        } catch {
          /* ignore */
        }
        toast(title, { description: body, duration: 15000 });
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [user]);

  return null;
}
