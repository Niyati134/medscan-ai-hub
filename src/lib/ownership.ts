import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side ownership guards.
 *
 * Client payloads may carry ids (scanId, memberId) that are NOT covered by the
 * RLS predicate of the row being written (which only checks user_id). These
 * helpers make sure a caller can only reference records they actually own.
 */
type Client = SupabaseClient<Database>;

export async function assertOwnsScan(
  supabase: Client,
  userId: string,
  scanId?: string | null,
): Promise<void> {
  if (!scanId) return;
  const { data, error } = await supabase
    .from("scans")
    .select("id")
    .eq("id", scanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Scan not found");
}

export async function assertOwnsMember(
  supabase: Client,
  userId: string,
  memberId?: string | null,
): Promise<void> {
  if (!memberId) return;
  const { data, error } = await supabase
    .from("family_members")
    .select("id")
    .eq("id", memberId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Family member not found");
}
