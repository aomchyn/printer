-- Security Patch: Enforcing Row Level Security (RLS)
-- Run this in the Supabase SQL Editor

-- 1. Drop existing completely insecure policies
DROP POLICY IF EXISTS "Enable all actions for public users" ON public.users;
DROP POLICY IF EXISTS "Enable all actions for public fgcode" ON public.fgcode;
DROP POLICY IF EXISTS "Enable all actions for public orders" ON public.orders;

-- 2. Secure public.users table
-- All authenticated users can view the list of users (to resolve order creator names)
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admins can insert any user, or a new user can insert their own initial profile during auto-recovery
CREATE POLICY "Admins and self can insert users" ON public.users
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin') 
    OR 
    auth.uid() = id
  );

CREATE POLICY "Admins can update users" ON public.users
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete users" ON public.users
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );


-- 3. Secure public.fgcode (Products) table
-- All authenticated users can view products
CREATE POLICY "Users can view products" ON public.fgcode
  FOR SELECT USING (auth.role() = 'authenticated');

-- ONLY admins can insert, update, or delete products
CREATE POLICY "Admins can insert products" ON public.fgcode
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Admins can update products" ON public.fgcode
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete products" ON public.fgcode
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );


-- 4. Secure public.orders table
-- All authenticated users can view orders (Dashboard requirement)
CREATE POLICY "Users can view orders" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

-- Any authenticated user can create an order
CREATE POLICY "Users can create orders" ON public.orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can only update/delete THEIR OWN UNVERIFIED orders. Admins can update/delete ANY order.
CREATE POLICY "Users can update their unverified orders, Admins can update any" ON public.orders
  FOR UPDATE USING (
    -- User is admin
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
    OR
    -- Or user is the creator AND order is not verified yet
    (created_by = (SELECT name FROM public.users WHERE id = auth.uid()) AND is_verified = false)
  );

CREATE POLICY "Users can delete their unverified orders, Admins can delete any" ON public.orders
  FOR DELETE USING (
    -- User is admin
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
    OR
    -- Or user is the creator AND order is not verified yet
    (created_by = (SELECT name FROM public.users WHERE id = auth.uid()) AND is_verified = false)
  );
