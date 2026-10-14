This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## open-climb conventions

open-climb is a Crimpd/Lattice-style climbing training app (Android first). All data is local SQLite; there is no server.

- **Layers:** `src/lib` is pure TypeScript with no React Native imports, so it is unit-tested with vitest (`npm test`). Put logic there, and keep screens thin.
- **Database:** `src/db/migrations.ts` holds append-only migrations, tracked with `PRAGMA user_version`. A migration is SQL, or a function for data backfills. Never edit a shipped migration. `src/db/migrations.test.ts` runs them against Node's built-in SQLite, so add a test for each new migration. All reads and writes go through `src/db/repo.ts`, and writes must call `notifyChange()` so every `useQuery()` refetches.
- **Training time:** each session stores `duration_sec` (the timer's real time, an estimate, or the user's correction), and each set stores `est_sec` (its share from the prescription, rests included). The Progress mix splits a session's duration across its sets by `est_sec` (`lib/analytics.ts`). Every exercise has a training `type`, which drives that chart.
- **Max tests:** `max_tests` holds one row per tested exercise; the latest is the current max (`lib/maxtest.ts`). Holds (hangs, edge lifts) and 1–5 rep tests (estimated 1RM) are supported. Bodyweight exercises work on total load: working = pct × (bodyweight + max) − bodyweight. Workout items with `pctOfMax` get their weight from `applyMaxes()`. Apply it wherever weights are shown or prefilled. Workouts with `test: true` open `/test/run` instead of the timer.
- **Claude round trip:** `lib/import/review.ts` exports a plan (`planToFile`, with `planId`) and a Markdown training log; `db/claude.ts` assembles the prompt. An import whose `planId` matches an existing plan goes through `applyPlanUpdate`, which replaces the blocks and re-links logged sessions by date and workout. Workouts in an import with an existing id are updated in place. `src/db/repo.test.ts` covers this.
- **Units:** weights are stored in kg and converted only for display (`lib/format.ts`). Dates are local `YYYY-MM-DD` strings (`lib/dates.ts`), and weeks start on Monday.
- **Library ids are public API:** Claude-written plans reference ids from `src/data/library.ts`. Never rename or remove one; add new ones. Users can edit library items in place. In the DB, `built_in = 1` means "identical to the bundled version": re-seeding only updates those rows, edited rows get `built_in = 0`, and "Reset to library version" restores them. Library ids can't be deleted. Use `exerciseOrigin()` / `workoutOrigin()` for library/edited/custom, not `builtIn`.
- **Import format:** `src/lib/import/schema.ts` must stay backwards compatible. If the prompt changes, run `UPDATE_DOCS=1 npm test` to regenerate `docs/claude-prompt.md`, and update `docs/plan-format.md` as well.
- **Charts:** use one measure per chart (no dual axes). Series colours are in `constants/theme.ts`, validated against `surface` in both themes.
- Before finishing, run `npm test`, `npm run typecheck` and `npm run lint`.
