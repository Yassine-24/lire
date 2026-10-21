import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createBackup, parseBackup, restoreBackup, type LireBackup } from '@/data/backup';
import { chooseBackupFile, saveBackupFile } from '@/data/backupFile';
import { Button, Card, Eyebrow, Page, PageTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';

const maxBackupLength = 10 * 1024 * 1024;
type BusyAction = 'export' | 'pick' | 'restore' | null;

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingBackup, setPendingBackup] = useState<LireBackup | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);

  async function exportData() {
    setBusy('export');
    setError('');
    setMessage('');
    try {
      const contents = await createBackup(db);
      await saveBackupFile(contents);
      setMessage('Your Lire backup is ready. Store the JSON file somewhere private.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your backup could not be created.');
    } finally {
      setBusy(null);
    }
  }

  async function selectBackup() {
    setBusy('pick');
    setError('');
    setMessage('');
    setPendingBackup(null);
    setRestoreComplete(false);
    try {
      const contents = await chooseBackupFile();
      if (contents === null) return;
      if (contents.length > maxBackupLength) {
        throw new Error('This backup is larger than Lire can safely restore.');
      }
      setPendingBackup(parseBackup(contents));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That backup file could not be opened.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmRestore() {
    if (!pendingBackup) return;
    setBusy('restore');
    setError('');
    setMessage('');
    try {
      await restoreBackup(db, pendingBackup);
      setPendingBackup(null);
      setRestoreComplete(true);
      setMessage('Backup restored. Any timer from the backup is paused and ready to resume.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The backup could not be restored.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <Pressable accessibilityRole="link" onPress={() => router.back()} style={{ paddingVertical: 4 }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
          ‹ Back
        </Text>
      </Pressable>

      <View style={{ gap: 9 }}>
        <Eyebrow>Your data, in your hands</Eyebrow>
        <PageTitle>Backup</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Save a portable copy of your books and reading history, or restore a copy you made earlier.
        </Text>
      </View>

      <StatusMessage>
        Backups contain book titles, authors, and reading times. Keep the JSON file somewhere private.
      </StatusMessage>
      {error ? <StatusMessage warning>{error}</StatusMessage> : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}

      <Card>
        <Eyebrow>Export</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 21 }}>
          Keep a copy of your library
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Create a JSON file you can save or move to another device. A running timer is saved paused at the time of export; your timer here keeps running.
        </Text>
        <Button disabled={busy !== null} onPress={() => void exportData()}>
          {busy === 'export' ? 'Preparing backup…' : 'Export JSON backup'}
        </Button>
      </Card>

      <Card>
        <Eyebrow>Import</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 21 }}>
          Restore a Lire backup
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Choose a JSON backup. Lire checks the file before offering to restore it.
        </Text>
        <Button variant="outline" disabled={busy !== null} onPress={() => void selectBackup()}>
          {busy === 'pick' ? 'Checking backup…' : 'Choose backup file'}
        </Button>
      </Card>

      {pendingBackup ? (
        <Card style={{ borderColor: colors.accent, gap: 12 }}>
          <Eyebrow>Backup checked</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>
            {pendingBackup.books.length} {pendingBackup.books.length === 1 ? 'book' : 'books'} · {pendingBackup.sessions.length} {pendingBackup.sessions.length === 1 ? 'session' : 'sessions'}
          </Text>
          <StatusMessage warning>
            Restoring replaces all books and reading history on this device. A timer saved in the backup will be paused.
          </StatusMessage>
          <Button variant="danger" disabled={busy !== null} onPress={() => void confirmRestore()}>
            {busy === 'restore' ? 'Restoring backup…' : 'Replace data with this backup'}
          </Button>
          <Button variant="outline" disabled={busy !== null} onPress={() => setPendingBackup(null)}>
            Cancel
          </Button>
        </Card>
      ) : null}

      {restoreComplete ? (
        <Button variant="outline" onPress={() => router.back()}>
          Done
        </Button>
      ) : null}
    </Page>
  );
}
