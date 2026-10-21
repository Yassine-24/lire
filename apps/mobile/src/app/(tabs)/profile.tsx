import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Session } from '@supabase/supabase-js';
import { Button, Card, Eyebrow, Field, Page, PageTitle, StatusMessage } from '@/components/ui';
import { clearLocalReadingData } from '@/data/privacy';
import { getSetting, saveSetting, setDailyReminder } from '@/data/settings';
import { supabase, supabaseConfigured } from '@/data/supabase';
import { synchronizeReadingData } from '@/data/sync';
import { colors, fonts } from '@/design/tokens';

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { recovery: rawRecovery } = useLocalSearchParams<{ recovery?: string }>();
  const recovery = Array.isArray(rawRecovery) ? rawRecovery[0] : rawRecovery;
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [manualRecoveryMode, setManualRecoveryMode] = useState(false);
  const recoveryMode = recovery === '1' || manualRecoveryMode;
  const [busy, setBusy] = useState<'signin' | 'signup' | 'sync' | 'delete-account' | 'delete-local' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [deleteAccountPrompt, setDeleteAccountPrompt] = useState(false);
  const [deleteLocalPrompt, setDeleteLocalPrompt] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);


  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        getSetting(db, 'daily_reminder_enabled'),
        getSetting(db, 'daily_reminder_time'),
      ]).then(([enabled, time]) => {
        if (!active) return;
        setReminderEnabled(enabled === 'true');
        setReminderTime(time || '19:00');
      }).catch(() => setError('Your profile settings could not be loaded.'));
      return () => { active = false; };
    }, [db]),
  );

  async function signInOrUp(mode: 'signin' | 'signup') {
    if (!supabase) return;
    if (!email.trim() || password.length < 8) {
      setError('Enter your email and a password with at least eight characters.');
      return;
    }
    setBusy(mode);
    setError('');
    setMessage('');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: 'lire://auth/callback' },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setMessage('Check your email to confirm the account. The link will return to Lire.');
      } else {
        setMessage(mode === 'signup' ? 'Account created. Your reading stays on this device until you sync.' : 'Signed in. Your local library is ready to sync.');
      }
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your account request could not be completed.');
    } finally {
      setBusy(null);
    }
  }

  async function sendPasswordReset() {
    if (!supabase) return;
    if (!email.trim()) {
      setError('Enter your account email first.');
      return;
    }
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'lire://auth/callback',
      });
      if (resetError) throw resetError;
      setMessage('If the account exists, a password reset link is on its way.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A reset link could not be sent.');
    }
  }

  async function saveNewPassword() {
    if (!supabase) return;
    if (newPassword.length < 8) {
      setError('Choose a password with at least eight characters.');
      return;
    }
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) setError(updateError.message);
    else {
      setNewPassword('');
      setManualRecoveryMode(false);
      setMessage('Your password was updated.');
      router.replace('/(tabs)/profile');
    }
  }

  async function syncNow() {
    if (!supabase || !session?.user.id) return;
    setBusy('sync');
    setError('');
    setMessage('');
    try {
      const counts = await synchronizeReadingData(db, session.user.id);
      setMessage(`Sync complete · ${counts.books} books · ${counts.sessions} completed sessions. Active timers stay on this device.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your library could not be synced.');
    } finally {
      setBusy(null);
    }
  }

  async function updateReminder(enabled: boolean) {
    setError('');
    setMessage('');
    try {
      await setDailyReminder(db, enabled, reminderTime);
      setReminderEnabled(enabled);
      setMessage(enabled ? `Daily reminder set for ${reminderTime}.` : 'Reading reminder turned off.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reading reminder could not be updated.');
    }
  }

  async function saveReminderTime() {
    if (!reminderEnabled) {
      const match = /^(\d{2}):(\d{2})$/.exec(reminderTime);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
        setError('Enter a time as HH:MM using the 24-hour clock.');
        return;
      }
      setError('');
      try {
        await saveSetting(db, 'daily_reminder_time', reminderTime);
        setMessage('Reminder time saved. Turn reminders on when you are ready.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The reminder time could not be saved.');
      }
      return;
    }
    await updateReminder(true);
  }

  async function signOut() {
    if (!supabase) return;
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else setMessage('Signed out. Your local books and reading history are still on this device.');
  }

  async function deleteAccount() {
    if (!supabase) return;
    setBusy('delete-account');
    setError('');
    try {
      const { error: functionError } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (functionError) throw functionError;
      await supabase.auth.signOut();
      await clearLocalReadingData(db);
      setSession(null);
      setDeleteAccountPrompt(false);
      setMessage('The account and this device’s Lire data were deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The account could not be deleted.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteLocalData() {
    setBusy('delete-local');
    setError('');
    try {
      await clearLocalReadingData(db);
      setDeleteLocalPrompt(false);
      setMessage('Books and reading history on this device were deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local data could not be deleted.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Eyebrow>Your reading, your settings</Eyebrow>
        <PageTitle>Profile</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Lire works without an account. Your library stays local unless you choose to sync it.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}

      <Card>
        <Eyebrow>Account and sync</Eyebrow>
        {!supabaseConfigured ? (
          <>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>Cloud sync is optional</Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
              To enable it, configure the Supabase URL and publishable key, apply the included database migration, then rebuild the app. Until then, Lire remains fully usable offline.
            </Text>
          </>
        ) : session ? (
          <>
            {recoveryMode ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>Choose a new password</Text>
                <Field label="New password" autoCapitalize="none" onChangeText={setNewPassword} secureTextEntry value={newPassword} />
                <Button onPress={() => void saveNewPassword()}>Save new password</Button>
              </View>
            ) : null}
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>Signed in</Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>{session.user.email}</Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 }}>
              Sync copies books and completed sessions to your private account. Active timers remain on the device where they started.
            </Text>
            <Button disabled={busy !== null} onPress={() => void syncNow()}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</Button>
            <Button variant="outline" disabled={busy !== null} onPress={() => void signOut()}>Sign out</Button>
            {deleteAccountPrompt ? (
              <View style={{ gap: 9 }}>
                <StatusMessage warning>This permanently deletes your account, cloud library, sessions, and local data on this device.</StatusMessage>
                <Button variant="danger" disabled={busy !== null} onPress={() => void deleteAccount()}>{busy === 'delete-account' ? 'Deleting…' : 'Delete account and data'}</Button>
                <Button variant="outline" disabled={busy !== null} onPress={() => setDeleteAccountPrompt(false)}>Cancel</Button>
              </View>
            ) : (
              <Button variant="outline" disabled={busy !== null} onPress={() => setDeleteAccountPrompt(true)}>Delete account…</Button>
            )}
          </>
        ) : (
          <>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
              Sign in only if you want a private cloud copy across devices. The timer itself stays local.
            </Text>
            <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} value={email} />
            <Field label="Password" autoCapitalize="none" autoComplete="password" onChangeText={setPassword} secureTextEntry value={password} />
            <Button disabled={busy !== null} onPress={() => void signInOrUp('signin')}>{busy === 'signin' ? 'Signing in…' : 'Sign in'}</Button>
            <Button variant="outline" disabled={busy !== null} onPress={() => void signInOrUp('signup')}>{busy === 'signup' ? 'Creating account…' : 'Create account'}</Button>
            <PressableLink label="Forgot password?" onPress={() => void sendPasswordReset()} />
          </>
        )}
      </Card>

      <Card>
        <Eyebrow>Reading reminder</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>A gentle daily nudge</Text>
        {Platform.OS === 'web' ? (
          <StatusMessage>Reading reminders are not available in the browser build yet.</StatusMessage>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>Daily reminder</Text>
              <Switch
                accessibilityLabel="Daily reading reminder"
                onValueChange={(value) => void updateReminder(value)}
                thumbColor={reminderEnabled ? colors.white : '#9AA2A9'}
                trackColor={{ false: colors.border, true: colors.accentStrong }}
                value={reminderEnabled}
              />
            </View>
            <Field label="Reminder time (24-hour HH:MM)" keyboardType="numbers-and-punctuation" onChangeText={setReminderTime} placeholder="19:00" value={reminderTime} />
            <Button variant="outline" onPress={() => void saveReminderTime()}>Save reminder time</Button>
          </>
        )}
      </Card>

      <Card>
        <Eyebrow>Import and export</Eyebrow>
        <Button variant="outline" onPress={() => router.push('/import-goodreads')}>Import Goodreads CSV</Button>
        <Button variant="outline" onPress={() => router.push('/backup')}>Back up or restore data</Button>
      </Card>

      <Card>
        <Eyebrow>Privacy</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>Private by default</Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Books, notes, and reading history stay on this device unless cloud sync is enabled. Catalog searches send the query to Open Library (directly or through the configured Lire catalog adapter). Covers load from Open Library. Lire has no social feed or ad tracking.
        </Text>
        {deleteLocalPrompt ? (
          <View style={{ gap: 9 }}>
            <StatusMessage warning>This permanently removes all books and reading history stored on this device. Export a backup first if you may want it later.</StatusMessage>
            <Button variant="danger" disabled={busy !== null} onPress={() => void deleteLocalData()}>{busy === 'delete-local' ? 'Deleting…' : 'Delete local data'}</Button>
            <Button variant="outline" disabled={busy !== null} onPress={() => setDeleteLocalPrompt(false)}>Cancel</Button>
          </View>
        ) : (
          <Button variant="outline" onPress={() => setDeleteLocalPrompt(true)}>Delete local data…</Button>
        )}
      </Card>

      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <Eyebrow>Open source</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 17 }}>Lire · MIT</Text>
        </View>
        <Button variant="outline" onPress={() => void Linking.openURL('https://github.com/Yassine-24/lire').catch(() => {})}>Project</Button>
      </Card>
    </Page>
  );
}

function PressableLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700', paddingVertical: 4 }}>
      {label}
    </Text>
  );
}
