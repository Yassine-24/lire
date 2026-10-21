import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/design/tokens';

type Props = { children: ReactNode };
type State = { error: Error | null };

function isAnotherTabStorageError(error: Error): boolean {
  const message = `${error.name} ${error.message}`.toLowerCase();
  return [
    'invalidstateerror',
    'invalid state',
    'nomodificationallowederror',
    'access handle',
    'createsyncaccesshandle',
  ].some((fragment) => message.includes(fragment));
}

export function SQLiteTabLock({ children }: Props) {
  const lockManager = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? navigator.locks
    : undefined;
  const [hasDatabaseLock, setHasDatabaseLock] = useState(() => lockManager === undefined);
  const [lockError, setLockError] = useState<Error | null>(null);

  useEffect(() => {
    if (!lockManager) return;

    let mounted = true;
    let releaseLock: (() => void) | undefined;
    const controller = new AbortController();
    void lockManager.request(
      'lire-local-sqlite-database',
      { mode: 'exclusive', signal: controller.signal },
      async (lock) => {
        if (!lock || !mounted) return;
        setHasDatabaseLock(true);
        await new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
      },
    ).catch((error: unknown) => {
      if (!mounted || (error instanceof Error && error.name === 'AbortError')) return;
      setLockError(error instanceof Error ? error : new Error(String(error)));
    });

    return () => {
      mounted = false;
      controller.abort();
      releaseLock?.();
    };
  }, [lockManager]);

  if (lockError) throw lockError;
  if (!hasDatabaseLock) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LIBRARY STORAGE</Text>
          <Text style={styles.title}>Lire is open in another tab.</Text>
          <Text style={styles.body}>
            This browser’s local database is in use by the other Lire tab. This tab will open your library automatically when the other tab closes.
          </Text>
        </View>
      </View>
    );
  }
  return children;
}

export class DatabaseErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Lire could not initialize its local database.', error, info);
  }

  private reload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const multiTabConflict = isAnotherTabStorageError(error);
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LIBRARY STORAGE</Text>
          <Text style={styles.title}>
            {multiTabConflict ? 'Lire is open in another tab.' : 'Lire could not open your library.'}
          </Text>
          <Text style={styles.body}>
            {multiTabConflict
              ? 'This browser version uses a local SQLite database that is limited to one active tab. Close the other Lire tab, then reload this one. The account-based Lire site will allow separate tabs after it is deployed.'
              : 'Reload the page to try again. If the problem continues, use your JSON backup to restore your library.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={this.reload} style={styles.button}>
            <Text style={styles.buttonText}>Reload Lire</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.background,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
});
