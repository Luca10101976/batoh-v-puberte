alter table public.missions
add column if not exists hero_image_url text not null default '';

