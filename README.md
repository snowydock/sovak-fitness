# Sovak Fitness

A month-by-month record of Mike's training, nutrition, and body composition, with a phone-first dashboard.

**Dashboard:** https://snowydock.github.io/sovak-fitness/ (add to iPhone home screen: Share → Add to Home Screen)

## How it works

Mike logs each day in the app (Today + Lift tabs); every save commits to `log/YYYY-MM.json`. Daily coaching happens in a dedicated Claude chat each month, which reads that file. At month close the log is folded into the clean CSVs.

```
program.md          The living rulebook: targets, split, next weights, rules
data/daily.csv      One row per day: weight, calories, macros, sodium, steps, day type, activity
data/lifts.csv      One row per set: date, session, exercise, weight, set, reps, set type
data/body.csv       Monthly body comp: weight, Hume BF%, waist
data/phases.csv     Cuts, maintenance, trips, with their targets
months/YYYY-MM.md   Written review of each month
prompts/YYYY-MM.md  The prompt that opens each month's chat
data/program.json   Session templates, rep ranges, increments (drives the Lift tab's targets)
log/YYYY-MM.json    Open-month daily entries written by the app (one key per date)
log/img/            Food screenshots uploaded from the app
index.html, js/     The app: Today (log), Lift, Trends (dashboard)
```

### The app

- **Today:** weigh-in, steps, food (import a LoseIt report PDF and every day in it fills in at once; or paste the LoseIt web page with Ctrl+A for macros, foods and steps; or attach screenshots and type calories + protein), day type (normal / light social / heavy social / travel), activity, notes, monthly Hume BF% and waist. Any date, past or future: mark a social day ahead of time.
- **Lift:** suggests the next session (whichever was done longest ago), prefills each exercise with a target weight from the progression rule, shows last time's sets. Or paste an Apple Notes block.
- **Trends:** the dashboard. Merges closed-month CSVs with the open month's log.
- **Saving** needs a fine-grained GitHub token limited to this repo with Contents: Read and write, pasted once via the gear icon. Stored on the phone only. Unsaved edits are kept on the phone as drafts.

## Data sources

| What | Source | When |
|---|---|---|
| Food, macros | LoseIt, pasted or typed into the app | Daily |
| Weight, steps | Typed into the app (Hume, Apple Health) | Daily |
| Steps | Apple Health via LoseIt screenshots | Daily |
| Lifts | Lift tab in the app (Apple Notes paste still works) | Per session |
| Body fat % | Hume, one reading on the 1st | Monthly |
| Waist | Tape at the navel, relaxed, morning | Monthly |

## Month-close routine (1st of each month)

1. Log Hume BF% and waist in the app on the 1st (Monthly check-in). Optionally paste the LoseIt weekly PDFs in the chat to cross-check.
2. Claude folds `log/YYYY-MM.json` into the CSVs, writes `months/YYYY-MM.md`, updates `program.md` and `data/program.json` (next weights, templates), and writes `prompts/` for the next month.
3. Commit. The dashboard updates on its own.
4. Start the next month's chat with the new prompt.

## Column conventions

- `day_type`: `normal`, `light_social`, `heavy_social`, `travel`
- `set_type`: `working` or `drop`
- `weight_lb` of `0` in lifts = bodyweight movement
- Blank cell = not measured (never zero-filled)
