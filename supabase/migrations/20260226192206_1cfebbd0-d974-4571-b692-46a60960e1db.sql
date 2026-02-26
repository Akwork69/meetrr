
-- Create signals table for WebRTC signaling via DB
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL,
  sender_id text NOT NULL,
  type text NOT NULL, -- 'offer', 'answer', 'ice-candidate'
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No RLS needed for ephemeral signaling
ALTER TABLE public.signals DISABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX idx_signals_room_id ON public.signals(room_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;

-- Clean up stale waiting_users
DELETE FROM public.waiting_users;
