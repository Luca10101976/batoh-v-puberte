# Recalculate Historical Scores

Jednorázový migrační skript pro přepočet historických dokončených her na nový scoring model:

- správný úkol = 10 bodů
- `Nevím` = 0 bodů
- maximum hry = počet úkolů × 10

## Potřebné env proměnné

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Skript čte produkční data přímo ze Supabase a zapisuje jen v `--apply` režimu.

## Spuštění dry-run

```bash
npm run score:migrate:dry-run
```

Dry-run:
- nic nezapisuje
- pro každý historicky dokončený výsledek vypíše:
  - `profile_code`
  - `profile_id`
  - `location_id`
  - počet tasků
  - počet `correct` tasků
  - starý a nový `best_score`
  - staré a nové `penalty_points`
  - `status = would_update / unchanged / skipped`
  - `reason_if_skipped`

## Spuštění apply

```bash
npm run score:migrate:apply
```

Apply:
- updatuje jen řádky označené jako bezpečné (`would_update`)
- nastaví:
  - `best_score = correctCount × 10`
  - `penalty_points = maxScore - best_score`
- nemění:
  - `first_completed_at`
  - `completed_at`
  - `status`
  - unlock data
  - task progress

## Co zkontrolovat před apply

1. `skipped = 0`
2. `reason_if_skipped` je prázdné u všech řádků, které chcete migrovat
3. `new_best_score` dává smysl vzhledem k `correct_count`
4. `new_penalty_points` odpovídá `maxScore - newBestScore`
5. `would_update` obsahuje jen řádky, které opravdu chcete přepsat

## Bezpečnostní guardy

Skript nikdy neupdatuje řádek, pokud:
- chybí `child_task_progress`
- existují duplicitní task progress řádky
- tasky v progressu neodpovídají aktuálním taskům hry
- existuje `wrong` jako nefinální historický stav
- řádek reprezentuje aktivní replay (`status = in_progress` + historické dokončení)
