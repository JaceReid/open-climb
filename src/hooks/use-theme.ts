import { useColorScheme } from 'react-native';

import { Colors, type Palette } from '@/constants/theme';

export function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useTheme(): Palette {
  return Colors[useScheme()];
}
