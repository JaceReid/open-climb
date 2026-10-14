# open-climb

An open source climbing training app for your phone, in the spirit of Crimpd and Lattice. Plan training blocks, follow
guided hangboard and strength timers, log what you did and watch your numbers go up. Write your plan with Claude (or
any LLM) and load it straight into the app.

All data stays on your device. No account, no server.

## Features

- **Library:** 40+ common climbing exercises (max hangs, repeaters, limit bouldering, 4x4s, ARC, campus, weighted
  pull-ups, antagonists, core) and ready-made workouts. Edit anything, built-ins included (and reset them to the
  original later), or add your own. Long-press an item in the Library to jump straight to editing it.
- **Training plans:** a plan is a sequence of blocks (e.g. 4 weeks strength → 3 weeks power endurance → 1 week deload),
  each with a Monday–Sunday schedule. Start a plan on any week and the Today screen shows what's on.
- **Guided timer:** full-screen hang/rest/set-rest countdowns with beeps, voice cues, vibration and keep-awake. Timed
  efforts count down; rep-based sets wait for you to tap Done. Pause, skip, or add 15s to a rest.
- **Logging:** every session is pre-filled from the workout, so logging is mostly ticking sets. Adjust weight, reps,
  time or Font grade per set, and add RPE and notes. Swapped an exercise on the day? Add or remove exercises in the
  log, or log a single exercise straight from its info page. You can log past sessions too.
- **Max tests & working weights:** test max hangs and edge lifts (5 s holds) or weighted pull-ups and lifts (1–5 rep
  max, converted to an estimated 1RM) with a built-in hold and rest timer. Workouts can prescribe load as "% of max"
  (e.g. 80%, of total load for hangs and pull-ups), and the weight fills in automatically. Test workouts can be
  scheduled in plans.
- **Progress charts:** per-exercise charts of top added weight, total load as % of bodyweight, estimated 1RM
  (Epley), hardest Font grade, or longest effort. Tap a chart to inspect any point.
- **Import from Claude:** see below.

## Planning with Claude

1. Plan your training in a normal Claude chat: goals, schedule, current level, injuries.
2. In the app, open **Settings → Plan with Claude** and tap **Copy prompt** (or **Share** to send it straight to the
   Claude app), then paste it into that chat. The prompt explains the [plan format](docs/plan-format.md) and lists
   every exercise and workout in your library by id, so Claude reuses them.
3. Copy Claude's JSON reply, go to **Plans → Import plan**, and tap **Paste** (or save the reply as a `.json` file
   and tap **Open file**).
4. Check the preview, tap **Import plan**, and pick the week it starts.

If something is wrong, the app lists the exact field (e.g. `blocks[0].schedule[2].day: unknown day "Funday"`). Paste
the errors back to Claude and ask it to fix the JSON.

Tip: put [docs/claude-prompt.md](docs/claude-prompt.md) in a Claude Project's instructions so every chat in that
project already knows the format.

## Running it

You need Node 20+ and the **Expo Go** app on your phone (Play Store / App Store).

```bash
npm install
npm start          # scan the QR code with Expo Go (same Wi-Fi network)
npm run android    # or open it on a connected device / emulator
```

Android is the primary target; iOS should work but is untested.

### Installing as a standalone app (APK)

Needs the Android SDK (Android Studio's default location is `~/Android/Sdk`; set `ANDROID_HOME` if yours is elsewhere)
and JDK 17+.

```bash
npm run build:apk
adb install -r android/app/build/outputs/apk/release/app-release.apk   # or copy the file to your phone and open it
```

`build:apk` generates the native `android/` project from `app.json` (it's gitignored, never edit it by hand) and builds
a release APK. The APK is signed with the default debug key, which is fine for installing on your own phone, but
publishing to the Play Store needs your own upload key. The standalone app has its own storage, so data logged in Expo
Go doesn't carry over.

To keep the APK small, `app.json` (the `expo-build-properties` plugin) builds only for `arm64-v8a`, which covers any
phone from roughly the last 8 years. It also enables R8 code/resource shrinking and compresses the native libraries.
To run the APK on an x86_64 emulator, add `"x86_64"` to `buildArchs`. If a release build crashes on launch, try turning
off `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds` first.

## Development

```bash
npm test           # unit tests (vitest): import parser, timer, schedule, metrics
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
```

The app icon has a single source, `assets/images/icon.png`. After changing it, run
`python3 scripts/generate-icons.py` (needs Pillow). That regenerates the Android adaptive-icon foreground, the round
icon used for the splash screen, and prints the background colour to put in `app.json`.

Built with Expo SDK 57, Expo Router (native tabs), expo-sqlite, react-native-svg and zod.

```
src/
  app/          screens (Expo Router file-based routes)
  components/   UI kit, timer player, log form, charts, pickers
  data/         built-in exercise and workout library
  db/           SQLite migrations, repository, change-notifying useQuery hook
  lib/          pure logic: types, timer steps, player state machine, schedule maths,
                metrics, formatting, and the plan import format (lib/import)
docs/           plan format reference and the generated Claude prompt
```

Library ids (e.g. `max-hangs`, `wo-limit-bouldering`) are part of the import format. Never rename one; add a new
one instead. See [AGENTS.md](AGENTS.md) for more conventions.

## License

[GPL-3.0-or-later](LICENSE). You're free to use, study, change and share open-climb. If you distribute a modified
version, it must stay open source under the same license.
