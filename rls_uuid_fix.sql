-- ============================================================
-- RLS Policy Fix: Replace permissive policies with UUID-based
-- (auth.uid()) policies for secure row-level access control.
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- =====================
-- 1. USERS TABLE
-- =====================
-- Drop old permissive policy
DROP POLICY IF EXISTS "Enable all actions for public users" ON public.users;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Moderator/Assistant Moderator can read all user profiles
CREATE POLICY "Admins can read all users" ON public.users
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator')
        )
    );

-- Users can update their own profile (name, department, etc.)
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Only moderators can insert new user profiles (during registration)
CREATE POLICY "Authenticated can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Only moderators can delete user profiles
CREATE POLICY "Admins can delete users" ON public.users
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator')
        )
    );

-- Moderators can update any user (for role changes, etc.)
CREATE POLICY "Admins can update any user" ON public.users
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator')
        )
    );


-- =====================
-- 2. FGCODE (PRODUCTS) TABLE
-- =====================
-- Drop old permissive policy
DROP POLICY IF EXISTS "Enable all actions for public fgcode" ON public.fgcode;

-- All authenticated users can read products
CREATE POLICY "Authenticated users can read products" ON public.fgcode
    FOR SELECT USING (auth.role() = 'authenticated');

-- All authenticated users can insert new products
CREATE POLICY "Authenticated users can insert products" ON public.fgcode
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only moderator/assistant_moderator/operator can update products
CREATE POLICY "Admins can update products" ON public.fgcode
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'operator')
        )
    );

-- Only moderator/assistant_moderator/operator can delete products
CREATE POLICY "Admins can delete products" ON public.fgcode
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'operator')
        )
    );


-- =====================
-- 3. ORDERS TABLE
-- =====================
-- Drop old permissive policy
DROP POLICY IF EXISTS "Enable all actions for public orders" ON public.orders;

-- All authenticated users can read orders (needed for dashboard)
CREATE POLICY "Authenticated users can read orders" ON public.orders
    FOR SELECT USING (auth.role() = 'authenticated');

-- All authenticated users can insert orders (create new orders)
CREATE POLICY "Authenticated users can insert orders" ON public.orders
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only moderator/assistant_moderator/operator can update orders (verify, edit)
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'operator')
        )
    );

-- Only moderator/assistant_moderator can delete orders
CREATE POLICY "Admins can delete orders" ON public.orders
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator')
        )
    );


-- =====================
-- 4. AUDIT_LOGS TABLE (verify existing policies)
-- =====================
-- These should already exist from the previous setup.
-- If not, uncomment and run:
--
-- DROP POLICY IF EXISTS "Allow moderators to read audit logs" ON public.audit_logs;
-- DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON public.audit_logs;
--
-- CREATE POLICY "Allow moderators to read audit logs" ON public.audit_logs
--     FOR SELECT USING (
--         auth.uid() IN (
--             SELECT id FROM public.users WHERE role IN ('moderator')
--         )
--     );
--
-- CREATE POLICY "Allow authenticated users to insert audit logs" ON public.audit_logs
--     FOR INSERT WITH CHECK (auth.role() = 'authenticated');
