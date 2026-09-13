# Traki na stopě tajemství

Herní platforma pro objevovací městské hry. Dítě si v aplikaci vybere hru ve svém
městě, projde v terénu její zastávky a na každé odpovídá na úkoly.

- **Produkce:** [postope.cz](https://postope.cz) → `www.postope.cz`
- **Repozitář a projekt ve Vercelu:** `batoh-v-puberte`
- **Název balíčku:** `traki`

Technické názvy `batoh-v-puberte` a `traki` jsou historické a **nepřejmenovávají se**.
Pan Batoh je zastřešující značka, tento dokument je technická dokumentace Traki.

## Stav projektu (13. 9. 2026)

Plán běží po bodech v `TRAKI_MASTER_PLAN.xlsx`. Body R41–R45 jsou hotové:

| Bod | Co přinesl |
| --- | --- |
| R41 | odstranění PIN infrastruktury |
| R42 | konec legacy e-mailového přihlášení, úklid mrtvých rout a tabulek |
| R43 | poctivé chybové stavy – nezjištěný stav se nesmí tvářit jako nula |
| R44 | UX obrazovku po obrazovce: vstup, katalog, hraní, profil, přátelé, žebříček |
| R45 | UX Mozku: bezpečné mazání, kontrola hry bez publikace, řazení šipkami |

**Upřímný odhad stavu.** Aplikace dělá to, co má, ale produkt stojí na jediné
publikované hře a zatím ho nehrál žádný skutečný hráč:

| Otázka | Odhad |
| --- | --- |
| Funguje to, co je postavené? | ~93 % |
| Je to připravené na skutečné hráče? | ~65 % |
| Je hotový obsah? | ~50 % |

Rozdíl mezi prvním a druhým číslem není v kódu. Publikovaná je **jedna hra**
(Klamovka, ~50 minut). Budějovice jsou rozepsané – třináct úkolů nemá správnou
odpověď a chybí titulní obrázek i závěr, takže je publikace zatím nepustí ven.
Dokud je druhé město bez publikované hry, výběr města se hráčům vůbec nezobrazí.

Ověřováno průchodem produkce se syntetickými profily, které se po každém testu
mažou. Produkční databáze proto běžně stojí na nule hráčů.

## Stack

Verze podle `package.json`:

| Vrstva | Co se používá |
| --- | --- |
| Framework | Next.js 15 (App Router), React 18 |
| Jazyk | TypeScript 5 |
| Styly | Tailwind CSS 3 |
| Data a auth | Supabase (`@supabase/supabase-js` 2) |
| Hosting | Vercel |
| PWA | `public/sw.js` + `app/manifest.ts` |

Service worker dnes ukládá jen aplikační obal (úvodní stránka, offline hláška,
ikony). Herní volání ani obsah her se necachují, viz [Co zatím není hotové](#co-zatím-není-hotové).

## Lokální zprovoznění

Pracovní kopie je **tento projekt**. Starší kopie na ploše nejsou zdrojem pravdy
a needitují se.

Předpoklady: Node 22 (stejnou verzi používá CI), účet ve Vercelu s přístupem
k projektu `batoh-v-puberte`, nainstalované Vercel CLI. Pro práci s databází navíc
Supabase CLI napojené na projekt (`supabase link`).

```
npm install
npm run env:pull
npm run dev
```

Na novém stroji nejdřív `vercel login` a `vercel link` na projekt `batoh-v-puberte`,
teprve pak `npm run env:pull`.

### Správa ENV: Vercel je zdroj, lokální soubor se generuje

- Spravované proměnné žijí **ve Vercelu**. Tam se přidávají a mění, v dashboardu
  nebo příkazem `vercel env add NAZEV production preview development`.
- `.env.local` je **generovaný** soubor. Není v Gitu a **needituje se ručně**.
- Obnova lokálních Development hodnot: `npm run env:pull`
  (= `vercel env pull .env.local --environment=development`). Přepíše soubor přesně
  podle Vercelu a odstraní proměnné, které už tam nejsou.
- `.env.example` slouží jen jako přehled názvů, ne jako zdroj hodnot.
- Development používá **stejné hodnoty Supabase jako produkce**. Je to vědomě
  zachovaný stav, ne oddělené vývojové prostředí.

### Proměnné prostředí

| Proměnná | K čemu | Povinná |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | adresa projektu Supabase | ano |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | veřejný klíč pro Supabase Auth v prohlížeči | ano |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only klíč, kterým čtou a zapisují API routy | ano |
| `RECOVERY_KEY_PEPPER` | server-only pepper pro HMAC Traki klíče; změna zneplatní všechny vydané klíče | ano |
| `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS` | basic auth pro editor Mozek | ano |
| `NEXT_PUBLIC_SITE_URL` | absolutní adresa pro `robots.txt` a `sitemap.xml` | volitelná |
| `RATE_LIMIT_OVERRIDES_JSON` | přepis limitů pro jednotlivé akce | volitelná |

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` se čte jen jako záloha, když chybí anon klíč.

Do repozitáře ani do dokumentace nepatří žádná skutečná hodnota klíče, pepperu
ani hesla.

## Databáze a migrace

Schéma je v `supabase/migrations/`. Historie začíná dvěma soubory, které zachycují
stav produkce k 7. 9. 2026: `0001_baseline.sql` (herní tabulky, indexy, triggery)
a `0002_production_snapshot_2026-09-07.sql` (zbylé tabulky, RLS a policies).
Za nimi následují běžné inkrementální migrace s časovým razítkem v názvu.

**Nové prostředí:** spustit celý adresář v pořadí, tedy oba snapshotové soubory
a po nich všechny inkrementální migrace.

**Produkce:** snapshotové soubory `0001` a `0002` se na ní **nikdy nespouštějí**,
tento stav už má. Aplikují se pouze nové inkrementální migrace.

Postup pro každou změnu schématu:

```
supabase migration new nazev_zmeny
supabase db push --linked --dry-run
supabase db push --linked
```

Pravidla, která platí bez výjimky:

- Migrace je idempotentní a nemaže data. Žádné `drop table`, `delete` ani `truncate`.
- Před nasazením proběhne `--dry-run` a read-only kontrola dotčených tabulek.
- Kompletní seznam migrací v tomto dokumentu záměrně není, aby nezastaral.
  Zdrojem pravdy je adresář a `supabase migration list --linked`.

Známý rozdíl: produkční tabulka `mission_tasks` má navíc sloupce `hint_text`
a `answer_mode`, které v žádné migraci nejsou. Nové prostředí je tedy bude mít
jinak než produkce. Kód dnes ani jeden z nich nečte. Srovnání migrací se
skutečnou produkcí je samostatný úkol.

## Hráčský účet a Traki klíč

Hráč nemá heslo ani e-mail a neexistuje rodičovský účet ani PIN. Věk se nesbírá.

- Nový hráč zadá jen přezdívku a avatara. Na pozadí vznikne **anonymní účet
  Supabase** se stabilním `auth.users.id` a k němu řádek v `child_profiles`.
  Sloupec `parent_user_id` drží identifikátor účtu samotného hráče, jeho název je
  historický a nic o rodiči neznamená.
- Server vygeneruje **Traki klíč**: čtyři různá česká čtyřpísmenná slova ze slovníku
  `lib/recovery-words-cs.ts`, například `LAMA-MOST-KUFR-MRAK`. V databázi je uložený
  pouze `HMAC-SHA256` klíče s pepperem, ve sloupci `recovery_key_hash`. Čitelný klíč
  drží jen zařízení hráče, aby si ho mohl znovu zobrazit.
- **Přihlášení na jiném zařízení:** klíč jde na `POST /api/recovery-key/redeem`
  (10 pokusů za 15 minut na IP adresu). Server najde profil podle hashe, vygeneruje
  jednorázový odkaz na interní technický e-mail účtu (`<uuid>@players.postope.invalid`,
  nikdy se nezobrazuje ani neodesílá), klient ho vymění za session **původního** účtu
  a běžná synchronizace obnoví profil, postup, přátele i výpravy.
- Klíč jde v profilu kdykoli vygenerovat znovu, starý tím okamžitě přestane platit.
  Ztráta zařízení i klíče znamená, že profil nelze obnovit. Vědomě přijato.
- Změna slovníku neovlivní už vydané klíče, redeem slova proti slovníku neověřuje.
- Starší hráči s e-mailem a heslem se přihlásí přes „Mám starší účet“ a mohou si
  v profilu vytvořit Traki klíč. Zůstává jim stejné auth ID i profil.
- Traki klíč **není** kód kamaráda (`BAT-XXXXXX`). Ten zůstává veřejný a slouží
  jen k přidání do přátel.
- Odhlášení v profilu je pouze lokální. Ostatní zařízení téhož hráče zůstanou
  přihlášená. Zároveň se z tohoto zařízení smaže uložený čitelný klíč, což se při
  refreshi, zavření aplikace ani vypršení session nestane.

## Katalog a přístup ke hrám

- Katalog měst a her se staví **z databáze**, z tabulky `missions`. Zobrazují se jen
  publikované hry, seřazené podle `catalog_order` a názvu. Úvodní stránka je
  generovaná s revalidací po 60 sekundách.
- Jedno město může mít víc her.
- Hra může mít **herní prerekvizitu**: odemkne se až po dokončení jiné konkrétní hry.
  Prerekvizita smí odkazovat jen na hru ve **stejném městě**, což hlídá i databázové
  omezení. Hra bez prerekvizity je startovní.
- Pravidlo se vynucuje **na serveru** ve všech zapisujících herních cestách, ne jen
  v rozhraní, a je fail-closed: co nejde ověřit, je zamčené. Přímá adresa ani volání
  API zámek neobejdou.
- **Výjimka pro společné hraní:** platný přijatý účastník společné výpravy smí hrát
  tu konkrétní výpravu i tehdy, když sám prerekvizitu splněnou nemá, pokud ji splňuje
  vedoucí výpravy. Výjimka platí jen pro danou výpravu, nepublikovanou hru neodemyká
  a hru obecně za odemčenou neoznačuje. Když ale hráč tuto výpravu řádně dokončí,
  počítá se mu dokončení normálně a může mu odemknout navazující hru.

Prodej her ani jiná monetizace neexistuje. Zámek je čistě herní.

## Model hraní

```
Hra  →  Výprava  →  Zastávka  →  Úkol
```

- **Hra** je obsah v databázi: příběh, město, zastávky a úkoly. Existuje nezávisle
  na hráčích (`missions`, `mission_stops`, `mission_tasks`).
- **Výprava** je jedno konkrétní rozehrání jedné hry (`child_game_sessions`).
  Sólo hraní je výprava s jedním hráčem, společné hraní výprava s více hráči.
  Účastníci jsou v `child_game_session_players`.
- **Zastávka** je místo v terénu s jedním nebo více úkoly.
- **Úkol** je konkrétní otázka nebo aktivita.

Co v tomto modelu platí:

- Odpověď patří konkrétní výpravě (`child_task_progress.session_id`).
- Opakované hraní zakládá **novou** výpravu. Odpovědi z předchozích průchodů se
  nemažou, zůstávají u své výpravy.
- Každý hráč ve společné výpravě má vlastní odpovědi a vlastní body. Výsledek
  vedoucího se nikomu nekopíruje.
- `child_location_progress` je **nejlepší historický výsledek** hráče v dané hře,
  ne aktuální rozehrání. Nejlepší skóre se horším průchodem nezhorší.
- Body počítá **výhradně server** z uzavřených úkolů v databázi. Hodnota poslaná
  z prohlížeče se ignoruje.
- Čas dokončení určuje server.
- Hra je dokončená až tehdy, když jsou uzavřené **všechny** úkoly. Úkol se uzavře
  správnou odpovědí, tlačítkem Nevím, nebo automaticky po vyčerpání pokusů.
- Všechny úkoly uzavřené jako Nevím jsou platné dokončení za nula bodů. Body měří
  úspěšnost, dokončení znamená, že hráč hru skutečně prošel.
- Dokončení je vstupem pro odemykání navazujících her.

Historické hry mají stabilní veřejnou adresu (například `klamovka`), která se
odvozuje z identifikátoru mise, ne z jejího názvu a města. Přejmenování hry
v Mozku proto neodpojí postup hráčů. Mapa je v `lib/legacy-location-ids.ts`.

## Server a bezpečnost

- Prohlížeč nikdy nečte herní data přímo. Všechno jde přes `app/api/*` a server
  actions se service-role klíčem. Veřejný anon klíč v prohlížeči obsluhuje pouze
  Supabase Auth.
- **RLS** je zapnutá na všech tabulkách ve schématu `public`. `service_role` ji
  obchází, anonymní role nemá žádnou policy, a tedy žádný přístup. Policies pro
  přihlášené uživatele jsou vázané přes `child_profiles.parent_user_id = auth.uid()`,
  takže hráč vidí jen svá data. Deklarované jsou 1:1 v
  `supabase/migrations/0002_production_snapshot_2026-09-07.sql`.
- **Odpovědi vyhodnocuje server** (`lib/task-validation.ts`). Klient o správnosti
  nerozhoduje.
- **Bodování je serverové** a má jedinou implementaci (`lib/mission-completion.ts`).
- **Přístup ke hře** řeší `lib/game-access.ts` a `lib/game-access-server.ts`,
  fail-closed.
- **Traki klíč** je v databázi jen jako HMAC s pepperem. Čitelný klíč se nikde
  neloguje. Neplatný klíč i neznámý profil vracejí stejnou odpověď, aby nešlo
  zjistit, který klíč existuje.
- **Omezení počtu volání** je v `lib/rate-limit.ts` nad tabulkou `rate_limits`.
  Když je tabulka nedostupná, ochrana se přepne na paměťový limiter a endpoint
  zůstane chráněný, místo aby selhal.
- **Mozek** (`/mozek`, historicky i `/admin`) je za basic auth v `middleware.ts`
  a je vyloučený z indexace.

## Mozek

Editor obsahu na adrese `/mozek`, chráněný HTTP Basic (`ADMIN_BASIC_USER`,
`ADMIN_BASIC_PASS`). `/mozek/*` re-exportuje implementaci z `/admin/*`; samotná
adresa `/admin` je middlewarem skrytá (404). Tohle rozdělení je záměrné.

Novou hru dnes jde vytvořit, zkontrolovat a publikovat celou v Mozku, bez zásahu
do kódu, Gitu nebo Supabase: města, hry, zastávky, úkoly, nápovědy, přechodové
texty, obrázky, pořadí, náhled a publikace.

Co drží obsah pohromadě:

- **Publikace má serverovou kontrolu hratelnosti.** Hru bez zastávek, bez úkolů,
  bez správných odpovědí, bez titulního obrázku nebo bez závěru publikovat nejde.
  Hlášky pojmenují konkrétní zastávku i číslo úkolu.
- **Zkontrolovat hru** pouští tatáž pravidla, ale nic nezveřejňuje – autor zjistí,
  co hře chybí, bez rizika publikace.
- **Mazání je dvoukrokové** u hry, zastávky i úkolu; u zastávky se říká, že zmizí
  i její úkoly. Odehraný obsah server smazat nedovolí vůbec.
- **Pořadí se ovládá šipkami**, ruční čísla se nezadávají a server je dopočítá tak,
  aby nevznikla duplicita.
- **Neuložené změny** jsou vidět a odchod z rozepsané stránky se ptá. Autosave není.
- **Náhled** je kontrolní arch pro autora včetně správných odpovědí. Nezakládá
  výpravu, nepočítá body a hráči ho nevidí.

## Příkazy

| Příkaz | Co dělá |
| --- | --- |
| `npm run dev` | vývojový server |
| `npm run build` | produkční build |
| `npm run typecheck` | `tsc --noEmit` nad celým repozitářem včetně testů |
| `npm test` | testy herní logiky (`lib/*.test.ts`) |
| `npm run lint` | ESLint |
| `npm run env:pull` | stažení `.env.local` z Vercelu |

V `package.json` jsou navíc pomocné skripty pro jednorázové kontroly a přepočty
(`verify:runtime-readonly`, `score:migrate:dry-run`, `score:migrate:apply`).
Přepočty se nespouštějí bez samostatného schválení.

CI (`.github/workflows/ci.yml`) pouští typecheck, lint, testy a build nad každým
pushem do `main` a nad každým pull requestem. Build v CI běží se zástupnými
hodnotami Supabase, protože skutečné klíče se čtou až za běhu požadavku.

## Co zatím není hotové

Aby dokumentace neslibovala víc, než aplikace umí. Ověřeno k 13. 9. 2026:

- **Obsah.** Publikovaná je jediná hra. Druhá je rozepsaná a publikace ji
  nepustí ven, dokud nebude dohraná (viz [Stav projektu](#stav-projektu-13-9-2026)).
- **Skutečný provoz.** Aplikaci zatím nehrál žádný opravdový hráč. Všechno, co je
  ověřené, se testovalo syntetickými profily.
- **Žádný monitoring.** Chyba v produkci nikoho neupozorní, skončí jen v logu Vercelu.
- **Společná výprava.** Server umí celou smyčku od založení po ukončení, ale
  aplikace pro ni nemá ovládání. Pozvání kamaráda do konkrétní hry je odložené.
- **Offline hraní neexistuje.** Service worker (`traki-na-stope-v6`) cachuje jen
  aplikační obal. Obsah hry se do zařízení nestahuje, odpovědi se bez signálu
  neukládají a fronta k pozdějšímu odeslání není. Datový model je na to připravený,
  funkce ne.
- **Souběžné hraní na dvou zařízeních** nemá finální pravidlo.
- **Mozek:** chybí náhled očima hráče, nápověda k odpovědím se opakuje u každého
  úkolu a vyměněné obrázky zůstávají v úložišti jako osiřelé soubory.
- **Odmítnutá registrace** nechá v `auth.users` prázdný anonymní účet – validace
  délky přezdívky běží až po jeho vytvoření.
- **Globální žebříček** načte všechny profily a až pak je ořízne na TOP 20. Při
  dnešním objemu to nevadí, při stovkách hráčů bude.

### Co už naopak hotové je

Dřívější verze tohoto dokumentu uváděla jako chybějící i věci, které od té doby
vznikly. Pro pořádek:

- **Nápovědy** fungují. Text se spravuje v Mozku a otevřená nápověda sníží odměnu
  za úkol z 10 na 5 bodů (`POINTS_PER_TASK_WITH_HINT`).
- **Správné odpovědi se do prohlížeče neposílají.** `toPublicTask` odstraňuje
  `correctAnswers` i `hintText` (`SERVER_ONLY_TASK_FIELDS`).
- **Pořadí úkolů vynucuje server**, ne rozhraní – přeskočení adresou vrátí
  `task_out_of_order`.
- **Výprava vzniká vědomým zahájením hry**, ne až první odpovědí, a hráč jich může
  mít rozehraných víc najednou.
- **Profil staví seznam her z databáze**, ne z obsahu v kódu, a ukazuje rozehrané
  i dokončené hry.
- **`lib/mock-data.ts` v repozitáři není.** Zbylé zmínky v komentářích jen
  popisují historii; produkční cesta obsah v kódu nepoužívá.

## supabase/legacy

Historické SQL soubory, které už **neodpovídají** stavu aplikace a nemají se
spouštět. `schema.sql` a `seed.sql` zakládají tabulky (`cities`, `locations`,
`tasks`, `profiles`, `user_progress`, `friendships`), na které v kódu nic nesahá.
`0002_rls_NEAPLIKOVAT.sql` je zavržená migrace postavená na chybném předpokladu,
že produkce nemá RLS. Nikdy ji nespouštět, důvod je v hlavičce souboru. Složka
zůstává jen kvůli dohledatelnosti.
