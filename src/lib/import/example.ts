// A small but complete plan in the import format. Used as the example in the
// Claude prompt, in docs, and by the "Try the example" button.
export const EXAMPLE_PLAN = {
  format: 'open-climb-plan',
  version: 1,
  plan: {
    name: 'Autumn Finger Strength',
    description: 'Four weeks of max hangs and limit bouldering, then a deload.',
    goal: 'Send 7B by December',
  },
  exercises: [
    {
      id: 'pinch-block-lifts',
      name: 'Pinch Block Lifts',
      category: 'fingerboard',
      type: 'finger-strength',
      description: 'Lift a loaded pinch block for thumb and pinch strength.',
      tracks: ['weight', 'duration'],
    },
  ],
  workouts: [
    {
      id: 'hangs-and-pulls',
      name: 'Hangs + Pulls',
      focus: 'Max strength',
      items: [
        { exercise: 'fingerboard-warmup', sets: 3, reps: 6, workSec: 5, restSec: 5, setRestSec: 60 },
        {
          exercise: 'max-hangs',
          sets: 5,
          reps: 1,
          workSec: 10,
          setRestSec: 180,
          weightKg: 10,
          edgeMm: 20,
          grip: 'half crimp',
          notes: 'Add 2 kg each week if every hang is clean.',
        },
        { exercise: 'pinch-block-lifts', sets: 3, reps: 2, workSec: 10, restSec: 30, setRestSec: 120, weightKg: 20 },
        { exercise: 'weighted-pullups', sets: 4, reps: 5, setRestSec: 180, weightKg: 15 },
      ],
    },
    {
      id: 'deload-hangs',
      name: 'Deload Hangs',
      focus: 'Recovery',
      items: [{ exercise: 'density-hangs', sets: 3, reps: 1, workSec: 20, setRestSec: 120, intensity: 'Easy, ~50%' }],
    },
  ],
  blocks: [
    {
      name: 'Strength',
      focus: 'Max finger strength',
      weeks: 4,
      schedule: [
        { day: 'mon', workouts: ['hangs-and-pulls'] },
        { day: 'wed', workouts: ['wo-limit-bouldering'] },
        { day: 'fri', workouts: ['hangs-and-pulls', 'wo-antagonist'] },
        { day: 'sat', workouts: ['wo-limit-bouldering'] },
      ],
      weekOverrides: [
        {
          week: 4,
          schedule: [
            { day: 'mon', workouts: ['hangs-and-pulls'], notes: 'Test week: try +2 kg on max hangs.' },
            { day: 'thu', workouts: ['wo-limit-bouldering'] },
          ],
        },
      ],
    },
    {
      name: 'Deload',
      focus: 'Recovery',
      weeks: 1,
      schedule: [
        { day: 'tue', workouts: ['deload-hangs'] },
        { day: 'thu', workouts: ['wo-arc'] },
      ],
    },
  ],
};
