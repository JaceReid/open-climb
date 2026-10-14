// "Review with Claude": the user's recent training as compact text plus their
// current plan in the import format, so Claude can review it and send back an
// updated plan (same planId) that the app applies in place.
import { addDays, formatDate, formatDay, formatShort, mondayOf } from '../dates';
import { formatDuration, formatHours, formatWeight, plural } from '../format';
import { sessionsInRange } from '../schedule';
import {
  DISCIPLINE_LABELS,
  LOCATION_LABELS,
  type Exercise,
  type MaxTest,
  type Plan,
  type PlanBlock,
  type PlanSession,
  type SessionLog,
  type SetLog,
  type Workout,
  type WorkoutItem,
} from '../types';
import { FORMAT_SPEC, libraryList } from './prompt';

export interface PlanData {
  plan: Plan;
  blocks: PlanBlock[];
  sessions: PlanSession[];
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** An item as written in the import format (`exercise` instead of `exerciseId`). */
function fileItem({ exerciseId, ...rest }: WorkoutItem) {
  return { exercise: exerciseId, ...rest };
}

/**
 * An existing plan in the import format. Library workouts are referenced by id;
 * custom and edited ones are included with their ids so Claude can change them.
 */
export function planToFile(data: PlanData, workouts: Map<string, Workout>) {
  const used = [...new Set(data.sessions.map((s) => s.workoutId))];
  const included = used
    .map((id) => workouts.get(id))
    .filter((w): w is Workout => !!w && !w.builtIn)
    .map((w) => ({
      id: w.id,
      name: w.name,
      focus: w.focus,
      description: w.description,
      ...(w.test ? { test: true } : {}),
      items: w.items.map(fileItem),
    }));

  const blocks = [...data.blocks]
    .sort((a, b) => a.position - b.position)
    .map((b) => {
      const weekSchedule = (week: number) => {
        const sessions = data.sessions
          .filter((s) => s.blockId === b.id && s.week === week)
          .sort((x, y) => x.day - y.day || x.position - y.position);
        const days: { day: string; workouts: string[]; notes?: string }[] = [];
        for (const s of sessions) {
          const last = days[days.length - 1];
          if (last && last.day === DAY_KEYS[s.day]) last.workouts.push(s.workoutId);
          else days.push({ day: DAY_KEYS[s.day], workouts: [s.workoutId], ...(s.notes ? { notes: s.notes } : {}) });
        }
        return days;
      };
      const schedule = weekSchedule(1);
      const weekOverrides = [];
      for (let w = 2; w <= b.weeks; w++) {
        const days = weekSchedule(w);
        if (JSON.stringify(days) !== JSON.stringify(schedule)) weekOverrides.push({ week: w, schedule: days });
      }
      return {
        name: b.name,
        ...(b.focus ? { focus: b.focus } : {}),
        ...(b.notes ? { notes: b.notes } : {}),
        weeks: b.weeks,
        schedule,
        ...(weekOverrides.length ? { weekOverrides } : {}),
      };
    });

  return {
    format: 'open-climb-plan',
    version: 1,
    planId: data.plan.id,
    plan: {
      name: data.plan.name,
      ...(data.plan.description ? { description: data.plan.description } : {}),
      ...(data.plan.goal ? { goal: data.plan.goal } : {}),
    },
    workouts: included,
    blocks,
  };
}

export interface LoggedSession {
  log: SessionLog;
  sets: SetLog[];
}

export interface TrainingLogInput {
  sessions: LoggedSession[];
  maxes: MaxTest[];
  exercises: Map<string, Exercise>;
  unit: 'kg' | 'lb';
  bodyweightKg: number | null;
  from: string;
  today: string;
  plan?: PlanData & { workouts: Map<string, Workout> };
}

function describeSet(s: SetLog, ex: Exercise | undefined, unit: 'kg' | 'lb'): string {
  return [
    s.location ? LOCATION_LABELS[s.location] : null,
    s.discipline ? DISCIPLINE_LABELS[s.discipline].toLowerCase() : null,
    s.weightKg != null ? formatWeight(s.weightKg, unit, ex?.bodyweight ?? false) : null,
    s.reps != null ? `${s.reps} reps` : null,
    s.durationSec != null ? formatDuration(s.durationSec) : null,
    s.grade,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Identical sets collapsed: "+22 kg 10s ×3, +24 kg 10s". */
function collapse(parts: string[]): string {
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].map(([p, n]) => (n > 1 ? `${p || 'done'} ×${n}` : p || 'done')).join(', ');
}

/** The training log as compact Markdown for an LLM to read. */
export function trainingLog(input: TrainingLogInput): string {
  const { exercises, unit, from, today } = input;
  const sessions = input.sessions
    .filter((s) => s.log.completedAt.slice(0, 10) >= from)
    .sort((a, b) => b.log.completedAt.localeCompare(a.log.completedAt));
  const name = (id: string) => exercises.get(id)?.name ?? id;
  const lines: string[] = [];

  lines.push(`# My training log, ${formatDate(from)} – ${formatDate(today)}`);
  lines.push(
    `Units: ${unit}. Bodyweight: ${input.bodyweightKg != null ? formatWeight(input.bodyweightKg, unit) : 'not set'}. ` +
      'Weights on hangs, pull-ups and dips are added to bodyweight (negative = assisted). Times are per set.',
  );

  if (input.maxes.length) {
    lines.push('', '## Current maxes (latest test per exercise)');
    for (const m of input.maxes) {
      const ex = exercises.get(m.exerciseId);
      const how =
        m.kind === 'hold'
          ? `${m.holdSec} s hold`
          : m.reps && m.reps > 1
            ? `estimated 1RM from ${m.reps} reps at ${formatWeight(m.weightKg, unit, ex?.bodyweight ?? false)}`
            : '1 rep max';
      lines.push(
        `- ${name(m.exerciseId)} [${m.exerciseId}]: ${formatWeight(m.maxKg, unit, ex?.bodyweight ?? false)} (${how}), tested ${formatDate(m.testedAt.slice(0, 10))}`,
      );
    }
  }

  // Weekly totals, oldest first.
  const weeks = new Map<string, { n: number; sec: number }>();
  for (let w = mondayOf(from); w <= today; w = addDays(w, 7)) weeks.set(w, { n: 0, sec: 0 });
  for (const s of sessions) {
    const w = weeks.get(mondayOf(s.log.completedAt.slice(0, 10)));
    if (!w) continue;
    w.n += 1;
    w.sec += s.log.durationSec ?? 0;
  }
  lines.push('', '## Weekly totals');
  for (const [monday, w] of weeks) {
    lines.push(`- Week of ${formatShort(monday)}: ${plural(w.n, 'session')}${w.sec ? `, ${formatHours(w.sec)}` : ''}`);
  }

  if (input.plan?.plan.startDate) {
    const { plan, blocks, sessions: planned } = input.plan;
    const start = plan.startDate!;
    const done = new Set(sessions.map((s) => `${s.log.planSessionId}@${s.log.scheduledDate}`));
    const due = sessionsInRange(start, blocks, planned, from > start ? from : start, addDays(today, -1));
    const missed = due.filter((d) => !done.has(`${d.session.id}@${d.date}`));
    lines.push('', `## Plan adherence: ${plan.name} (started ${formatDate(start)})`);
    lines.push(`- Done ${due.length - missed.length} of ${due.length} planned sessions in this period.`);
    if (missed.length) {
      lines.push(
        `- Missed: ${missed.map((m) => `${formatDay(m.date)} ${input.plan!.workouts.get(m.session.workoutId)?.name ?? 'workout'}`).join('; ')}`,
      );
    }
  }

  lines.push('', '## Sessions (newest first)');
  if (sessions.length === 0) lines.push('No sessions logged in this period.');
  for (const { log, sets } of sessions) {
    const head = [
      formatDay(log.completedAt.slice(0, 10)),
      log.workoutName,
      log.durationSec ? formatHours(log.durationSec) : null,
      log.rpe ? `RPE ${log.rpe}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push('', `### ${head}`);
    if (log.notes) lines.push(`Notes: ${log.notes}`);
    const byItem = new Map<number, SetLog[]>();
    for (const s of sets) byItem.set(s.itemIndex, [...(byItem.get(s.itemIndex) ?? []), s]);
    for (const group of byItem.values()) {
      const ex = exercises.get(group[0].exerciseId);
      const done = group.filter((s) => s.completed);
      const missed = group.filter((s) => !s.completed);
      const fmt = (s: SetLog) => `${s.notes ? `${s.notes}: ` : ''}${describeSet(s, ex, unit)}`;
      let line = `- ${group[0].exerciseName}: ${done.length}/${group.length} sets`;
      if (done.length) line += ` · ${collapse(done.map(fmt))}`;
      if (missed.length) line += ` · not done: ${collapse(missed.map(fmt))}`;
      lines.push(line);
    }
  }
  return lines.join('\n');
}

/** The full prompt: instructions, format, library, training log and (optionally) the plan to adjust. */
export function buildReviewPrompt(args: {
  log: string;
  planFile?: ReturnType<typeof planToFile>;
  exercises: Exercise[];
  workouts: Workout[];
}): string {
  const planPart = args.planFile
    ? `## My current plan (JSON)\n\`\`\`json\n${JSON.stringify(args.planFile, null, 2)}\n\`\`\``
    : 'I don’t have an active plan yet.';
  return `I use the open-climb training app. Below is my recent training log${args.planFile ? ' and my current plan' : ''}.

Please review my training: consistency, progress on my key lifts and hangs, signs of fatigue (RPE, notes, missed sets), and the balance between training types. Then ask me what I'd like to change.

When I ask you to change my plan, reply with the COMPLETE updated plan as ONE JSON object in a \`\`\`json code block (plain JSON, no comments), using the format below.${
    args.planFile
      ? ` Keep "planId" exactly as it is so the app updates my existing plan (keeping its start date and my history) instead of creating a new one. Keep the weeks that have already happened as they are unless I ask otherwise, and keep the ids of workouts you modify.`
      : ''
  }

Format:
\`\`\`ts
${FORMAT_SPEC}
\`\`\`

${libraryList(args.exercises, args.workouts)}

${args.log}

${planPart}`;
}

