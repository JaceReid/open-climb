// Single-series column chart: bars <= 24px with a 4px rounded top, square at a
// zero baseline, 2px gaps, hairline grid, and tap-to-inspect tooltip.
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { niceTicks } from '@/lib/ticks';

import { T } from './ui';

export interface BarDatum {
  key: string;
  /** Short axis label ("M", "12", "Oct"). */
  label: string;
  /** Full label for the tooltip ("Mon 13 Oct"). */
  tooltip: string;
  value: number;
}

const PAD = { top: 12, right: 6, bottom: 22, left: 40 };

function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

export function BarChart({
  data,
  formatAxis,
  formatValue,
  height = 180,
}: {
  data: BarDatum[];
  formatAxis: (v: number) => string;
  formatValue: (v: number) => string;
  height?: number;
}) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const n = data.length;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = max > 0 ? niceTicks(0, max) : [0, 1];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, n);
  const barW = Math.min(24, Math.max(2, slot - 2));
  const yOf = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const xOf = (i: number) => PAD.left + i * slot + (slot - barW) / 2;
  const every = Math.max(1, Math.ceil(n / 7));
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2);

  const pick = (x: number) => {
    const i = Math.floor((x - PAD.left) / slot);
    setActive(i >= 0 && i < n ? i : null);
  };

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderTerminationRequest={() => true}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD.left} x2={PAD.left + plotW} y1={yOf(t)} y2={yOf(t)} stroke={c.grid} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 8} y={yOf(t) + 4} fontSize={11} fill={c.textSecondary} textAnchor="end">
              {formatAxis(t)}
            </SvgText>
          ))}
          {data.map((d, i) =>
            d.value > 0 ? (
              <Path
                key={d.key}
                d={columnPath(xOf(i), yOf(d.value), barW, PAD.top + plotH - yOf(d.value))}
                fill={c.series1}
                opacity={active != null && active !== i ? 0.4 : 1}
              />
            ) : null,
          )}
          {data.map((d, i) =>
            showLabel(i) ? (
              <SvgText key={`x${d.key}`} x={xOf(i) + barW / 2} y={height - 6} fontSize={11} fill={c.textSecondary} textAnchor="middle">
                {d.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
      {active != null && data[active] ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              left: Math.min(Math.max(xOf(active) + barW / 2 - 70, 0), Math.max(0, width - 140)),
            },
          ]}>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {data[active].tooltip}
          </T>
          <T variant="heading">{formatValue(data[active].value)}</T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    width: 140,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
