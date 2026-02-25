-- Insert Test Accounts for RBAC Verification

-- 1. Moderator
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) 
VALUES ('c1a1a1a1-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moderator@test.com', crypt('password123', gen_salt('bf')), now(), now(), now()) ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, email, name, role, department) 
VALUES ('c1a1a1a1-1111-1111-1111-111111111111', 'moderator@test.com', 'Test Moderator', 'moderator', 'IT') ON CONFLICT (email) DO UPDATE SET role = 'moderator';

-- 2. Assistant Moderator
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) 
VALUES ('c2a2a2a2-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@test.com', crypt('password123', gen_salt('bf')), now(), now(), now()) ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, email, name, role, department) 
VALUES ('c2a2a2a2-2222-2222-2222-222222222222', 'assistant@test.com', 'Test Assistant', 'assistant_moderator', 'IT') ON CONFLICT (email) DO UPDATE SET role = 'assistant_moderator';

-- 3. Operator
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) 
VALUES ('c3a3a3a3-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@test.com', crypt('password123', gen_salt('bf')), now(), now(), now()) ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, email, name, role, department) 
VALUES ('c3a3a3a3-3333-3333-3333-333333333333', 'operator@test.com', 'Test Operator', 'operator', 'Production') ON CONFLICT (email) DO UPDATE SET role = 'operator';

