insert into public.cities (id, name)
values
  ('10000000-0000-0000-0000-000000000001', 'Praha'),
  ('10000000-0000-0000-0000-000000000002', 'Brno'),
  ('10000000-0000-0000-0000-000000000003', 'Olomouc')
on conflict (id) do nothing;

insert into public.locations (id, city_id, name, story, lat, lng, image_url)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Staromestsky orloj',
    'Pan Batoh zachytil podivny signal v detailu orloje. Jen pozorny tym odhali, jaka zprava se tu skryva.',
    50.0870,
    14.4208,
    'https://images.unsplash.com/photo-1541844053589-346841d0b34c?auto=format&fit=crop&w=1200&q=80'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Park Kampa',
    'V tiche casti Kampy se schovava sada stop, ktere davaji smysl jen tomu, kdo se diva kolem sebe.',
    50.0865,
    14.4083,
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Narodni divadlo',
    'Vydejte se za zlatou korunou divadla a zjistete, jaky znak vas dovede k dalsi lokaci.',
    50.0811,
    14.4139,
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'
  )
on conflict (id) do nothing;

insert into public.tasks (location_id, type, content, answer, sort_order)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'question',
    '{"title":"Najdi detail","prompt":"Kolik malych oken vidis nad cifernikem orloje?"}'::jsonb,
    '2',
    1
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'photo',
    '{"title":"Dukaz z mista","prompt":"Vyfot se tak, aby byl na snimku cifernik i cast veze."}'::jsonb,
    null,
    2
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'choice',
    '{"title":"Vyber spravnou stopu","prompt":"Ktery symbol nejvic pripomina motiv casu?","options":["Hvezda","Presypaci hodiny","Most"]}'::jsonb,
    'Presypaci hodiny',
    3
  )
on conflict do nothing;
