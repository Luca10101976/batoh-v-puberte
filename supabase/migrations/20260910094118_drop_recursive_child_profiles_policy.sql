-- Bezpečnostní oprava: rekurze v politice RLS nad tabulkou profilů.
--
-- Politika „parents read connected child profiles via friendships" měla v podmínce
-- poddotaz do child_profiles, tedy do TÉŽE tabulky, nad kterou platí. Postgres na
-- ten poddotaz uplatní RLS znovu, čímž se vyhodnocení zacyklí a skončí chybou
--   42P17  infinite recursion detected in policy for relation "child_profiles"
--
-- Chyba nepadala jen u profilů: politiky devíti dalších tabulek se ptají na
-- child_profiles, aby ověřily vlastnictví, takže přihlášený klient nepřečetl přes
-- Supabase ani vlastní odpovědi, výsledky, výpravy nebo přátele.
--
-- Aplikace tabulku profilů z prohlížeče nikdy nečte ani nezapisuje – všechny cesty
-- jdou přes server se service-role klíčem. Politika se proto ruší bez náhrady.
-- Vědomě NEVZNIKÁ přepsaná politika, pomocná funkce se zvýšenými právy ani pohled:
-- byla by to nová klientská oprávnění pro funkci, kterou nikdo nepoužívá, a řádek
-- profilu obsahuje otisk obnovovacího klíče i e-mail.
--
-- Migrace nemění žádná data, žádnou strukturu ani žádnou jinou politiku.
-- Zůstávají beze změny:
--   parents read own child profiles    (SELECT vlastního profilu)
--   parents insert own child profiles  (INSERT vlastního profilu)
--   parents update own child profiles  (UPDATE vlastního profilu)
-- a rovněž zámek zápisu z R26 nad child_task_progress a child_location_progress.

drop policy if exists "parents read connected child profiles via friendships" on public.child_profiles;

comment on table public.child_profiles is
  'Profil hráče. Klient smí přes RLS číst a měnit jen svůj vlastní profil; cizí profily vydává výhradně server (service role), protože řádek nese i otisk obnovovacího klíče a e-mail.';
