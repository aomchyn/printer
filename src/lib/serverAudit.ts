import type { SupabaseClient } from "@supabase/supabase-js";

export type UserAuditAction =
  | "CREATE_USER"
  | "UPDATE_USER"
  | "UPDATE_PROFILE"
  | "DELETE_USER";
  
export interface AuditActor {
  id: string;
  name: string;
  employee_id?: string | null;
}

function getActorName(actor: AuditActor) {
  const employeeId = actor.employee_id?.trim();

  return employeeId
    ? `${actor.name} (${employeeId})`
    : actor.name;
}

export async function writeUserAudit(
  supabaseAdmin: SupabaseClient,
  actor: AuditActor,
  action: UserAuditAction,
  summary: string,
  details: Record<string, unknown>,
  changes?: Record<string, unknown> | null,
) {
  const { error } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      user_id: actor.id,
      user_name: getActorName(actor),
      action,
      summary,
      details,
      changes: changes ?? null,
    });

  if (error) {
    throw new Error(`Audit log failed: ${error.message}`);
  }
}