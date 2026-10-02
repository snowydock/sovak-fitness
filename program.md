# Program

The living rulebook. Updated at each month close. Every new monthly chat reads this first.

_Last updated: 2026-10-01_

## Who and what

- Mike, 30, 5'10". Started tracking this program 2026-09-16 at 178.5 lb.
- Hume body fat 22.2% on 2026-10-01 (monthly reading only; the daily number is noise).
- **Goal:** aesthetics and strength. Big shoulders, strong arms, a tapered waist. Not stage balance. Traps and calves are deliberately ignored.
- **Long-term target:** ~15% body fat, roughly 163–165 lb at current lean mass. Realistic calendar: 6–9 months with maintenance breaks.
- **Scoreboard:** 7-day trend weight, monthly waist at the navel, monthly Hume BF%, and lift progression. Never a single day's weigh-in.

## Current phase

| | |
|---|---|
| Phase | Cut, 2,050 flat (through 2026-10-12) |
| Calories | 2,050/day |
| Protein | 180 g/day (160 g floor on social days) |
| Steps | 10,000/day |
| Lifts | 3 sessions/week |
| Next | Switzerland 10/13–10/20 at maintenance, then reassess |

### Maintenance estimate

- **Assumed going in:** 2,900.
- **September data says lower.** Weight was roughly flat on 2,467 kcal/day average (smoothed trend 178.5 → 178.65 over 15 days).
- **Working estimate: ~2,400–2,500. Low confidence.** Two heavy weekends of water make it noisy.
- **Implication:** 2,050 is likely a ~350–450 kcal/day deficit (~0.7–0.9 lb/week), not 850.
- **Action:** recalculate by Oct 12 from a clean stretch. If confirmed, targets stay at 2,050 but expectations reset. Do not drop below 2,000 to chase speed.

## Training: Upper A → Lower → Upper B (rotate)

Equipment: DBs to 50 lb, squat rack + barbell, cable machine, press machine, leg press, leg curl/extension.

**Upper A**
- Incline DB Press 3×8–12
- Machine OHP 3×8–12
- Lat Pulldown 3×8–12
- Cable Lateral Raise 4×12–15
- Overhead Cable Tricep Ext 3×10–15 ⟷ Incline DB Curl 3×10–12 (superset)
- Face Pull 2×15–20

**Lower**
- Barbell Back Squat 3×6–10 (do it first; rack gets taken. Backup: Bulgarian split squat)
- RDL 3×8–10
- Leg Press 2×12–15
- Leg Curl 3×12–15
- Leg Extension 2×12–15
- Ab Wheel 3×10
- Lateral Raise finisher 3×15–20

**Upper B**
- Machine Bench 3×8–12
- Seated Cable Row 3×10–12
- Straight-Arm Pulldown 3×12–15
- DB Lateral Raise 4×12–20, drop on last set
- Tricep Pushdown 3×10–12 ⟷ Hammer Curl 3×10–12 (superset)
- Concentration Curl 2×AMRAP + drop

**Progression:** top of the rep range on every set → add weight next session. DBs already at 50 → add reps, slow eccentrics, pauses.

### Next working weights (as of 2026-10-01)

| Exercise | Next | Note |
|---|---|---|
| Barbell Back Squat | 145 | push to 10s |
| RDL | 150 | up from 140 |
| Leg Press | 220 | log both sets |
| Leg Curl | 100 | get set 1 to 15 |
| Leg Extension | 120 | up from 110 |
| Machine Bench | 170 | up from 160 |
| Seated Cable Row | 90 | up from 85 |
| Straight-Arm Pulldown | 90 | up from 80 |
| Machine OHP | 100 | up from 90 |
| Incline DB Press | 35 | get all sets to 12 |
| Lat Pulldown | 100 | log all 3 sets |
| Cable Lateral Raise | 20 | reach 12+ every set |
| DB Lateral Raise | 20 | all 4 sets near 20 |
| Overhead Tricep Ext | 50 → 55 if set 3 hits 15 | |
| Tricep Pushdown | 100 | push to 12s |
| Hammer Curl | 30 | up from 25 |
| Incline DB Curl | 20 | push to 12s |
| Concentration Curl | 20 | AMRAP + drop to 15 |

## Rules of the road

1. **Weekly math beats daily math.** One big day shrinks a week's deficit; it doesn't erase it.
2. **Name the size of a social day before it starts** (light: fits inside 2,050 / heavy: budgeted). Two September weekends grew past what was planned. That's a sizing problem, not willpower.
3. **Protein first on social days.** 100 g+ before going out. September's worst miss was a 95 g day.
4. **Decide about late-night food while sober.** Both September overruns were post-bar food, not drinks.
5. **No compensation.** The day after a big day is a normal day at target, never below it.
6. **Steps are the easy lever.** Walking to dinner counts.
7. **Step bank:** ±35 kcal per 1,000 steps vs 10k, capped at ±400/week, spent on social days.
8. **Lift guardrail:** flag only if 0 sessions by Thursday end of day, or fewer than 3 by Sunday. Lifts often land late in the week; that's fine.
9. **Scale spikes after heavy carb/sodium/alcohol days or new lifts are water.** Judge on the trend, check again 3–4 days later.
10. **Thursday flag football** raises real maintenance; never eat it back.
11. **Data hierarchy:** the app's log file is the record. LoseIt is the source for food. The chat ledger is a backup.

## Daily check-in format

Mike logs the day in the app (LoseIt daily report PDF for food, weight and steps; day type, activity, lifts, notes). Each save commits to `log/YYYY-MM.json`. In the monthly chat he pastes the "Check-in · …" block from the app's Copy for Claude button (day totals, foods, lift with ↑ marks for weight increases, week-so-far line), or says "logged" and the coach reads the log file. The coach then replies with: scorecard table → verdict (praise or tough love, patterns not single days) → one focus for today → the ledger.

Future days in the log with `day_type` set to a social day are advance notice: size them before they happen.

## Month close

1st of each month: fold `log/YYYY-MM.json` into the CSVs (Hume BF% and waist come from the 1st's Monthly check-in), write the month review in `months/`, update this file and `data/program.json`, write next month's prompt in `prompts/`.
