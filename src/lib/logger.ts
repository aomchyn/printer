import { supabase } from "@/lib/supabase"; // ใช้ตัวเดียวกับทั้งโปรเจกต์

export const logAction = async (action: string, details?: Record<string, unknown>) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      console.warn('Logging skipped: No active session');
      return;
    }

    const { error } = await supabase.from('audit_logs').insert({
      user_id: session.user.id,
      action: action,
      details: details || {},
    });

    if (error) {
      console.error('Failed to log action:', error);
    }
  } catch (err) {
    console.error('Error logging action:', err);
  }
};