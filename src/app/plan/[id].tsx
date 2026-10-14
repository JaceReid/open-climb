import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { ClaudeReviewCard } from '@/components/claude-review';
import { Badge, Button, Card, Empty, Field, IconButton, Loading, Row, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  activatePlan,
  addBlock,
  deactivatePlan,
  deletePlan,
  getPlanBundle,
  moveBlock,
  updatePlan,
} from '@/db/repo';
import { useQuery } from '@/db/store';
import { addDays, formatDay, formatShort, mondayOf, today } from '@/lib/dates';
import { blockRanges, planEndDate, totalWeeks } from '@/lib/schedule';
import type { Plan } from '@/lib/types';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { data: bundle, loading } = useQuery((d) => getPlanBundle(d, id), [id]);
  const [pickingStart, setPickingStart] = useState(false);
  const [start, setStart] = useState(() => mondayOf(today()));

  const plan = bundle?.plan;
  if (loading) return <Loading />;
  if (!bundle || !plan) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Plan not found" />
      </Screen>
    );
  }
  const { blocks, sessions } = bundle;

  const ranges = plan.startDate ? blockRanges(plan.startDate, blocks) : null;
  const weeks = totalWeeks(blocks);

  const remove = () =>
    Alert.alert('Delete plan?', 'The plan and its schedule are deleted. Workouts and your logged history are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlan(db, plan.id);
          router.back();
        },
      },
    ]);

  const newBlock = async () => {
    const blockId = await addBlock(db, plan.id, `Block ${blocks.length + 1}`, 4);
    router.push(`/plan/block/${blockId}`);
  };

  const activate = async () => {
    await activatePlan(db, plan.id, start);
    setPickingStart(false);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: plan.name }} />

      <Card>
        {plan.isActive && plan.startDate ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="heading">Active</T>
              <Badge label="Active" tone="accent" />
            </Row>
            <T tone="secondary">
              {formatDay(plan.startDate)} → {formatDay(planEndDate(plan.startDate, blocks))} · {weeks} weeks
            </T>
          </>
        ) : (
          <>
            <T variant="heading">Not scheduled</T>
            <T tone="secondary">
              {weeks} weeks · {sessions.length} sessions. Start it to see sessions on your Today screen.
            </T>
          </>
        )}
        {pickingStart ? (
          <View style={{ gap: Spacing.sm }}>
            <T variant="label" tone="secondary">
              First week starts on
            </T>
            <Row style={{ justifyContent: 'space-between' }}>
              <IconButton name="chevron-left" label="Earlier week" onPress={() => setStart(addDays(start, -7))} />
              <T variant="heading">{formatDay(start)}</T>
              <IconButton name="chevron-right" label="Later week" onPress={() => setStart(addDays(start, 7))} />
            </Row>
            <Row>
              <Button title="Cancel" variant="secondary" small style={{ flex: 1 }} onPress={() => setPickingStart(false)} />
              <Button title={plan.isActive ? 'Update start' : 'Start plan'} small style={{ flex: 1 }} onPress={activate} disabled={blocks.length === 0} />
            </Row>
          </View>
        ) : (
          <Row>
            <Button
              title={plan.isActive ? 'Change start week' : 'Start this plan'}
              icon="calendar-start"
              small
              variant={plan.isActive ? 'secondary' : 'primary'}
              style={{ flex: 1 }}
              disabled={blocks.length === 0}
              onPress={() => {
                setStart(plan.startDate ?? mondayOf(today()));
                setPickingStart(true);
              }}
            />
            {plan.isActive ? (
              <Button title="Stop" small variant="secondary" style={{ flex: 1 }} onPress={() => deactivatePlan(db, plan.id)} />
            ) : null}
          </Row>
        )}
      </Card>

      <Section title={`Blocks (${blocks.length})`}>
        {blocks.length === 0 ? (
          <T tone="secondary">Add a block, e.g. “Strength, 4 weeks”, then schedule workouts on its days.</T>
        ) : null}
        {blocks.map((b, i) => {
          const range = ranges?.[i];
          const perWeek = sessions.filter((s) => s.blockId === b.id).length / Math.max(1, b.weeks);
          return (
            <Card key={b.id} onPress={() => router.push(`/plan/block/${b.id}`)}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T variant="heading">
                    {i + 1}. {b.name}
                  </T>
                  <T variant="caption" tone="secondary">
                    {[
                      `${b.weeks} ${b.weeks === 1 ? 'week' : 'weeks'}`,
                      `~${Math.round(perWeek * 10) / 10} sessions/week`,
                      range ? `${formatShort(range.startDate)} – ${formatShort(range.endDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                  {b.focus ? <T variant="caption">{b.focus}</T> : null}
                </View>
                <IconButton name="arrow-up" label="Move up" disabled={i === 0} onPress={() => moveBlock(db, plan.id, b.id, -1)} />
                <IconButton
                  name="arrow-down"
                  label="Move down"
                  disabled={i === blocks.length - 1}
                  onPress={() => moveBlock(db, plan.id, b.id, 1)}
                />
              </Row>
            </Card>
          );
        })}
        <Button title="Add block" icon="plus" variant="tonal" onPress={newBlock} />
      </Section>

      <ClaudeReviewCard planId={plan.id} />

      <PlanDetails key={plan.id} plan={plan} />

      <Button title="Delete plan" variant="danger" icon="trash-can-outline" onPress={remove} />
    </Screen>
  );
}

/** Name/goal/description, saved when a field loses focus. */
function PlanDetails({ plan }: { plan: Plan }) {
  const db = useSQLiteContext();
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState(plan.goal);
  const [description, setDescription] = useState(plan.description);
  const save = () =>
    updatePlan(db, { id: plan.id, name: name.trim() || plan.name, goal: goal.trim(), description: description.trim() });
  return (
    <Section title="Details">
      <Field label="Name" value={name} onChangeText={setName} onEndEditing={save} />
      <Field label="Goal" value={goal} onChangeText={setGoal} onEndEditing={save} placeholder="e.g. Send 7B by spring" />
      <Field label="Description" value={description} onChangeText={setDescription} onEndEditing={save} multiline />
    </Section>
  );
}
