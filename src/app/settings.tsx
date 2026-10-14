import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Share, Switch } from 'react-native';

import { Button, Card, NumberField, Row, Screen, Section, Segmented, T } from '@/components/ui';
import { setSetting } from '@/db/repo';
import { useExercises, useSettings, useWorkouts } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { displayWeight, unitToKg } from '@/lib/format';
import { buildClaudePrompt } from '@/lib/import/prompt';
import type { Settings } from '@/lib/types';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const c = useTheme();
  const settings = useSettings();
  const { exercises } = useExercises();
  const { workouts } = useWorkouts();
  const [copied, setCopied] = useState(false);

  // Built on demand so it always lists the current library, custom items included.
  const prompt = () => buildClaudePrompt(exercises, workouts);
  const copyPrompt = async () => {
    await Clipboard.setStringAsync(prompt());
    setCopied(true);
  };
  const sharePrompt = () => Share.share({ message: prompt() }).catch(() => {});

  const toggle = (key: 'sound' | 'voice' | 'vibrate', label: string, hint: string) => (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }}>
          <T style={{ flex: 1 }}>
            <T variant="heading">{label}</T>
            {'\n'}
            <T variant="caption" tone="secondary">
              {hint}
            </T>
          </T>
        </Row>
        <Switch value={settings[key]} onValueChange={(v) => setSetting(db, key, v)} trackColor={{ true: c.accent }} thumbColor="#FFFFFF" />
      </Row>
    </Card>
  );

  return (
    <Screen>
      <Section title="Plan with Claude">
        <Card>
          <T>
            This prompt teaches Claude the open-climb plan format and lists your exercise library, so Claude can reply
            with a plan you can import directly.
          </T>
          <T variant="caption" tone="secondary">
            Paste it into the chat where you planned your training. To set it up once, add it to a Claude Project’s
            instructions so every chat in that project already knows the format.
          </T>
          <Row>
            <Button
              title={copied ? 'Copied' : 'Copy prompt'}
              icon={copied ? 'check' : 'content-copy'}
              onPress={copyPrompt}
              style={{ flex: 1 }}
            />
            <Button title="Share" icon="share-variant-outline" variant="tonal" onPress={sharePrompt} style={{ flex: 1 }} />
          </Row>
          <Button title="Import a plan" icon="import" variant="ghost" small onPress={() => router.push('/import')} />
        </Card>
      </Section>

      <Section title="Units">
        <Segmented<Settings['unit']>
          options={[
            { value: 'kg', label: 'Kilograms' },
            { value: 'lb', label: 'Pounds' },
          ]}
          value={settings.unit}
          onChange={(v) => setSetting(db, 'unit', v)}
        />
      </Section>

      <Section title="You">
        <Row>
          <NumberField
            label="Bodyweight"
            suffix={settings.unit}
            value={settings.bodyweightKg != null ? displayWeight(settings.bodyweightKg, settings.unit) : undefined}
            onChange={(v) => setSetting(db, 'bodyweightKg', v == null ? null : unitToKg(v, settings.unit))}
            placeholder="–"
          />
        </Row>
        <T variant="caption" tone="secondary">
          Used to chart hangs and weighted pull-ups as a percentage of bodyweight. Saved with each session, so update it
          when it changes.
        </T>
      </Section>

      <Section title="Strength">
        <Row>
          <NumberField
            label="Working weight"
            suffix="% of max"
            integer
            value={settings.workingPct}
            onChange={(v) => setSetting(db, 'workingPct', Math.min(100, Math.max(1, v ?? 80)))}
          />
        </Row>
        <T variant="caption" tone="secondary">
          Shown on exercise pages next to your tested max. Workouts can set their own % per exercise. For hangs and
          pull-ups it&apos;s a % of total load (bodyweight + added).
        </T>
      </Section>

      <Section title="Timer">
        <Row>
          <NumberField
            label="Get-ready countdown"
            suffix="s"
            integer
            value={settings.prepSec}
            onChange={(v) => setSetting(db, 'prepSec', Math.min(60, v ?? 0))}
          />
        </Row>
        {toggle('sound', 'Beeps', 'Countdown and start/stop beeps.')}
        {toggle('voice', 'Voice', 'Speaks the next exercise and rest periods.')}
        {toggle('vibrate', 'Vibration', 'Buzz when a hang or rest starts.')}
      </Section>

      <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
        open-climb · free software (GPL-3.0) · all data stays on this device
      </T>
    </Screen>
  );
}
