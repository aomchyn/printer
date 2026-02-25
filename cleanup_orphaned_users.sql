-- Cleanup Script: Remove Auth users that failed to create a public profile
-- This fixes the "User already registered" error after a failed insertion.

DELETE FROM auth.users 
WHERE id NOT IN (SELECT id FROM public.users);

