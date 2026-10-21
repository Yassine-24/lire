import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting } from '@/data/settings';
import { withAppTransaction } from '@/data/transactions';

export async function clearLocalReadingData(db: SQLiteDatabase): Promise<void> {
  const reminderId = await getSetting(db, 'daily_reminder_notification_id');
  if (reminderId && Platform.OS !== 'web') {
    try {
      await Notifications.cancelScheduledNotificationAsync(reminderId);
    } catch {
      // Local data deletion should still complete if the OS no longer has the schedule.
    }
  }
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync('DELETE FROM session_segments');
    await transaction.runAsync('DELETE FROM reading_sessions');
    await transaction.runAsync('DELETE FROM books');
    await transaction.runAsync('DELETE FROM app_settings');
    await transaction.runAsync('DELETE FROM deleted_book_ids');
  });
}
