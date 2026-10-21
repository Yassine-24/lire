import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { withAppTransaction } from '@/data/transactions';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const result = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return result?.value ?? null;
}

export async function saveSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await saveSettings(db, [[key, value]]);
}

async function saveSettings(db: SQLiteDatabase, values: [string, string][]): Promise<void> {
  await withAppTransaction(db, async (transaction) => {
    for (const [key, value] of values) {
      await transaction.runAsync(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    }
  });
}

export async function setDailyReminder(
  db: SQLiteDatabase,
  enabled: boolean,
  time: string,
): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Reading reminders are available in the installed iOS and Android apps.');

  const match = enabled ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  if (enabled && !match) throw new Error('Enter a reminder time as HH:MM using the 24-hour clock.');
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  if (enabled && (hour > 23 || minute > 59)) throw new Error('That reminder time is not valid.');

  const previousId = await getSetting(db, 'daily_reminder_notification_id');
  if (!enabled) {
    if (previousId) await Notifications.cancelScheduledNotificationAsync(previousId);
    await saveSettings(db, [
      ['daily_reminder_enabled', 'false'],
      ['daily_reminder_notification_id', ''],
    ]);
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reading-reminders', {
      name: 'Reading reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();
  if (!permissions.granted) throw new Error('Allow notifications in system settings to turn on reading reminders.');

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'A little time for a book?',
      body: 'Your next reading session is ready when you are.',
      data: { screen: 'today' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? 'reading-reminders' : undefined,
    },
  });
  try {
    await saveSettings(db, [
      ['daily_reminder_time', time],
      ['daily_reminder_enabled', 'true'],
      ['daily_reminder_notification_id', identifier],
    ]);
  } catch (error) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    throw error;
  }
  if (previousId && previousId !== identifier) {
    try {
      await Notifications.cancelScheduledNotificationAsync(previousId);
    } catch {
      // Keep the new, persisted reminder active if an old OS schedule cannot be removed.
    }
  }
}
