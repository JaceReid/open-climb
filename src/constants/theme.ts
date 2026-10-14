import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import type { TrainingType } from '@/lib/types';

// Two accents with separate jobs:
// - accent (teal): actions and progress, i.e. primary buttons, the selected day,
//   tabs, completion ticks, chart lines.
// - accent2 (coral): tags and selections, i.e. category/focus badges, selected
//   filter chips, scheduled-session dots.
// Text on each accent and on its Soft tint is at least 4.5:1.
export const Colors = {
  light: {
    background: '#F3F6F5',
    surface: '#FFFFFF',
    surfaceAlt: '#E9EFED',
    border: '#D5DEDB',
    text: '#15201E',
    textSecondary: '#5B6966',
    accent: '#0E7C74',
    accentSoft: '#E6F6F3',
    onAccent: '#FFFFFF',
    accent2: '#C4452F',
    accent2Soft: '#FFF2EE',
    onAccent2: '#FFFFFF',
    success: '#0E7C74',
    danger: '#B91C1C',
    // Full-screen timer phases (white text on top).
    ready: '#3A4644',
    prep: '#A16207',
    work: '#B91C1C',
    rest: '#1D4ED8',
    setRest: '#0F766E',
    // Chart series (validated with the dataviz palette checker against `surface`)
    series1: '#0D9488',
    grid: '#E3E9E7',
  },
  dark: {
    background: '#0E1413',
    surface: '#172120',
    surfaceAlt: '#212D2B',
    border: '#2C3A37',
    text: '#EEF4F2',
    textSecondary: '#9DB0AC',
    accent: '#2DD4BF',
    accentSoft: '#0F3A35',
    onAccent: '#06201D',
    accent2: '#FF8A73',
    accent2Soft: '#3A211B',
    onAccent2: '#2A0F09',
    success: '#2DD4BF',
    danger: '#F87171',
    ready: '#1F2928',
    prep: '#A16207',
    work: '#B91C1C',
    rest: '#1D4ED8',
    setRest: '#0F766E',
    series1: '#12A594',
    grid: '#24302E',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

// Training-type colours for the Progress pie and legends: the dataviz reference
// categorical palette in its validated slot order (adjacent-pair CVD safe in both
// modes against `surface`), so each type keeps one colour everywhere. Light
// power/power-endurance/endurance sit below 3:1, so these always ship with text
// labels (the legend). "Other" is a neutral grey.
export const TypeColors: Record<'light' | 'dark', Record<TrainingType, string>> = {
  light: {
    'finger-strength': '#2a78d6',
    strength: '#eb6834',
    power: '#1baf7a',
    'power-endurance': '#eda100',
    endurance: '#e87ba4',
    technique: '#008300',
    prehab: '#6250d6',
    mobility: '#e34948',
    other: '#808C89',
  },
  dark: {
    'finger-strength': '#3987e5',
    strength: '#d95926',
    power: '#199e70',
    'power-endurance': '#c98500',
    endurance: '#d55181',
    technique: '#008300',
    prehab: '#9085e9',
    mobility: '#e66767',
    other: '#71807C',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
    },
  };
}
