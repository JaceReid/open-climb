// Single-series time chart: 2px line, ringed markers, hairline grid, an
// endpoint label, and touch-to-inspect crosshair + tooltip. No area fill: the
// y-axis is not zero-based, and a filled area would imply it is.
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween, formatShort } from '@/lib/dates';
import { niceTicks } from '@/lib/ticks';

import { T } from './ui';

export interface ChartPoint {
  date: string;
  y: number;
}

const PAD = { top: 16, right: 44, bottom: 24, left: 44 };

export function LineChart({
  data,
  formatY,
  integerTicks,
  height = 180,
}: {
  data: ChartPoint[];
  formatY: (y: number) => string;
  /** Snap ticks to whole numbers (used for grade indices). */
  integerTicks?: boolean;
  height?: number;
}) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const ys = data.map((d) => d.y);
  let ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  if (integerTicks) ticks = [...new Set(ticks.map(Math.round))];
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const span = data.length > 1 ? Math.max(1, daysBetween(data[0].date, data[data.length - 1].date)) : 1;

  const xOf = (i: number) =>
    data.length === 1 ? PAD.left + plotW / 2 : PAD.left + (daysBetween(data[0].date, data[i].date) / span) * plotW;
  const yOf = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin || 1)) * plotH;

  const pts = data.map((d, i) => [xOf(i), yOf(d.y)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const nearest = (x: number) => {
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(pts[best][0] - x)) best = i;
    return best;
  };

  const last = pts.length - 1;
  const sel = active ?? null;

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => setActive(nearest(e.nativeEvent.locationX))}
      onResponderMove={(e) => setActive(nearest(e.nativeEvent.locationX))}
      onResponderTerminationRequest={() => true}
      accessibilityLabel={`Chart with ${data.length} sessions. Latest ${formatY(data[last]?.y ?? 0)}.`}>
      {width > 0 && data.length > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD.left} x2={PAD.left + plotW} y1={yOf(t)} y2={yOf(t)} stroke={c.grid} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 8} y={yOf(t) + 4} fontSize={11} fill={c.textSecondary} textAnchor="end">
              {formatY(t)}
            </SvgText>
          ))}
          <SvgText x={PAD.left} y={height - 6} fontSize={11} fill={c.textSecondary} textAnchor="start">
            {formatShort(data[0].date)}
          </SvgText>
          {data.length > 1 ? (
            <SvgText x={PAD.left + plotW} y={height - 6} fontSize={11} fill={c.textSecondary} textAnchor="end">
              {formatShort(data[last].date)}
            </SvgText>
          ) : null}

          {pts.length > 1 ? (
            <Path d={line} stroke={c.series1} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {pts.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={i === sel ? 6 : 4} fill={c.series1} stroke={c.surface} strokeWidth={2} />
          ))}

          {sel == null ? (
            <SvgText x={pts[last][0] + 8} y={pts[last][1] + 4} fontSize={12} fontWeight="700" fill={c.text}>
              {formatY(data[last].y)}
            </SvgText>
          ) : (
            <Line
              x1={pts[sel][0]}
              x2={pts[sel][0]}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={c.textSecondary}
              strokeWidth={1}
            />
          )}
        </Svg>
      ) : null}
      {sel != null && pts[sel] ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              left: Math.min(Math.max(pts[sel][0] - 60, 0), Math.max(0, width - 120)),
            },
          ]}>
          <T variant="caption" tone="secondary">
            {formatShort(data[sel].date)}
          </T>
          <T variant="heading">{formatY(data[sel].y)}</T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    width: 120,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
