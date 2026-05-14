import { getSupabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/types/db";

export async function getCurrentUserAndRole() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: "guest" as UserRole };

  const { data: meta } = await supabase
    .from("users_meta")
    .select("role, display_name, organization")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    role: (meta?.role ?? "guest") as UserRole,
    displayName: meta?.display_name ?? user.email ?? "",
    organization: meta?.organization ?? null,
  };
}
