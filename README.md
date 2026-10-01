# Sovak Fitness

A month-by-month record of Mike's training, nutrition, and body composition, with a phone-first dashboard.

**Dashboard:** https://snowydock.github.io/sovak-fitness/ (add to iPhone home screen: Share → Add to Home Screen)

## How it works

Daily coaching happens in a dedicated Claude chat each month. This repo holds the clean, finished record, committed once a month.

```
program.md          The living rulebook: targets, split, next weights, rules
data/daily.csv      One row per day: weight, calories, macros, sodium, steps, day type, activity
data/lifts.csv      One row per set: date, session, exercise, weight, set, reps, set type
data/body.csv       Monthly body comp: weight, Hume BF%, waist
data/phases.csv     Cuts, maintenance, trips, with their targets
months/YYYY-MM.md   Written review of each month
prompts/YYYY-MM.md  The prompt that opens each month's chat
index.html          The dashboard (reads the CSVs directly)
```

## Data sources

| What | Source | When |
|---|---|---|
| Food, macros, weight | LoseIt (weekly PDF reports are the source of truth) | Daily, reconciled monthly |
| Steps | Apple Health via LoseIt screenshots | Daily |
| Lifts | Apple Notes blocks pasted into chat | Per session |
| Body fat % | Hume, one reading on the 1st | Monthly |
| Waist | Tape at the navel, relaxed, morning | Monthly |

## Month-close routine (1st of each month)

1. In the month's chat, paste the LoseIt weekly PDFs, the Hume BF% reading, and a waist measurement.
2. Claude appends rows to the CSVs, writes `months/YYYY-MM.md`, updates `program.md`, and writes `prompts/` for the next month.
3. Commit. The dashboard updates on its own.
4. Start the next month's chat with the new prompt.

## Column conventions

- `day_type`: `normal`, `light_social`, `heavy_social`, `travel`
- `set_type`: `working` or `drop`
- `weight_lb` of `0` in lifts = bodyweight movement
- Blank cell = not measured (never zero-filled)
