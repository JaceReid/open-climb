// Builds the prompt the user pastes into Claude so it replies with a plan in
// the open-climb-plan format, referencing the user's own library by id.
import { CATEGORIES, TRACK_FIELDS, TRAINING_TYPES, type Exercise, type Workout } from '../types';
import { EXAMPLE_PLAN } from './example';

export const FORMAT_SPEC = `type PlanFile = {
  format: "open-climb-plan";
  version: 1;
  plan?: {                 // required when "blocks" is present
    name: string;
    description?: string;
    goal?: string;
    startDate?: string;    // "YYYY-MM-DD", snapped to that week's Monday. Usually omit; I'll pick it in the app.
  };
  exercises?: Exercise[];  // ONLY exercises missing from my library
  workouts?: Workout[];    // workouts used by this plan (library workouts can be referenced by id instead)
  blocks?: Block[];        // training phases in order, e.g. base -> strength -> power -> deload
};

type Exercise = {
  id: string;              // your own short id, referenced from workout items
  name: string;
  category: ${CATEGORIES.map((c) => `"${c}"`).join(' | ')};
  type?: ${TRAINING_TYPES.map((t) => `"${t}"`).join(' | ')};  // what it trains; drives my progress charts
  description?: string;
  instructions?: string;
  equipment?: string;
  tracks?: (${TRACK_FIELDS.map((t) => `"${t}"`).join(' | ')})[];  // what to log per set
  bodyweight?: boolean;    // true if weightKg is added to bodyweight (hangs, pull-ups)
};

type Workout = {
  id: string;              // your own short id, referenced from block schedules
  name: string;
  focus?: string;          // e.g. "Max strength", "Power endurance"
  description?: string;
  items: Item[];           // in order
  test?: boolean;          // a max-test day: the app runs strength tests for the weighted items and updates my maxes
};

type Item = {
  exercise: string;        // library exercise id (preferred) or an id from "exercises"
  sets: number;
  reps: number;            // per set; for timed work, the number of efforts per set
  workSec?: number;        // seconds per rep for timed work (hangs, holds, intervals). Omit for normal reps.
  restSec?: number;        // seconds between reps inside a set
  setRestSec?: number;     // seconds between sets
  weightKg?: number;       // kg; added weight for bodyweight exercises, negative = assisted
  pctOfMax?: number;       // working weight as % of my tested max (total load for hangs/pull-ups), e.g. 80. Prefer this over weightKg for max hangs, weighted pull-ups, edge lifts and barbell lifts
  intensity?: string;      // e.g. "RPE 8", "80% max", "3s in reserve", "7A-7B"
  edgeMm?: number;
  grip?: string;           // e.g. "half crimp", "open hand"
  notes?: string;          // progression rules, cues
};

type Block = {
  name: string;
  focus?: string;
  notes?: string;
  weeks: number;
  schedule: Day[];         // repeats every week of the block
  weekOverrides?: { week: number; schedule: Day[] }[];  // replaces the schedule for specific weeks (1-based), e.g. a deload or test week
};

type Day = {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  workouts: string[];      // workout ids, in the order they're done that day
  notes?: string;
};`;

function libraryList(exercises: Exercise[], workouts: Workout[]): string {
  const ex = exercises
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((e) => `- ${e.id}: ${e.name} (${e.category}, ${e.type}${e.tracks.length ? `; logs ${e.tracks.join(', ')}` : ''})`)
    .join('\n');
  const wo = workouts.map((w) => `- ${w.id}: ${w.name}${w.focus ? ` (${w.focus})` : ''}`).join('\n');
  return `Exercises already in my library (reference by id):\n${ex}\n\nWorkouts already in my library (can be scheduled by id):\n${wo}`;
}

export function buildClaudePrompt(exercises: Exercise[], workouts: Workout[]): string {
  return `I use the open-climb training app. Please write my climbing training plan as JSON that the app can import.

Instructions:
- Reply with ONE JSON object in a \`\`\`json code block. Plain JSON only: no comments and no trailing commas.
- Follow the TypeScript-style format below exactly. Use only the fields shown.
- Reuse exercises from my library by their id. Only add an entry to "exercises" for movements that are missing.
- Put progression (e.g. "add 2 kg per week") in item "notes", or use "weekOverrides" when a week is different.
- For strength work, prescribe load as "pctOfMax" so weights follow my tested maxes. Schedule a test workout (e.g. wo-test-max-hang) at the start of a strength block and in test weeks.
- All weights in kg. All durations in seconds.
- If we discussed a plan earlier in this conversation, convert that plan. Otherwise ask me about my goals, schedule and current level first.

Format:
\`\`\`ts
${FORMAT_SPEC}
\`\`\`

${libraryList(exercises, workouts)}

Example of a valid file:
\`\`\`json
${JSON.stringify(EXAMPLE_PLAN, null, 2)}
\`\`\``;
}
