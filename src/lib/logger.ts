import { createClient } from "@supabase/supabase-js";

// Helper function to connect to Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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
