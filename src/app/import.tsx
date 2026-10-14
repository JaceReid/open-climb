// Import a plan (or just workouts/exercises) in the open-climb-plan JSON format:
// paste/open JSON -> preview -> import. The prompt for Claude lives in Settings.
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Button, Card, Field, Icon, Row, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { applyImport, applyPlanUpdate, listPlans } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises, useWorkouts } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { EXAMPLE_PLAN } from '@/lib/import/example';
import { parseImport, type ImportResult } from '@/lib/import/resolve';
import { plural } from '@/lib/format';
import { WEEKDAY_SHORT } from '@/lib/types';

export default function ImportScreen() {
  const db = useSQLiteContext();
  const c = useTheme();
  const { exercises } = useExercises();
  const { workouts, byId: workoutsById } = useWorkouts();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const { data: plans } = useQuery(listPlans);

  const check = (t: string) => {
    setText(t);
    setResult(t.trim() ? parseImport(t, { exercises, workouts, plans: plans ?? [] }) : null);
  };

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (!t.trim()) return Alert.alert('Clipboard is empty', 'Copy the JSON from Claude first.');
    check(t);
  };

  const openFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    try {
      check(await new File(picked.assets[0].uri).text());
    } catch (e) {
      Alert.alert('Could not read file', String(e));
    }
  };

  const doImport = async (asNewPlan = false) => {
    if (!result?.ok) return;
    setImporting(true);
    try {
      const target = result.preview.updatePlan;
      if (target && !asNewPlan) {
        await applyPlanUpdate(db, target.id, result.preview);
        router.replace(`/plan/${target.id}`);
        return;
      }
      const planId = await applyImport(db, result.preview);
      if (planId) {
        router.replace(`/plan/${planId}`);
      } else {
        const n = result.preview.newWorkouts.length;
        Alert.alert('Imported', `Added ${n} workout${n === 1 ? '' : 's'} to your library.`);
        router.replace('/library');
      }
    } catch (e) {
      setImporting(false);
      Alert.alert('Import failed', String(e));
    }
  };

  const preview = result?.ok ? result.preview : null;
  const nameOfWorkout = (id: string) =>
    [...(preview?.newWorkouts ?? []), ...(preview?.updatedWorkouts ?? [])].find((w) => w.id === id)?.name ??
    workoutsById.get(id)?.name ??
    id;

  return (
    <Screen>
      <Card>
        <T variant="heading">Add the plan JSON</T>
        <T tone="secondary">Copy Claude’s JSON reply (the copy button on the code block works well), then:</T>
        <Row>
          <Button title="Paste" icon="clipboard-text-outline" onPress={paste} style={{ flex: 1 }} />
          <Button title="Open file" icon="file-outline" variant="tonal" onPress={openFile} style={{ flex: 1 }} />
        </Row>
        <Field
          placeholder="…or paste the JSON here"
          value={text}
          onChangeText={check}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          style={{ minHeight: 100, maxHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
        />
        <Button title="Try the example plan" variant="ghost" small onPress={() => check(JSON.stringify(EXAMPLE_PLAN, null, 2))} />
      </Card>

      {!result ? (
        <T variant="caption" tone="secondary">
          Need the prompt that tells Claude this format? It’s in{' '}
          <T variant="caption" tone="accent" onPress={() => router.push('/settings')}>
            Settings → Plan with Claude
          </T>
          .
        </T>
      ) : null}

      {result && !result.ok ? (
        <Card style={{ borderColor: c.danger }}>
          <Row>
            <Icon name="alert-circle-outline" color={c.danger} />
            <T variant="heading" tone="danger">
              Can’t import this yet
            </T>
          </Row>
          {result.errors.slice(0, 12).map((e, i) => (
            <T key={i} variant="caption">
              • {e}
            </T>
          ))}
          <T variant="caption" tone="secondary">
            Tip: paste these errors back to Claude and ask it to fix the JSON.
          </T>
        </Card>
      ) : null}

      {preview ? (
        <Section title="Preview">
          <Card accent>
            <T variant="title">{preview.plan?.name ?? 'Library items'}</T>
            {preview.plan?.goal ? <T tone="secondary">Goal: {preview.plan.goal}</T> : null}
            {preview.plan?.description ? <T>{preview.plan.description}</T> : null}
            <Row style={{ flexWrap: 'wrap' }}>
              {preview.plan ? (
                <Badge label={`${preview.blocks.reduce((n, b) => n + b.weeks, 0)} weeks`} tone="accent" />
              ) : null}
              <Badge label={plural(preview.newWorkouts.length, 'new workout')} />
              {preview.updatedWorkouts.length ? <Badge label={plural(preview.updatedWorkouts.length, 'updated workout')} tone="accent2" /> : null}
              <Badge label={plural(preview.newExercises.length, 'new exercise')} />
            </Row>
          </Card>

          {preview.blocks.map((b, i) => {
            const week1 = b.sessions.filter((s) => s.week === 1);
            return (
              <Card key={i}>
                <T variant="heading">
                  {i + 1}. {b.name} · {b.weeks} {b.weeks === 1 ? 'week' : 'weeks'}
                </T>
                {b.focus ? <T variant="caption" tone="secondary">{b.focus}</T> : null}
                <View style={{ gap: 2, marginTop: Spacing.xs }}>
                  <T variant="label" tone="secondary">
                    Week 1
                  </T>
                  {week1.length === 0 ? <T tone="secondary">No sessions</T> : null}
                  {week1.map((s, j) => (
                    <T key={j}>
                      {WEEKDAY_SHORT[s.day]}: {nameOfWorkout(s.workoutId)}
                    </T>
                  ))}
                  {b.weeks > 1 ? (
                    <T variant="caption" tone="secondary">
                      {b.sessions.length} sessions over {b.weeks} weeks
                    </T>
                  ) : null}
                </View>
              </Card>
            );
          })}

          {preview.warnings.length ? (
            <Card>
              <T variant="label" tone="secondary">
                Notes
              </T>
              {preview.warnings.map((w, i) => (
                <T key={i} variant="caption">
                  • {w}
                </T>
              ))}
            </Card>
          ) : null}

          {preview.updatePlan ? (
            <>
              <Card accent>
                <T variant="heading">Updates “{preview.updatePlan.name}”</T>
                <T tone="secondary">
                  Replaces its blocks and schedule with this version. The start date stays the same, and sessions you’ve
                  already logged stay ticked off where the new schedule has the same workout that day.
                </T>
              </Card>
              <Button title="Update plan" icon="update" onPress={() => doImport()} disabled={importing} />
              <Button title="Import as a new plan instead" variant="ghost" small onPress={() => doImport(true)} disabled={importing} />
            </>
          ) : (
            <>
              <Button
                title={preview.plan ? 'Import plan' : 'Import to library'}
                icon="import"
                onPress={() => doImport()}
                disabled={importing}
              />
              {preview.plan ? (
                <T variant="caption" tone="secondary">
                  You’ll choose the start week after importing.
                </T>
              ) : null}
            </>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
