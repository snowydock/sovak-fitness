---
name: "calest"
description: "Food calorie and macro estimate. Use for /calest, 'calorie estimate', 'estimate' about food, or any food photo sent with little or no text."
---

# /calest — Calorie & Macro Estimate

This is a NUTRITION skill. It has nothing to do with calendars, scheduling, or the /cal skill.

## When to use
- Mike types `/calest`, "calorie estimate", "cal estimate", or "estimate" about food.
- Mike sends a food photo with no text, or only a few words ("lunch", "this").
- A text description of a meal counts too ("/calest 2 eggs, toast, avocado").

## Step 1: check Mike's food library first
Before estimating anything, load Mike's food library:
https://raw.githubusercontent.com/snowydock/sovak-fitness/main/data/foods.json
(If the sovak-fitness repo is cloned locally, read data/foods.json instead.)

- Match each item in the meal against `name` and `loseit_names`. Mike's repeat foods, his The Sovak Kitchen (TSK) recipes, the chains he uses and his usual drinks are all in it.
- For a match, use the library numbers scaled to the portion. `serving` is the base amount; `per` (e.g. {"g": 100}) means scale by that unit. Library kcal is what Mike logs and wins over any other source.
- If he names a TSK recipe that is not in the library, read https://raw.githubusercontent.com/snowydock/sovak-kitchen/main/recipes.json and use that recipe's per-serving numbers.
- For a chain restaurant item not in the library, look up the chain's official published nutrition. This is the only web lookup this skill does.
- Everything else is a pure estimate from the photo or description.

## Step 2: estimate the rest (calibration)
Give one best estimate aimed at the true amount: don't pad it to be safe and don't shave it to be kind.
- Photo-based estimates tend to miss calories mostly through hidden fat, so account for it explicitly instead of adding a blanket percentage: for restaurant and takeout food assume restaurant portions and typical oil, butter, sauce, dressing and cheese, and name the biggest one in the context line.
- Home food with a known recipe or label: use it as is.
- If program.md in the sovak-fitness repo lists an estimate adjustment from a month close (logged intake vs. the scale trend), apply it to estimated items only, never to library items.

## Step 3: meal label (never guess from the clock)
Record the time Mike sent the message, but don't pick a meal from it. Use a meal label only when Mike gives one ("lunch", "this was dinner") or the food's own name makes it obvious. Labels: Breakfast, Lunch, Snacks, Dinner, Late night, Booze. Any alcoholic drink is Booze. With no label, log it with the time only; the app lists it under Other. If Mike names the meal later, move it.

## Step 4: log it (only where the repo can be written)
If this session can push to the snowydock/sovak-fitness repo (a clone with push access), log every estimate unless Mike says "just estimate":
1. `git pull`, then run `python3 tools/log_food.py '<json>'` with date, time, meal (only if Mike named it), name, qty, kcal, protein, carbs, fat, fiber, sodium, `basis` ("library" or "estimate") and `food_id` for library matches. One item per call; a combined plate can be one item.
2. Commit as "log: <date> <meal> via Claude" and push. If the push is rejected, pull and retry once.
3. Add one line under the output: `Logged → 11/22 Dinner · day 1,840 kcal · 151 g P`.
4. If the day already has food from a LoseIt import, the tool refuses: tell Mike and don't mix sources for that day.
In a regular chat that can't push, skip this step and end with: `Not logged (this chat can't write to your log).`

## Output format
1. A short bold title for the meal (2–5 words).
2. Six lines, number leading each, in this order: calories, fat, carb, protein, fiber, sodium.
3. A time line, with the meal only if Mike named it: `Lunch · 12:40 PM` or `12:40 PM`.
4. A blank line, then 1–2 short lines of context: what you identified, which items came from the library, and the portion/prep assumptions that drive the number most.

```
**Meal Title**
### cal
##g fat
##g carb
##g protein
##g fiber
####mg sodium
Lunch · 12:40 PM

Context line 1.
Context line 2 (optional).
```

## Rules
1. Title first, then numbers. No intro or other text before the title.
2. One best estimate per line, not ranges.
3. Round calories to the nearest 10; macros and fiber to whole grams; sodium to the nearest 10mg (comma at 1,000+).
4. Keep the math consistent: (fat × 9) + (carb × 4) + (protein × 4) within ~10% of calories (alcohol adds calories outside this check). Fiber is inside total carbs.
5. Sodium: restaurant, takeout, processed, cured, and sauced foods run high. Sauces, dressings, soy sauce, cheese, and cured meats are the usual swing factors.
6. Multiple items or a full plate → one combined total, with a title covering the whole meal.
7. Judge portions from visual cues (plate size, utensils, hands, packaging). For restaurant food, assume restaurant portions and typical oil/butter.
8. Context lines: max 2, short, mobile-friendly. Say which items came from the library, and name the biggest swing factor.
9. If Mike corrects a portion or adds detail, redo the full output in the same format.
10. If the photo isn't food or is too unclear, say so in one sentence and ask what it is.
11. If Mike says a food is a new regular, tell him it can be added to the library at the next check-in or month close.
