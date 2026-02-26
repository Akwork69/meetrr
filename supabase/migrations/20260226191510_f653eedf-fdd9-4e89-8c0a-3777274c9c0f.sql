
-- Disable RLS entirely on waiting_users so anyone can read/write
ALTER TABLE public.waiting_users DISABLE ROW LEVEL SECURITY;

-- Clean up old policies
DROP POLICY IF EXISTS "allow_select_waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "allow_insert_waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "allow_delete_waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "Anyone can read waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "Anyone can insert waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "Anyone can delete waiting_users" ON public.waiting_users;
