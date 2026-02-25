-- Security Patch: Updating Row Level Security (RLS) for new RBAC roles
-- Run this in the Supabase SQL Editor

-- 1. Drop existing admin policies
DROP POLICY IF EXISTS "Admins and self can insert users" ON public.users;
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete users" ON public.users;

DROP POLICY IF EXISTS "Admins can insert products" ON public.fgcode;
DROP POLICY IF EXISTS "Admins can update products" ON public.fgcode;
DROP POLICY IF EXISTS "Admins can delete products" ON public.fgcode;

DROP POLICY IF EXISTS "Users can update their unverified orders, Admins can update any" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their unverified orders, Admins can delete any" ON public.orders;

-- 2. Secure public.users table
CREATE POLICY "Admins and self can insert users" ON public.users
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin')) 
    OR 
    auth.uid() = id
  );

CREATE POLICY "Admins can update users" ON public.users
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
  );

CREATE POLICY "Admins can delete users" ON public.users
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
  );


-- 3. Secure public.fgcode (Products) table
CREATE POLICY "Admins can insert products" ON public.fgcode
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
  );

CREATE POLICY "Admins can update products" ON public.fgcode
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
  );

CREATE POLICY "Admins can delete products" ON public.fgcode
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
  );


-- 4. Secure public.orders table
CREATE POLICY "Users can update their unverified orders, Admins can update any" ON public.orders
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
    OR
    (created_by = (SELECT name FROM public.users WHERE id = auth.uid()) AND is_verified = false)
  );

CREATE POLICY "Users can delete their unverified orders, Admins can delete any" ON public.orders
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator', 'admin'))
    OR
    (created_by = (SELECT name FROM public.users WHERE id = auth.uid()) AND is_verified = false)
  );

