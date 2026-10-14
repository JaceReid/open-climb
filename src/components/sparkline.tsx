// Tiny trend line for list rows: no axes, just the shape and the latest point.
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

export function Sparkline({ values, width = 72, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const c = useTheme();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const last = values.length - 1;
  return (
    <Svg width={width} height={height}>
      <Polyline
        points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        fill="none"
        stroke={c.series1}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={x(last)} cy={y(values[last])} r={3.5} fill={c.series1} stroke={c.surface} strokeWidth={1.5} />
    </Svg>
  );
}
