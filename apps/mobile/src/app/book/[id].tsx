import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getBook, getBookSessionHistory, getCurrentSession, updateBookStatus, type Book, type BookStatus, type CurrentSession, type SessionHistoryItem } from '@/data/books';
import { finishSession, pauseSession, resumeSession, startSession } from '@/data/reading';
import { Button, Card, Chip, Eyebrow, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { formatDuration, sumSegmentSeconds } from '@/domain/time';

const statusOptions: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
];

export default function BookDetailScreen() {
  const db = useSQLiteContext();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [book, setBook] = useState<Book | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    const [nextBook, nextSession, nextHistory] = await Promise.all([
      getBook(db, id),
      getCurrentSession(db),
      getBookSessionHistory(db, id),
    ]);
    setBook(nextBook);
    setSession(nextSession);
    setHistory(nextHistory);
    setNow(new Date());
    setIsLoading(false);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => {
        setError('This book could not be loaded.');
        setIsLoading(false);
      });
    }, [load]),
  );

  const matchingSession = session?.book_id === id ? session : null;

  const runningSessionId = matchingSession?.status === 'running' ? matchingSession.id : null;

  useEffect(() => {
    if (!runningSessionId) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [runningSessionId]);

  const sessionSeconds = matchingSession ? sumSegmentSeconds(matchingSession.segments, now) : 0;

  async function perform(action: 'start' | 'pause' | 'resume' | 'finish') {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'start') await startSession(db, id);
      if (action === 'pause' && matchingSession) await pauseSession(db, matchingSession.id);
      if (action === 'resume' && matchingSession) await resumeSession(db, matchingSession.id);
      if (action === 'finish' && matchingSession) await finishSession(db, matchingSession.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: BookStatus) {
    if (!book) return;
    setError('');
    try {
      await updateBookStatus(db, book.id, status);
      await load();
    } catch {
      setError('The shelf could not be updated.');
    }
  }

  if (!book) {
    return (
      <Page>
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={{ color: colors.forest, fontFamily: fonts.body, fontWeight: '700' }}>‹ Back</Text>
        </Pressable>
        <Card>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
            {isLoading ? 'Loading book…' : error || 'This book is not in your library.'}
          </Text>
          <Button variant="outline" onPress={() => router.back()}>Go back</Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <View style={{ gap: 10 }}>
        <Pressable accessibilityRole="link" onPress={() => router.back()} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.forest, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
            ‹ Back
          </Text>
        </Pressable>
        <Eyebrow>Your book</Eyebrow>
        <PageTitle>{book.title}</PageTitle>
        <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 15 }}>
          {book.author || 'Author not added'}
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <Card style={{ padding: 20 }}>
        <Eyebrow>Reading time</Eyebrow>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 35 }}>
          {formatDuration(history.reduce((total, item) => total + item.seconds, 0) + sessionSeconds)}
        </Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 13 }}>
          {history.length + (matchingSession ? 1 : 0)} reading {history.length === 1 ? 'session' : 'sessions'}
        </Text>
      </Card>

      {session && session.book_id !== id ? (
        <StatusMessage warning>
          Your timer is currently with {session.book_title}. Finish or pause that session before starting another.
        </StatusMessage>
      ) : matchingSession ? (
        <Card dark style={{ padding: 20 }}>
          <Eyebrow>{matchingSession.status === 'running' ? 'Reading now' : 'Session paused'}</Eyebrow>
          <Text style={{ color: colors.white, fontFamily: fonts.display, fontSize: 34 }}>
            {formatDuration(sessionSeconds)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              variant="soft"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => void perform(matchingSession.status === 'running' ? 'pause' : 'resume')}
            >
              {matchingSession.status === 'running' ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              style={{ flex: 1, borderColor: '#607D69' }}
              onPress={() => void perform('finish')}
            >
              Finish
            </Button>
          </View>
        </Card>
      ) : (
        <Button disabled={busy || Boolean(session)} onPress={() => void perform('start')}>
          {busy ? 'Starting…' : 'Start a reading session'}
        </Button>
      )}

      <View style={{ gap: 12 }}>
        <SectionTitle>On your shelf</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {statusOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={book.status === option.key}
              onPress={() => void changeStatus(option.key)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle detail={history.length > 0 ? String(history.length) : undefined}>Past sessions</SectionTitle>
        {history.length === 0 ? (
          <Card>
            <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
              Finished sessions with this book will appear here.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 9 }}>
            {history.map((item) => (
              <Card key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 13 }}>
                  {new Date(item.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.body, fontWeight: '700', fontSize: 13 }}>
                  {formatDuration(item.seconds)}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Page>
  );
}
