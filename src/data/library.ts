// Built-in exercise and workout library. These rows are upserted on every
// launch (keyed by id), so edits here ship to existing installs. Users edit
// copies, never the built-ins themselves.
//
// Ids are stable public identifiers: Claude-generated plans reference them,
// so never rename an id. Add new ones instead.
import type { Exercise, Workout, WorkoutItem } from '@/lib/types';

type ExerciseDef = Omit<Exercise, 'builtIn' | 'equipment' | 'instructions' | 'bodyweight'> &
  Partial<Pick<Exercise, 'equipment' | 'instructions' | 'bodyweight'>>;

const ex = (e: ExerciseDef): Exercise => ({
  equipment: '',
  instructions: '',
  bodyweight: false,
  ...e,
  builtIn: true,
});

export const BUILT_IN_EXERCISES: Exercise[] = [
  // Fingerboard ---------------------------------------------------------------
  ex({
    id: 'fingerboard-warmup',
    name: 'Fingerboard Warm-up',
    category: 'fingerboard',
    type: 'mobility',
    description: 'Progressive short hangs to prepare fingers before hard hangboarding.',
    instructions:
      'Start on a large edge or with feet on a chair. Each set, make it harder (smaller edge, less assistance) until the last set feels close to working intensity.',
    equipment: 'Fingerboard',
    tracks: ['duration'],
    defaults: { sets: 3, reps: 6, workSec: 5, restSec: 5, setRestSec: 60 },
  }),
  ex({
    id: 'max-hangs',
    name: 'Max Hangs',
    category: 'fingerboard',
    type: 'finger-strength',
    description:
      'Short, near-maximal hangs to build finger strength (recruitment) with low fatigue. The classic 10 second protocol.',
    instructions:
      'Hang for 10s on a ~20mm edge with enough added weight that you could hold about 13s (keep ~3s in reserve). Rest fully between sets. Stop if form or grip position breaks.',
    equipment: 'Fingerboard, harness/pulley for load',
    tracks: ['weight', 'duration'],
    bodyweight: true,
    defaults: { sets: 5, reps: 1, workSec: 10, setRestSec: 180, edgeMm: 20, grip: 'half crimp' },
  }),
  ex({
    id: 'repeaters-7-3',
    name: 'Repeaters 7/3',
    category: 'fingerboard',
    type: 'finger-strength',
    description:
      'Intermittent hangs (7s on, 3s off) that build strength-endurance and forearm capacity.',
    instructions:
      'Six 7s hangs with 3s rests make one 1-minute set. Choose a load where the last rep of the last set is hard but completed.',
    equipment: 'Fingerboard',
    tracks: ['weight', 'reps'],
    bodyweight: true,
    defaults: { sets: 4, reps: 6, workSec: 7, restSec: 3, setRestSec: 180, edgeMm: 20 },
  }),
  ex({
    id: 'min-edge-hangs',
    name: 'Min Edge Hangs',
    category: 'fingerboard',
    type: 'finger-strength',
    description: 'Bodyweight hangs on the smallest edge you can hold for the target time.',
    instructions:
      'Use adjustable edges or a micro-edge set. Progress by reducing edge depth rather than adding weight. Log the edge depth in notes.',
    equipment: 'Fingerboard with small/adjustable edges',
    tracks: ['duration'],
    bodyweight: true,
    defaults: { sets: 5, reps: 1, workSec: 10, setRestSec: 180, edgeMm: 12 },
  }),
  ex({
    id: 'density-hangs',
    name: 'Density Hangs',
    category: 'fingerboard',
    type: 'finger-strength',
    description:
      'Long, sub-maximal hangs (20–40s) for connective tissue health and finger capacity.',
    instructions:
      'Pick an edge and load you can hold for the full duration at ~60–70% effort. Good early in a training cycle or for returning from time off.',
    equipment: 'Fingerboard',
    tracks: ['weight', 'duration'],
    bodyweight: true,
    defaults: { sets: 4, reps: 1, workSec: 30, setRestSec: 120, edgeMm: 20 },
  }),
  ex({
    id: 'one-arm-hangs',
    name: 'One-Arm Hangs',
    category: 'fingerboard',
    type: 'finger-strength',
    description: 'Single-arm hangs, assisted with a pulley if needed. Alternate arms each set.',
    instructions:
      'Use a pulley and counterweight for assistance (log assistance as negative weight). Keep the shoulder engaged and avoid twisting.',
    equipment: 'Fingerboard, pulley',
    tracks: ['weight', 'duration'],
    bodyweight: true,
    defaults: { sets: 6, reps: 1, workSec: 7, setRestSec: 90, edgeMm: 20 },
  }),
  ex({
    id: 'block-lifts',
    name: 'Block Lifts (No-Hangs)',
    category: 'fingerboard',
    type: 'finger-strength',
    description: 'Lift a loaded edge block from the floor. Trains fingers without hanging.',
    instructions:
      'Pick the block up with one hand in your chosen grip and hold for the target time. Log the total weight lifted (block + plates).',
    equipment: 'Lifting edge/block, weights',
    tracks: ['weight', 'duration'],
    defaults: { sets: 5, reps: 2, workSec: 10, restSec: 30, setRestSec: 120, edgeMm: 20 },
  }),

  // Bouldering ----------------------------------------------------------------
  ex({
    id: 'limit-bouldering',
    name: 'Limit Bouldering',
    category: 'bouldering',
    type: 'power',
    description:
      'Attempts on boulders at or near your maximum. Develops strength and power in a climbing context.',
    instructions:
      'Choose problems that take several sessions to send, ideally short (3–8 moves). Rest 3–5 minutes between attempts and stop when quality drops.',
    equipment: 'Bouldering wall or board',
    tracks: ['grade'],
    defaults: { sets: 5, reps: 1, setRestSec: 240, intensity: 'Max effort' },
  }),
  ex({
    id: 'board-climbing',
    name: 'Board Climbing',
    category: 'bouldering',
    type: 'power',
    description: 'Hard problems on a standardised board (Moon, Kilter, Tension).',
    instructions: 'Log the hardest problem you sent or worked each set. Rest fully between attempts.',
    equipment: 'Moonboard / Kilter / Tension board',
    tracks: ['grade'],
    defaults: { sets: 6, reps: 1, setRestSec: 180 },
  }),
  ex({
    id: 'four-by-fours',
    name: '4x4s',
    category: 'bouldering',
    type: 'power-endurance',
    description: 'Climb four boulders back-to-back, four times. Classic power-endurance session.',
    instructions:
      'Pick four problems about 3–4 grades below your max. Climb them consecutively with no rest (down-climb or jump off and start the next), then rest 4 minutes.',
    equipment: 'Bouldering wall',
    tracks: ['grade'],
    defaults: { sets: 4, reps: 4, setRestSec: 240 },
  }),
  ex({
    id: 'boulder-circuits',
    name: 'Linked Boulder Circuits',
    category: 'bouldering',
    type: 'power-endurance',
    description: 'Link 2–3 problems or a 20–40 move circuit without rest for power endurance.',
    instructions: 'Aim to be pumped but still moving well at the end of each circuit.',
    equipment: 'Bouldering wall or board',
    tracks: ['grade'],
    defaults: { sets: 4, reps: 1, setRestSec: 300 },
  }),
  ex({
    id: 'volume-bouldering',
    name: 'Volume Bouldering',
    category: 'bouldering',
    type: 'technique',
    description: 'Lots of moderate problems to build movement skill and work capacity.',
    instructions: 'Climb problems 2–3 grades below your flash level. Focus on precise, quiet movement.',
    equipment: 'Bouldering wall',
    tracks: ['grade'],
    defaults: { sets: 1, reps: 20 },
  }),
  ex({
    id: 'technique-drills',
    name: 'Technique Drills',
    category: 'bouldering',
    type: 'technique',
    description: 'Deliberate practice drills: silent feet, hover hands, straight arms, flagging.',
    instructions:
      'Choose one drill per set and apply it to easy problems. Write which drill you used in the notes.',
    tracks: [],
    defaults: { sets: 4, reps: 1, setRestSec: 60 },
  }),

  // Routes / endurance ----------------------------------------------------------
  ex({
    id: 'arc',
    name: 'ARC (Continuous Climbing)',
    category: 'routes',
    type: 'endurance',
    description:
      'Aerobic Restoration & Capillarity: long bouts of easy, continuous climbing at a light pump.',
    instructions:
      'Stay on the wall the whole time on easy terrain (traverses or auto-belay laps). Pump should stay around 3–4/10. If you get too pumped, find easier ground.',
    equipment: 'Traverse wall, auto-belay or treadwall',
    tracks: ['duration'],
    defaults: { sets: 2, reps: 1, workSec: 1200, setRestSec: 600 },
  }),
  ex({
    id: 'on-off-intervals',
    name: 'On/Off Intervals',
    category: 'routes',
    type: 'endurance',
    description: 'Timed climbing intervals for aerobic power (e.g. 1 minute on, 1 minute off).',
    instructions:
      'Climb continuously during "on" periods on terrain that gets you moderately pumped. Rest on the ground during "off".',
    equipment: 'Board, traverse wall or treadwall',
    tracks: ['duration'],
    defaults: { sets: 3, reps: 4, workSec: 60, restSec: 60, setRestSec: 300 },
  }),
  ex({
    id: 'route-laps',
    name: 'Route Laps',
    category: 'routes',
    type: 'endurance',
    description: 'Laps on routes below your limit for endurance and volume.',
    instructions: 'Log the route grade in the grade field or notes.',
    equipment: 'Rope wall or auto-belay',
    tracks: ['grade'],
    defaults: { sets: 4, reps: 1, setRestSec: 180 },
  }),

  ex({
    id: 'open-climbing',
    name: 'Open Climbing',
    category: 'other',
    type: 'technique',
    description: 'A normal climbing session: projecting, mileage or a day at the crag. Log where and what you climbed.',
    instructions:
      'Add an entry for each part of the session (e.g. 60 min indoor bouldering, then 30 min of routes) with where you climbed, what kind and for how long.',
    tracks: ['location', 'discipline', 'duration'],
    defaults: { sets: 1, reps: 1, workSec: 3600 },
  }),

  // Campus --------------------------------------------------------------------
  ex({
    id: 'campus-ladders',
    name: 'Campus Ladders',
    category: 'campus',
    type: 'power',
    description: 'Ladder up the campus board (e.g. 1-3-5, 1-4-7) for contact strength and power.',
    instructions:
      'Only for experienced climbers with healthy fingers. Rest fully between sets and stop as soon as you lose speed.',
    equipment: 'Campus board',
    tracks: [],
    defaults: { sets: 5, reps: 1, setRestSec: 180, intensity: 'Max effort' },
  }),
  ex({
    id: 'campus-bumps',
    name: 'Campus Bumps',
    category: 'campus',
    type: 'power',
    description: 'Bump one hand up the rungs while the other stays on the starting rung.',
    instructions: 'Alternate the leading hand each set. Keep reps few and fast.',
    equipment: 'Campus board',
    tracks: [],
    defaults: { sets: 6, reps: 1, setRestSec: 120 },
  }),

  // Strength ------------------------------------------------------------------
  ex({
    id: 'weighted-pullups',
    name: 'Weighted Pull-ups',
    category: 'strength',
    type: 'strength',
    description: 'Low-rep pull-ups with added weight for pulling strength.',
    instructions:
      'Start from a dead hang and pull until your chin clears the bar. Pick a load for the target reps with 1–2 reps in reserve.',
    equipment: 'Pull-up bar, weight belt or vest',
    tracks: ['weight', 'reps'],
    bodyweight: true,
    defaults: { sets: 4, reps: 5, setRestSec: 180 },
  }),
  ex({
    id: 'pullups',
    name: 'Pull-ups',
    category: 'strength',
    type: 'strength',
    description: 'Bodyweight pull-ups for general pulling strength and volume.',
    equipment: 'Pull-up bar',
    tracks: ['weight', 'reps'],
    bodyweight: true,
    defaults: { sets: 3, reps: 8, setRestSec: 120 },
  }),
  ex({
    id: 'frenchies',
    name: 'Frenchies',
    category: 'strength',
    type: 'strength',
    description: 'Pull-ups with lock-off holds at the top, 90° and 120° for lock-off strength.',
    instructions:
      'One rep = pull up and hold 5s at the top, lower; pull up and hold 5s at 90°, lower; pull up and hold 5s at 120°, lower.',
    equipment: 'Pull-up bar',
    tracks: ['weight', 'reps'],
    bodyweight: true,
    defaults: { sets: 3, reps: 3, setRestSec: 180 },
  }),
  ex({
    id: 'deadlift',
    name: 'Deadlift',
    category: 'strength',
    type: 'strength',
    description: 'Posterior chain and full-body strength.',
    equipment: 'Barbell',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 5, setRestSec: 180 },
  }),
  ex({
    id: 'back-squat',
    name: 'Back Squat',
    category: 'strength',
    type: 'strength',
    description: 'Leg strength for high steps, rock-overs and general robustness.',
    equipment: 'Barbell, rack',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 5, setRestSec: 180 },
  }),
  ex({
    id: 'overhead-press',
    name: 'Overhead Press',
    category: 'strength',
    type: 'strength',
    description: 'Pressing strength and shoulder stability to balance climbing’s pulling.',
    equipment: 'Barbell or dumbbells',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 6, setRestSec: 150 },
  }),
  ex({
    id: 'bench-press',
    name: 'Bench Press',
    category: 'strength',
    type: 'strength',
    description: 'Horizontal pressing strength.',
    equipment: 'Barbell, bench',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 6, setRestSec: 150 },
  }),
  ex({
    id: 'dips',
    name: 'Dips',
    category: 'strength',
    type: 'strength',
    description: 'Pressing strength for mantles and shoulder balance.',
    equipment: 'Dip bars or rings',
    tracks: ['weight', 'reps'],
    bodyweight: true,
    defaults: { sets: 3, reps: 8, setRestSec: 120 },
  }),

  // Antagonist & prehab -------------------------------------------------------
  ex({
    id: 'push-ups',
    name: 'Push-ups',
    category: 'antagonist',
    type: 'prehab',
    description: 'Basic pressing to balance pulling muscles.',
    tracks: ['reps'],
    bodyweight: true,
    defaults: { sets: 3, reps: 12, setRestSec: 60 },
  }),
  ex({
    id: 'reverse-wrist-curls',
    name: 'Reverse Wrist Curls',
    category: 'antagonist',
    type: 'prehab',
    description: 'Strengthens the wrist extensors; helps prevent elbow pain.',
    instructions: 'Forearm on your thigh, palm down. Lift slowly and lower over 3 seconds.',
    equipment: 'Dumbbell',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 15, setRestSec: 60 },
  }),
  ex({
    id: 'pronator-supinator',
    name: 'Pronation / Supination',
    category: 'antagonist',
    type: 'prehab',
    description: 'Forearm rotation with an offset load (hammer or one-sided dumbbell).',
    equipment: 'Hammer or dumbbell',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 12, setRestSec: 60 },
  }),
  ex({
    id: 'finger-extensions',
    name: 'Finger Extensor Band',
    category: 'antagonist',
    type: 'prehab',
    description: 'Open the fingers against a rubber band to train the extensors.',
    equipment: 'Rubber band',
    tracks: ['reps'],
    defaults: { sets: 3, reps: 20, setRestSec: 45 },
  }),
  ex({
    id: 'external-rotation',
    name: 'Shoulder External Rotation',
    category: 'antagonist',
    type: 'prehab',
    description: 'Rotator cuff strength for shoulder health.',
    instructions: 'Elbow at your side, bent 90°. Rotate the forearm outwards against a band or cable.',
    equipment: 'Band or cable',
    tracks: ['weight', 'reps'],
    defaults: { sets: 3, reps: 12, setRestSec: 60 },
  }),
  ex({
    id: 'ytw-raises',
    name: 'Y-T-W Raises',
    category: 'antagonist',
    type: 'prehab',
    description: 'Lower trap and rear delt work for scapular control.',
    instructions: 'Lie face down on an incline bench. Raise light weights in Y, T and W shapes.',
    equipment: 'Light dumbbells, bench',
    tracks: ['weight', 'reps'],
    defaults: { sets: 2, reps: 8, setRestSec: 60 },
  }),
  ex({
    id: 'scap-pullups',
    name: 'Scapular Pull-ups',
    category: 'antagonist',
    type: 'prehab',
    description: 'Shoulder blade depression/retraction from a hang. Great warm-up and prehab.',
    equipment: 'Pull-up bar',
    tracks: ['reps'],
    bodyweight: true,
    defaults: { sets: 3, reps: 8, setRestSec: 60 },
  }),

  // Core ----------------------------------------------------------------------
  ex({
    id: 'hanging-leg-raises',
    name: 'Hanging Leg Raises',
    category: 'core',
    type: 'strength',
    description: 'Core and hip flexor strength for steep climbing.',
    instructions: 'Raise straight legs (or knees if needed) to the bar without swinging.',
    equipment: 'Pull-up bar',
    tracks: ['reps'],
    defaults: { sets: 3, reps: 8, setRestSec: 90 },
  }),
  ex({
    id: 'front-lever',
    name: 'Front Lever Holds',
    category: 'core',
    type: 'strength',
    description: 'Isometric front lever (or progression) for body tension.',
    instructions:
      'Use the hardest progression you can hold for the target time: tuck, advanced tuck, one leg, straddle, full. Note the progression in the log.',
    equipment: 'Pull-up bar or rings',
    tracks: ['duration'],
    bodyweight: true,
    defaults: { sets: 4, reps: 1, workSec: 8, setRestSec: 120 },
  }),
  ex({
    id: 'hollow-body',
    name: 'Hollow Body Hold',
    category: 'core',
    type: 'strength',
    description: 'Anterior core tension on the floor.',
    tracks: ['duration'],
    defaults: { sets: 3, reps: 1, workSec: 30, setRestSec: 60 },
  }),
  ex({
    id: 'ab-wheel',
    name: 'Ab Wheel Rollouts',
    category: 'core',
    type: 'strength',
    description: 'Anti-extension core strength.',
    equipment: 'Ab wheel',
    tracks: ['reps'],
    defaults: { sets: 3, reps: 8, setRestSec: 90 },
  }),

  // Mobility / general --------------------------------------------------------
  ex({
    id: 'general-warmup',
    name: 'General Warm-up',
    category: 'mobility',
    type: 'mobility',
    description: 'Raise heart rate and mobilise shoulders, hips and fingers before training.',
    instructions:
      'A few minutes of light cardio, arm circles, band pull-aparts, then easy climbing building up in difficulty.',
    tracks: [],
    defaults: { sets: 1, reps: 1, workSec: 900 },
  }),
  ex({
    id: 'hip-mobility',
    name: 'Hip Mobility',
    category: 'mobility',
    type: 'mobility',
    description: 'Frog stretch, pigeon and deep squat holds for turn-out and high steps.',
    tracks: ['duration'],
    defaults: { sets: 1, reps: 4, workSec: 45, restSec: 15 },
  }),
  ex({
    id: 'forearm-stretch',
    name: 'Forearm Stretch',
    category: 'mobility',
    type: 'mobility',
    description: 'Gentle flexor and extensor stretches after training.',
    tracks: ['duration'],
    defaults: { sets: 1, reps: 4, workSec: 30, restSec: 10 },
  }),
];

