# Batoh v pubertě

Mobile-first PWA pro mestskou hru pro deti 10+, postavena na Next.js 14, Tailwind CSS a Supabase.

## Co je pripraveno

- App Router kostra pro hlavni obrazovky
- tmavy mobile-first UI koncept
- PWA manifest
- Supabase SQL schema a seed data
- pripraveny helper pro Supabase klienta
- rodicovsky login (Supabase Auth) + profil ditete v cloudu

## Dalsi krok

1. `npm install`
2. `npm run dev`
3. V Supabase pust `supabase/schema.sql` (obsahuje i `child_profiles`)
4. Volitelne pust `supabase/seed.sql`

## Rodicovsky ucet a profil ditete

- Pri prvnim vstupu se prihlasi nebo zalozi rodicovsky ucet (email + heslo)
- Pod rodicem se ulozi profil ditete do tabulky `child_profiles`
- Na stejnem i novem zarizeni se po prihlaseni rodice nacte stejny profil ditete

## Rodicovske e-maily

Odebrano (cervenec 2026). Od rodicovskeho rozhrani se ustoupilo - registrace zadny e-mail neposila.
Env promenne `RESEND_API_KEY` a `PARENT_ALERT_FROM_EMAIL` uz aplikace nepouziva a lze je z Vercelu smazat.

## Navrzene dalsi iterace

- napojeni auth a realnych dat
- validace hernich ukolu
- upload fotek do Supabase Storage
- social feed a notifikace
