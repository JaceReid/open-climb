import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { Colors, navigationTheme } from '@/constants/theme';
import { DB_NAME, migrate } from '@/db/migrations';
import { useScheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

async function init(db: SQLiteDatabase) {
  try {
    await migrate(db);
  } finally {
    SplashScreen.hide();
  }
}

export default function RootLayout() {
  const scheme = useScheme();
  const c = Colors[scheme];
  return (
    <ThemeProvider value={navigationTheme(scheme)}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SQLiteProvider databaseName={DB_NAME} onInit={init}>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: c.background },
            headerTintColor: c.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: c.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/run" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="test/run" options={{ title: 'Max test', gestureEnabled: false }} />
          <Stack.Screen name="import" options={{ title: 'Import plan' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
