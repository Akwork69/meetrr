
-- Drop the existing RESTRICTIVE policies
DROP POLICY IF EXISTS "Anyone can read waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "Anyone can insert waiting_users" ON public.waiting_users;
DROP POLICY IF EXISTS "Anyone can delete waiting_users" ON public.waiting_users;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "allow_select_waiting_users" ON public.waiting_users
  FOR SELECT USING (true);

CREATE POLICY "allow_insert_waiting_users" ON public.waiting_users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_delete_waiting_users" ON public.waiting_users
  FOR DELETE USING (true);
