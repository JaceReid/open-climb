import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Badge, Button, Empty, ListItem, Row, Screen, Section, T } from '@/components/ui';
import { createPlan, listPlans } from '@/db/repo';
import { useQuery } from '@/db/store';
import { formatShort } from '@/lib/dates';
import { plural } from '@/lib/format';

export default function PlansScreen() {
  const db = useSQLiteContext();
  const { data: plans } = useQuery(listPlans);

  const newPlan = async () => {
    const id = await createPlan(db, 'New plan');
    router.push(`/plan/${id}`);
  };

  return (
    <Screen title="Plans" subtitle="Training blocks and schedules">
      <Row>
        <Button title="Import plan" icon="import" onPress={() => router.push('/import')} style={{ flex: 1 }} />
        <Button title="New plan" icon="plus" variant="tonal" onPress={newPlan} style={{ flex: 1 }} />
      </Row>

      {plans && plans.length === 0 ? (
        <Empty
          icon="calendar-month-outline"
          title="No plans yet"
          message="A plan is a sequence of training blocks (e.g. 4 weeks strength, 3 weeks power, 1 week deload), each with a weekly schedule of workouts."
        />
      ) : (
        <Section title="Your plans">
          {plans?.map((p) => (
            <ListItem
              key={p.id}
              title={p.name}
              subtitle={[
                plural(p.weeks, 'week'),
                plural(p.sessions, 'session'),
                p.isActive && p.startDate ? `from ${formatShort(p.startDate)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={p.isActive ? <Badge label="Active" tone="accent" /> : undefined}
              onPress={() => router.push(`/plan/${p.id}`)}
            />
          ))}
        </Section>
      )}
      <T variant="caption" tone="secondary">
        Tip: plan your training with Claude. Get the prompt from Settings → Plan with Claude, then import Claude’s
        reply here.
      </T>
    </Screen>
  );
}
