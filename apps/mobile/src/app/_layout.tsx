import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '@/data/database';
import { colors } from '@/design/tokens';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="lire.db" onInit={initializeDatabase}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="backup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="import-goodreads" options={{ presentation: 'modal' }} />
        <Stack.Screen name="book/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="book/[id]" />
      </Stack>
    </SQLiteProvider>
  );
}
