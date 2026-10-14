// Part-to-whole donut: at most ~6 slices, a 2px surface gap between them, tap to
// highlight one. Identity is never colour alone; it is paired with a legend.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const GAP_PX = 2;

function point(cx: number, cy: number, r: number, a: number) {
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}

export function DonutChart({
  slices,
  selected,
  onSelect,
  size = 200,
  thickness = 30,
  center,
}: {
  slices: DonutSlice[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const R = size / 2;
  const r = R - thickness;
  const c = size / 2;
  const toggle = (key: string) => onSelect(selected === key ? null : key);
  const opacity = (key: string) => (selected && selected !== key ? 0.3 : 1);

  let angle = -Math.PI / 2;
  const pad = slices.length > 1 ? GAP_PX / R : 0;

  return (
    <View
      style={{ width: size, height: size, alignSelf: 'center' }}
      accessibilityLabel={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)} percent`).join(', ')}>
      <Svg width={size} height={size}>
        {slices.length === 1 ? (
          <Circle
            cx={c}
            cy={c}
            r={(R + r) / 2}
            stroke={slices[0].color}
            strokeWidth={thickness}
            fill="none"
            opacity={opacity(slices[0].key)}
            onPress={() => toggle(slices[0].key)}
          />
        ) : (
          slices.map((s) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const a0 = angle + pad / 2;
            const a1 = angle + sweep - pad / 2;
            angle += sweep;
            if (a1 <= a0) return null;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const d = [
              `M${point(c, c, R, a0)}`,
              `A${R},${R} 0 ${large} 1 ${point(c, c, R, a1)}`,
              `L${point(c, c, r, a1)}`,
              `A${r},${r} 0 ${large} 0 ${point(c, c, r, a0)}`,
              'Z',
            ].join(' ');
            return <Path key={s.key} d={d} fill={s.color} opacity={opacity(s.key)} onPress={() => toggle(s.key)} />;
          })
        )}
      </Svg>
      {center ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: thickness + 8 }}>
          {center}
        </View>
      ) : null}
    </View>
  );
}
