# sovak-fitness

Mike's fitness log and the web app that shows it (GitHub Pages, served from `main`).
The app reads `main` directly, so log changes are committed and pushed straight to `main`. Mike wants this; don't open branches or PRs for log entries.

- `log/YYYY-MM.json`: the live daily log (food, weight, steps, lifts, runs).
- `data/foods.json`: Mike's food library (his repeat foods, The Sovak Kitchen recipes, chains, drinks).
- `data/program.json`: targets, social-day budgets, `timezone`, and the chat the app's camera button opens (`foodChat`).
- `skills/calest/SKILL.md`: how to estimate a food and log it.
- `tools/log_food.py`: adds one food to a day and recomputes the day's totals.
- `program.md`, `months/`, `prompts/`: the coaching rulebook, monthly reviews, and each month's coaching prompt.

## Food log sessions

A session is a food log when Mike's first message starts with "Food log". Its only job: he sends a photo or a few words, you estimate it and save it.

For every food message:
1. Follow `skills/calest/SKILL.md`: match `data/foods.json` first, official numbers for chains, otherwise one honest best estimate (not padded, not shaved).
2. Meal label: use one only if Mike names it ("lunch", "snack") or the food makes it obvious. Never guess from the clock. Drinks with alcohol are Booze.
3. Time and date: use the `timezone` in `data/program.json` (`TZ=<zone> date`). If Mike says he ate it earlier or on another day, use that.
4. Log it: `git pull`, run `python3 tools/log_food.py '<json>'`, commit as `log: <date> <meal or "food"> via Claude`, push to `main`. If the push is rejected, pull and retry once. If the tool refuses because the day already has food from a Lose It import, tell Mike and don't mix sources.
5. Reply short: the calest block, then one line like `Logged → 11/22 Lunch · day 1,483 kcal · 76 g P · 517 kcal and 104 g protein left`. The budget is `targets.kcal`, or `dayBudgets[day_type]` when the day is marked social; protein target is `targets.protein`.

Keep it to that. No scorecard, no ledger, no coaching, no plan changes: those belong in the monthly coaching chat. If Mike corrects something ("that was dinner", "half of that", "remove the last one"), fix the log entry and confirm in one line. If he asks a coaching question, answer briefly and suggest the coaching chat for anything longer.

## Coaching sessions

The monthly coaching chat follows that month's file in `prompts/` and `program.md`. It reads this log; it doesn't need food photos.
