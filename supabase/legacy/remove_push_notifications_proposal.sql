-- Návrh cleanupu push notification vrstvy.
-- Nespouštět automaticky. Jen po explicitním schválení.

begin;

drop trigger if exists trg_child_push_subscriptions_touch_updated_at on public.child_push_subscriptions;
drop table if exists public.child_push_subscriptions;

commit;
