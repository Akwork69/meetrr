
DROP POLICY "Anyone can read waiting_users" ON public.waiting_users;
DROP POLICY "Anyone can insert waiting_users" ON public.waiting_users;
DROP POLICY "Anyone can delete waiting_users" ON public.waiting_users;

CREATE POLICY "Anyone can read waiting_users" ON public.waiting_users
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert waiting_users" ON public.waiting_users
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can delete waiting_users" ON public.waiting_users
  FOR DELETE TO anon, authenticated USING (true);
