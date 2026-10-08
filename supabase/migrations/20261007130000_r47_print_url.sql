-- R47: odkaz na papírovou verzi hry u Šneldy.
--
-- Papírová hra je Šneldina a žije na jejím webu (např. https://snelda.cz/hra/klamovka).
-- Adresa je vlastnost konkrétní hry, ne celé aplikace – proto sloupec u mise a ne
-- konstanta v kódu. Odvozovat ji ze slugu by znamenalo posílat hráče na 404 u her,
-- které papírovou verzi nemají; raději ať je prázdná a aplikace se zachová jinak.
--
-- Prázdná hodnota = hra papírovou verzi u Šneldy nemá. Nic se tím nerozbije,
-- detail hry pak ukáže vlastní tiskové PDF jako dosud.

alter table public.missions add column if not exists print_url text;

comment on column public.missions.print_url is
  'Odkaz na papírovou verzi hry u Šneldy. Prázdné = hra papírovou verzi nemá.';