const item = (exerciseId: string, overrides: Partial<WorkoutItem> = {}): WorkoutItem => {
  const exercise = BUILT_IN_EXERCISES.find((e) => e.id === exerciseId);
  if (!exercise) throw new Error(`Unknown built-in exercise ${exerciseId}`);
  return { exerciseId, ...exercise.defaults, ...overrides };
};

const wo = (w: Omit<Workout, 'builtIn' | 'test'> & { test?: boolean }): Workout => ({ test: false, ...w, builtIn: true });

export const BUILT_IN_WORKOUTS: Workout[] = [
  wo({
    id: 'wo-max-hangs',
    name: 'Max Hangs',
    focus: 'Finger strength',
    description: 'Warm up, then 10 second max hangs with full recovery.',
    items: [item('fingerboard-warmup'), item('max-hangs', { pctOfMax: 80 })],
  }),
  wo({
    id: 'wo-repeaters',
    name: 'Repeaters 7/3',
    focus: 'Strength endurance',
    description: 'Warm up, then 7 on / 3 off repeaters.',
    items: [item('fingerboard-warmup'), item('repeaters-7-3')],
  }),
  wo({
    id: 'wo-density-hangs',
    name: 'Density Hangs',
    focus: 'Finger capacity',
    description: 'Long sub-maximal hangs for tendon health and base finger strength.',
    items: [item('fingerboard-warmup'), item('density-hangs')],
  }),
  wo({
    id: 'wo-min-edge',
    name: 'Min Edge Hangs',
    focus: 'Finger strength',
    description: 'Bodyweight hangs on the smallest edge you can hold.',
    items: [item('fingerboard-warmup'), item('min-edge-hangs')],
  }),
  wo({
    id: 'wo-limit-bouldering',
    name: 'Limit Bouldering',
    focus: 'Strength & power',
    description: 'Thorough warm-up, then max-effort attempts with long rests.',
    items: [item('general-warmup'), item('limit-bouldering')],
  }),
  wo({
    id: 'wo-4x4',
    name: '4x4s',
    focus: 'Power endurance',
    description: 'Four problems back-to-back, four times.',
    items: [item('general-warmup'), item('four-by-fours')],
  }),
  wo({
    id: 'wo-arc',
    name: 'ARC Session',
    focus: 'Aerobic capacity',
    description: 'Two 20-minute bouts of continuous easy climbing.',
    items: [item('arc')],
  }),
  wo({
    id: 'wo-intervals',
    name: 'On/Off Intervals',
    focus: 'Aerobic power',
    description: 'Three sets of 4 × (1 min on / 1 min off).',
    items: [item('general-warmup'), item('on-off-intervals')],
  }),
  wo({
    id: 'wo-campus',
    name: 'Campus Power',
    focus: 'Power',
    description: 'Campus ladders and bumps. For experienced climbers only.',
    items: [item('general-warmup'), item('campus-ladders'), item('campus-bumps')],
  }),
  wo({
    id: 'wo-pull-strength',
    name: 'Pull Strength',
    focus: 'Strength',
    description: 'Heavy pulling with lock-offs and core.',
    items: [item('weighted-pullups', { pctOfMax: 80 }), item('frenchies'), item('hanging-leg-raises')],
  }),
  wo({
    id: 'wo-full-body',
    name: 'Full-Body Strength',
    focus: 'Strength',
    description: 'Big lifts for general strength and robustness.',
    items: [
      item('deadlift'),
      item('overhead-press'),
      item('weighted-pullups', { sets: 3 }),
      item('front-lever'),
    ],
  }),
  wo({
    id: 'wo-antagonist',
    name: 'Antagonist & Prehab',
    focus: 'Injury prevention',
    description: 'Pressing, wrist extensors and shoulder health.',
    items: [
      item('push-ups'),
      item('reverse-wrist-curls'),
      item('finger-extensions'),
      item('external-rotation'),
      item('ytw-raises'),
    ],
  }),
  wo({
    id: 'wo-core',
    name: 'Core Circuit',
    focus: 'Core',
    description: 'Body tension for steep climbing.',
    items: [item('hanging-leg-raises'), item('front-lever'), item('hollow-body'), item('ab-wheel')],
  }),
  wo({
    id: 'wo-open-climbing',
    name: 'Climbing Session',
    focus: 'Climbing',
    description: 'Just climbing: indoors or out, routes or boulders.',
    items: [item('open-climbing')],
  }),
  // Max tests: starting one opens the test flow for its testable exercises;
  // the other items are the warm-up.
  wo({
    id: 'wo-test-max-hang',
    name: 'Max Hang Test',
    focus: 'Testing',
    description: 'Find the heaviest load you can hang for 5 seconds. Sets your Max Hangs working weight.',
    items: [item('general-warmup'), item('fingerboard-warmup'), item('max-hangs')],
    test: true,
  }),
  wo({
    id: 'wo-test-edge-lift',
    name: 'Edge Lift Test',
    focus: 'Testing',
    description: 'Find the heaviest block/edge lift you can hold for 5 seconds.',
    items: [item('general-warmup'), item('fingerboard-warmup'), item('block-lifts')],
    test: true,
  }),
  wo({
    id: 'wo-test-pullup',
    name: 'Pull-up Max Test',
    focus: 'Testing',
    description: 'Work up to a heavy 1–5 rep weighted pull-up; the app estimates your 1RM.',
    items: [item('general-warmup'), item('scap-pullups'), item('weighted-pullups')],
    test: true,
  }),
];

