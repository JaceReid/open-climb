# Plan format (`open-climb-plan`, version 1)

open-climb imports training plans as a single JSON object. The format is designed for an LLM to write: references are
by readable id or name, nulls are ignored, and mistakes are reported with the exact path.

The source of truth is [src/lib/import/schema.ts](../src/lib/import/schema.ts). The prompt the app gives Claude is in
[claude-prompt.md](claude-prompt.md), and a complete example is in [src/lib/import/example.ts](../src/lib/import/example.ts).

## Shape

```jsonc
{
  "format": "open-climb-plan",   // optional
  "version": 1,                  // optional
  "planId": "pl-…",              // optional: update this existing plan in place (from "Adjust with Claude")
  "plan": {                      // required when "blocks" is present
    "name": "Autumn Finger Strength",
    "description": "…",          // optional
    "goal": "Send 7B by December", // optional
    "startDate": "2026-10-12"    // optional; snapped to that week's Monday
  },
  "exercises": [ … ],            // optional: only exercises missing from the library
  "workouts": [ … ],             // optional
  "blocks": [ … ]                // optional
}
```

A file with only `workouts` and/or `exercises` imports them into the library without creating a plan.

### Updating an existing plan

**Adjust with Claude** (on a plan's page, or Settings) gives Claude the plan in this format with its `planId`, plus
the training log. When the reply keeps that `planId`, importing it offers **Update plan**. This replaces the plan's
blocks and schedule but keeps its id, start date and active state, and sessions already logged stay ticked off when the
new schedule has the same workout on that date. Workouts in the file whose `id` already exists (the plan's own
workouts are exported with their ids) are updated in place instead of duplicated.

### Exercise

| Field | Type | Notes |
|---|---|---|
| `id` | string | Referenced from workout items in the same file. |
| `name` | string | If an exercise with the same name already exists, that one is reused. |
| `category` | `fingerboard` · `bouldering` · `routes` · `campus` · `strength` · `antagonist` · `core` · `mobility` · `other` | Unknown values become `other`. |
| `type` | `finger-strength` · `strength` · `power` · `power-endurance` · `endurance` · `technique` · `prehab` · `mobility` · `other` | Optional. What the exercise trains; drives the Progress tab's training-mix chart. If omitted, it's guessed from `category`. |
| `tracks` | array of `weight` · `reps` · `duration` · `grade` · `location` · `discipline` | What the log asks for per set. `location` is indoor/outdoor and `discipline` is boulder/route (as on Open Climbing). |
| `bodyweight` | boolean | `true` if `weightKg` is added to bodyweight (hangs, pull-ups). Enables the % bodyweight chart. |
| `description`, `instructions`, `equipment` | string | Optional. |

### Workout

| Field | Type | Notes |
|---|---|---|
| `id` | string | Referenced from block schedules in the same file. |
| `name` | string | |
| `focus`, `description` | string | Optional. |
| `items` | Item[] | In order, at least one. |
| `test` | boolean | A max-test day. Starting it opens the test flow for its weighted items (5 s holds for hangs/edge lifts, 1–5 rep max for lifts); the other items are the warm-up. Built-ins: `wo-test-max-hang`, `wo-test-edge-lift`, `wo-test-pullup`. |

### Item (an exercise inside a workout)

| Field | Type | Notes |
|---|---|---|
| `exercise` | string | Library id (e.g. `max-hangs`), an id from `exercises`, or an exercise name. Unknown names create a placeholder exercise and show a warning. |
| `sets`, `reps` | integer | Default 1. For timed work, `reps` is the number of efforts per set (repeaters: 6). |
| `workSec` | number | Seconds per rep for timed work. Omit for normal reps: the timer then waits for "Done". |
| `restSec` | number | Rest between reps inside a set. |
| `setRestSec` | number | Rest between sets. |
| `weightKg` | number | Kilograms. Added weight for bodyweight exercises; negative means assisted. |
| `pctOfMax` | number | Working weight as a % of the latest tested max, e.g. `80`. For bodyweight exercises it's % of total load (bodyweight + added). Replaces `weightKg` once a max has been tested; until then `weightKg` is used. |
| `intensity`, `grip`, `notes` | string | e.g. `"RPE 8"`, `"half crimp"`, `"add 2 kg/week if clean"`. |
| `edgeMm` | number | Edge depth. |
| `setLabels` | string[] | Per-set labels, e.g. grips: `["half crimp", "front three", "open hand"]`. Cycled if there are more sets than labels; shown in the timer and recorded with each set. |

### Block

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `weeks` | integer | 1–52. Blocks run back to back in file order. |
| `schedule` | Day[] | Repeated every week of the block. |
| `weekOverrides` | `{ week, schedule }[]` | Replaces `schedule` for specific 1-based weeks (deloads, test weeks, progressions). |
| `focus`, `notes` | string | Optional. |

### Day

| Field | Type | Notes |
|---|---|---|
| `day` | `mon` … `sun` | Full names (`"Monday"`) and numbers 1–7 (Mon = 1) also work. |
| `workouts` | string[] | Workout ids or names, from this file or the library (e.g. `wo-limit-bouldering`). `"workout": "id"` is accepted as a shorthand. |
| `notes` | string | Optional; shown on the Today screen. |

## Built-in ids

Built-in exercise ids are listed in [claude-prompt.md](claude-prompt.md). They are stable: they're never renamed, so old
plan files keep importing.
