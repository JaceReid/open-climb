import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Origin } from '@/data/library';
import { useTheme } from '@/hooks/use-theme';
import { formatDetails, formatSetsReps } from '@/lib/format';
import type { Exercise, Settings, WorkoutItem } from '@/lib/types';

import { Badge, Row, T } from './ui';

/** One exercise line inside a workout: name, sets/reps and details. */
export function ItemSummary({
  item,
  exercise,
  unit,
  index,
}: {
  item: WorkoutItem;
  exercise: Exercise | undefined;
  unit: Settings['unit'];
  index?: number;
}) {
  const c = useTheme();
  const details = formatDetails(item, exercise, unit);
  return (
    <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
      {index != null ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: c.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}>
          <T variant="label" tone="secondary">
            {index + 1}
          </T>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="heading">{exercise?.name ?? 'Unknown exercise'}</T>
        <T tone="secondary">{formatSetsReps(item)}</T>
        {details ? (
          <T variant="caption" tone="secondary">
            {details}
          </T>
        ) : null}
        {item.notes ? (
          <T variant="caption" style={{ fontStyle: 'italic' }}>
            {item.notes}
          </T>
        ) : null}
      </View>
    </Row>
  );
}

/** Library / Edited / Custom tag. `quiet` hides the plain Library tag in lists. */
export function OriginBadge({ origin, quiet }: { origin: Origin; quiet?: boolean }) {
  if (origin === 'library') return quiet ? null : <Badge label="Library" />;
  return <Badge label={origin === 'edited' ? 'Edited' : 'Custom'} tone="accent2" />;
}