// --- Library origin ------------------------------------------------------------
// The DB's built_in flag means "identical to the library version", so re-seeding
// can update it. Users may edit library items in place (built_in becomes 0) and
// reset them later. Whether an item comes from the library is decided by its id.

const libraryExercises = new Map(BUILT_IN_EXERCISES.map((e) => [e.id, e]));
const libraryWorkouts = new Map(BUILT_IN_WORKOUTS.map((w) => [w.id, w]));

export const libraryExercise = (id: string): Exercise | undefined => libraryExercises.get(id);
export const libraryWorkout = (id: string): Workout | undefined => libraryWorkouts.get(id);

/** library: untouched built-in. edited: built-in the user changed. custom: user-created. */
export type Origin = 'library' | 'edited' | 'custom';

export function exerciseOrigin(e: Pick<Exercise, 'id' | 'builtIn'>): Origin {
  if (!libraryExercises.has(e.id)) return 'custom';
  return e.builtIn ? 'library' : 'edited';
}

export function workoutOrigin(w: Pick<Workout, 'id' | 'builtIn'>): Origin {
  if (!libraryWorkouts.has(w.id)) return 'custom';
  return w.builtIn ? 'library' : 'edited';
}

/** JSON with sorted keys and undefined dropped, so equal content compares equal. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x,
  );
}

const exerciseContent = (e: Exercise) =>
  stable([e.name, e.category, e.type, e.description, e.instructions, e.equipment, e.tracks, e.bodyweight, e.defaults]);
const workoutContent = (w: Workout) => stable([w.name, w.focus, w.description, w.items, w.test]);

/** True when the exercise is a library one whose content is unchanged. */
export function matchesLibraryExercise(e: Exercise): boolean {
  const lib = libraryExercises.get(e.id);
  return !!lib && exerciseContent(lib) === exerciseContent(e);
}

export function matchesLibraryWorkout(w: Workout): boolean {
  const lib = libraryWorkouts.get(w.id);
  return !!lib && workoutContent(lib) === workoutContent(w);
}
