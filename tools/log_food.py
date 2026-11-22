#!/usr/bin/env python3
"""Add one food item to a day in log/YYYY-MM.json and recompute that day's food totals.

Usage: python3 tools/log_food.py '{"date":"2026-11-22","time":"6:40 PM","meal":"Dinner",
        "name":"Chicken rice bowl","qty":"1 bowl","kcal":650,"protein":45,"carbs":60,"fat":22,
        "fiber":5,"sodium":1100,"basis":"library|estimate","food_id":"tsk-..."}'
Totals are the sum of the day's items, so the day matches what was logged. Food logged this way
gets source "claude", which the app labels "from Claude" and protects from LoseIt imports.
"""
import json, sys, datetime, pathlib
MEALS = ["Breakfast", "Lunch", "Snacks", "Dinner", "Late night", "Booze"]
it = json.loads(sys.argv[1]); date = it.pop("date")
assert it.get("meal") in MEALS + [None], f"meal must be one of {MEALS} or omitted"
p = pathlib.Path(__file__).resolve().parent.parent / "log" / f"{date[:7]}.json"
doc = json.loads(p.read_text()) if p.exists() else {"month": date[:7], "days": {}}
day = doc["days"].setdefault(date, {})
food = day.get("food") or {}
if food.get("source") not in (None, "claude"):
    sys.exit(f"{date} already has food from {food.get('source')}; not mixing sources. Clear it first.")
items = food.get("items", []) + [it]
food = {"source": "claude", "items": items}
for k in ["kcal", "protein", "carbs", "fat", "fiber", "sodium"]:
    vals = [i.get(k) for i in items if i.get(k) is not None]
    if vals: food[k] = round(sum(vals))
day["food"] = food
day["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
doc["days"] = dict(sorted(doc["days"].items()))
p.write_text(json.dumps(doc, indent=2) + "\n")
print(f"{date}: {len(items)} items · {food.get('kcal')} kcal · {food.get('protein')} g P")
