
CREATE TABLE public.waiting_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow anyone to read/write (no auth required for anonymous chat)
ALTER TABLE public.waiting_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read waiting_users" ON public.waiting_users
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert waiting_users" ON public.waiting_users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete waiting_users" ON public.waiting_users
  FOR DELETE USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_users;
