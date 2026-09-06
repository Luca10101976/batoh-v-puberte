# Traki na stopě tajemství

Mobile-first PWA pro mestskou hru pro deti 10+, postavena na Next.js 15, Tailwind CSS a Supabase.

## Zprovozneni

1. `npm install`
2. `cp .env.example .env.local` a doplnit hodnoty (viz nize)
3. V Supabase SQL editoru pustit migrace z `supabase/migrations/` v poradi:
   - `0001_baseline.sql` - vsechny tabulky, indexy a triggery
   - `0002_rls.sql` - Row Level Security
4. `npm run dev`

Migrace jsou idempotentni, jde je pustit opakovane i na existujici databazi.

### Povinne env promenne

| Promenna | K cemu |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | adresa Supabase projektu |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon klic, v aplikaci slouzi **jen** k prihlaseni rodice |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only klic, ctou a zapisuji jim vsechny API routy |
| `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS` | basic auth pro editor Mozek |

## Architektura dat

Herni data necte prohlizec nikdy primo. Vsechno jde pres `app/api/*`
a server actions se service-role klicem; anon klic v prohlizeci obsluhuje
pouze Supabase Auth. Na tom stoji i RLS v `0002_rls.sql`: tabulky maji
deny-by-default a vyjimku ma jen `child_profiles`, kterou pod session
tokenem rodice cte prihlasovaci routa.

Odpovedi na herni ukoly se vyhodnocuji vyhradne na serveru
(`lib/task-validation.ts`), klient sve skore neurcuje.

## Prikazy

| Prikaz | Co dela |
| --- | --- |
| `npm run dev` | vyvojovy server |
| `npm run build` | produkcni build |
| `npm run typecheck` | `tsc --noEmit` nad celym repem vcetne testu |
| `npm test` | unit testy herni logiky (`lib/*.test.ts`) |
| `npm run lint` | ESLint |

CI (`.github/workflows/ci.yml`) pousti typecheck, lint, testy a build
nad kazdym pushem do `main` a nad kazdym pull requestem.

## Rodicovsky ucet a profil ditete

- Pri prvnim vstupu se prihlasi nebo zalozi rodicovsky ucet (email + heslo)
- Pod rodicem se ulozi profil ditete do tabulky `child_profiles`
- Na stejnem i novem zarizeni se po prihlaseni rodice nacte stejny profil ditete
- Detsky rezim je chraneny PINem (bcrypt, lockout po opakovanych pokusech)

## supabase/legacy

Historicke SQL soubory, ktere uz **neodpovidaji** beznemu stavu aplikace
a nemaji se poustet. `schema.sql` a `seed.sql` zakladaji tabulky
(`cities`, `locations`, `tasks`, `profiles`, `user_progress`, `friendships`),
na ktere v kodu nesaha nic; obsah misi zije v `missions` / `mission_stops` /
`mission_tasks` a v `lib/mock-data.ts`. Slozka zustava jen kvuli dohledatelnosti.

## Rodicovske e-maily

Odebrano (cervenec 2026). Od rodicovskeho rozhrani se ustoupilo - registrace zadny e-mail neposila.
Env promenne `RESEND_API_KEY` a `PARENT_ALERT_FROM_EMAIL` uz aplikace nepouziva a lze je z Vercelu smazat.

## Navrzene dalsi iterace

- napojeni auth a realnych dat
- validace hernich ukolu
- upload fotek do Supabase Storage
- social feed a notifikace
