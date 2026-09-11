-- R42: odstranění mrtvých databázových objektů.
--
-- Každá položka prošla read-only auditem, který doložil, že v produkčním kódu
-- nemá čtenáře ani zapisovatele. Prázdnost tabulky nebyla důvodem sama o sobě –
-- databáze je po vyčištění testovacích hráčů bez hráčských dat, takže prázdná je
-- dnes skoro každá hráčská tabulka.
--
-- mission_tasks.answer_mode
--   Nahrazeno sloupcem min_correct_matches z R25, který nese pravidlo „stačí N
--   odpovědí" explicitně a používá se v Mozku i ve vyhodnocení. answer_mode měl
--   u všech 32 úkolů stejnou hodnotu 'single' a nikdo ho nečetl.
--
-- child_push_subscriptions
--   Push notifikace v Traki neexistují a nejsou schválené. Tabulka se navíc
--   vázala na hráče textovým profile_code bez cizího klíče.
--
-- child_profile_blocks
--   Blokování hráčů neexistuje v UI ani v API a není schválené.
--
-- child_expedition_invites
--   Pozvánky do výpravy jdou přes child_game_session_players. Do téhle tabulky
--   nikdy nikdo nevložil řádek; jediné dotčení byl UPDATE ve friends/remove,
--   který proto trvale nic neměnil. Zanikl spolu s ní.
--
-- child_security_events
--   Write-only log: zapisovaly do něj complete-location a friends/remove, ale
--   nečetl ho žádný kód ani Mozek. Dokončení hry zůstává zaznamenané tam, kde se
--   opravdu čte – v child_location_progress a child_task_progress.
--
-- NEDOTÝKÁ SE: child_profiles, child_game_sessions, child_game_session_players,
-- child_location_progress, child_task_progress, child_friendships, rate_limits,
-- herního obsahu (cities, missions, mission_stops, mission_tasks kromě jednoho
-- sloupce) ani panbatoh_content. Skupinové výpravy zůstávají produktově odložené
-- (R34), ne zrušené – sdílený model výprav proto zůstává celý.
alter table public.mission_tasks drop column if exists answer_mode;

drop table if exists public.child_push_subscriptions;
drop table if exists public.child_profile_blocks;
drop table if exists public.child_expedition_invites;
drop table if exists public.child_security_events;
