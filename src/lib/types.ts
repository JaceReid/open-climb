// Core domain types shared by the database, the UI and the plan importer.
// Weights are always stored in kilograms; the UI converts for display.

export const CATEGORIES = [
  'fingerboard',
  'bouldering',
  'routes',
  'campus',
  'strength',
  'antagonist',
  'core',
  'mobility',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  fingerboard: 'Fingerboard',
  bouldering: 'Bouldering',
  routes: 'Routes',
  campus: 'Campus',
  strength: 'Strength',
  antagonist: 'Antagonist',
  core: 'Core',
  mobility: 'Mobility',
  other: 'Other',
};

/** What quality an exercise trains. Drives the Progress "training mix" chart. */
export const TRAINING_TYPES = [
  'finger-strength',
  'strength',
  'power',
  'power-endurance',
  'endurance',
  'technique',
  'prehab',
  'mobility',
  'other',
] as const;
export type TrainingType = (typeof TRAINING_TYPES)[number];

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  'finger-strength': 'Finger strength',
  strength: 'Strength',
  power: 'Power',
  'power-endurance': 'Power endurance',
  endurance: 'Endurance',
  technique: 'Climbing & technique',
  prehab: 'Prehab',
  mobility: 'Warm-up & mobility',
  other: 'Other',
};

/** Best guess when an exercise has no training type (older data, imports). */
export function defaultTrainingType(category: Category): TrainingType {
  switch (category) {
    case 'fingerboard':
      return 'finger-strength';
    case 'strength':
    case 'core':
      return 'strength';
    case 'bouldering':
    case 'campus':
      return 'power';
    case 'routes':
      return 'endurance';
    case 'antagonist':
      return 'prehab';
    case 'mobility':
      return 'mobility';
    default:
      return 'other';
  }
}

/** What gets recorded for each set of an exercise. */
export const TRACK_FIELDS = ['weight', 'reps', 'duration', 'grade', 'location', 'discipline'] as const;
export type TrackField = (typeof TRACK_FIELDS)[number];
export const TRACK_LABELS: Record<TrackField, string> = {
  weight: 'Weight',
  reps: 'Reps',
  duration: 'Time',
  grade: 'Grade',
  location: 'Indoor/outdoor',
  discipline: 'Route/boulder',
};

/** How an exercise is prescribed inside a workout. */
export interface Prescription {
  sets: number;
  /** Reps per set. For timed work this is the number of hangs/efforts per set. */
  reps: number;
  /** Seconds of work per rep. Omit for untimed reps (e.g. pull-ups). */
  workSec?: number;
  /** Seconds of rest between reps inside a set. */
  restSec?: number;
  /** Seconds of rest between sets. */
  setRestSec?: number;
  /** Load in kg. For bodyweight exercises this is added weight (negative = assisted). */
  weightKg?: number;
  /**
   * Working weight as a % of the latest tested max (of total load for bodyweight
   * exercises). When a max exists this replaces weightKg; see lib/maxtest.ts.
   */
  pctOfMax?: number;
  /** Free-text intensity target, e.g. "RPE 8", "80% max", "7A-7B". */
  intensity?: string;
  /** Edge depth in millimetres for fingerboard work. */
  edgeMm?: number;
  /** Grip type, e.g. "half crimp", "open hand". */
  grip?: string;
  notes?: string;
  /** Per-set labels (e.g. grips), cycled across sets: set 3 of ["a", "b"] is "a". */
  setLabels?: string[];
}

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  /** Training quality, e.g. finger strength or endurance. */
  type: TrainingType;
  description: string;
  instructions: string;
  equipment: string;
  tracks: TrackField[];
  /** True when weightKg is added to bodyweight (hangs, pull-ups, dips). */
  bodyweight: boolean;
  defaults: Prescription;
  builtIn: boolean;
}

export interface WorkoutItem extends Prescription {
  exerciseId: string;
}

export interface Workout {
  id: string;
  name: string;
  /** Short training focus label, e.g. "Max strength", "Power endurance". */
  focus: string;
  description: string;
  items: WorkoutItem[];
  builtIn: boolean;
  /** A max-test session: starting it opens the test flow for its testable exercises. */
  test: boolean;
}

/** 0 = Monday ... 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface Plan {
  id: string;
  name: string;
  description: string;
  goal: string;
  /** Monday the plan starts on (YYYY-MM-DD), or null if not scheduled. */
  startDate: string | null;
  isActive: boolean;
}

export interface PlanBlock {
  id: string;
  planId: string;
  position: number;
  name: string;
  focus: string;
  notes: string;
  weeks: number;
}

export interface PlanSession {
  id: string;
  blockId: string;
  /** 1-based week within the block. */
  week: number;
  day: Weekday;
  position: number;
  workoutId: string;
  notes: string;
}

export interface SessionLog {
  id: string;
  workoutId: string | null;
  workoutName: string;
  planSessionId: string | null;
  scheduledDate: string | null;
  startedAt: string;
  completedAt: string;
  rpe: number | null;
  notes: string;
  bodyweightKg: number | null;
  /** Training time: the timer's real time, an estimate, or what the user entered. */
  durationSec: number | null;
}

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  itemIndex: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  grade: string | null;
  completed: boolean;
  /** Free text; holds the set's label (e.g. grip) when the prescription has setLabels. */
  notes: string;
  /** Estimated time for this set including its share of rests, from the prescription. */
  estSec: number | null;
  location: Location | null;
  discipline: Discipline | null;
}

export type Location = 'indoor' | 'outdoor';
export type Discipline = 'boulder' | 'route';
export const LOCATION_LABELS: Record<Location, string> = { indoor: 'Indoor', outdoor: 'Outdoor' };
export const DISCIPLINE_LABELS: Record<Discipline, string> = { boulder: 'Bouldering', route: 'Routes' };

export interface Settings {
  unit: 'kg' | 'lb';
  bodyweightKg: number | null;
  prepSec: number;
  sound: boolean;
  voice: boolean;
  vibrate: boolean;
  /** Default working weight as % of max, shown on exercise pages. */
  workingPct: number;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  bodyweightKg: null,
  prepSec: 5,
  sound: true,
  voice: true,
  vibrate: true,
  workingPct: 80,
};

/** One max test result for an exercise. */
export interface MaxTest {
  id: string;
  exerciseId: string;
  testedAt: string;
  kind: 'hold' | 'reps';
  /** Hold length for hold tests. */
  holdSec: number | null;
  /** Reps of the best attempt for rep tests (1 = true 1RM). */
  reps: number | null;
  /** Best successful attempt (added weight for bodyweight exercises). */
  weightKg: number;
  /** The max used for working weights: the attempt itself, or an estimated 1RM. */
  maxKg: number;
  /** Bodyweight at the time, for bodyweight exercises. */
  bodyweightKg: number | null;
  sessionId: string | null;
}
