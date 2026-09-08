-- R18: Traki nesbírá ani neuchovává věk hráče.
--
-- Audit (8. 9. 2026): child_age nemá žádnou funkční roli – neovlivňuje obsah, obtížnost,
-- úkoly, body, přátele, žebříček, expedice, RLS ani Mozek. Sloužil jen k zobrazení
-- v profilu a byl vyžadován onboardingem/API. Aplikační kód už sloupec nečte ani nezapisuje.
-- Inline CHECK (child_age >= 8) zaniká spolu se sloupcem. Žádná policy, funkce, trigger
-- ani view na child_age nezávisí; bez CASCADE – kdyby závislost existovala, migrace
-- bezpečně selže místo tichého mazání dalších objektů.
-- Ostatní sloupce, RLS, indexy i data hráčů zůstávají beze změny.

alter table public.child_profiles drop column if exists child_age;
