import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

export type TransactionContext = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

let webTransactionQueue: Promise<void> = Promise.resolve();

export async function withAppTransaction(
  db: SQLiteDatabase,
  task: (transaction: TransactionContext) => Promise<void>,
): Promise<void> {
  if (Platform.OS !== 'web') {
    await db.withExclusiveTransactionAsync((transaction) => task(transaction));
    return;
  }

  let release: () => void = () => {};
  const previousTransaction = webTransactionQueue;
  webTransactionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previousTransaction;

  try {
    await db.withTransactionAsync(() => task(db));
  } finally {
    release();
  }
}
