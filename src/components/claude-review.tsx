// Copy/share the training log + plan for Claude to review, and get back to the
// import screen with its reply (which updates the plan in place).
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Share } from 'react-native';

import { reviewPrompt } from '@/db/claude';

import { Button, Card, Chip, Row, T } from './ui';

const WEEK_OPTIONS = [4, 8, 12];

export function ClaudeReviewCard({ planId, title = 'Adjust with Claude' }: { planId?: string; title?: string }) {
  const db = useSQLiteContext();
  const [weeks, setWeeks] = useState(8);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      return await reviewPrompt(db, { planId, weeks });
    } catch (e) {
      Alert.alert('Could not build the review', String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    const text = await build();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
  };
  const share = async () => {
    const text = await build();
    if (text) await Share.share({ message: text }).catch(() => {});
  };

  return (
    <Card>
      <T variant="heading">{title}</T>
      <T tone="secondary">
        Gives Claude your training log (sessions, sets, RPE, notes, maxes, missed sessions)
        {planId ? ' and this plan' : ' and your active plan'}. Ask it to review your training or change the plan; paste
        its JSON reply into Import and the plan updates in place, keeping its start date and history.
      </T>
      <Row style={{ flexWrap: 'wrap' }}>
        <T variant="caption" tone="secondary">
          History:
        </T>
        {WEEK_OPTIONS.map((w) => (
          <Chip key={w} label={`${w} weeks`} selected={weeks === w} onPress={() => setWeeks(w)} />
        ))}
      </Row>
      <Row>
        <Button
          title={copied ? 'Copied' : 'Copy for Claude'}
          icon={copied ? 'check' : 'content-copy'}
          onPress={copy}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <Button title="Share" icon="share-variant-outline" variant="tonal" onPress={share} disabled={busy} style={{ flex: 1 }} />
      </Row>
      <Button title="Import Claude’s reply" icon="import" variant="ghost" small onPress={() => router.push('/import')} />
    </Card>
  );
}
