-- Create the audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Nullable in case the user is deleted but we want to keep the log
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only moderators can view logs
CREATE POLICY "Allow moderators to read audit logs" ON public.audit_logs
    FOR SELECT
    USING (
         auth.uid() IN (
             SELECT id FROM public.users WHERE role IN ('moderator')
         )
    );

-- Policy: Authenticated users can insert logs (to track their own actions)
-- But they cannot edit or delete them.
CREATE POLICY "Allow authenticated users to insert audit logs" ON public.audit_logs
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
