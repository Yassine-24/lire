import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getBook, getBookSessionHistory, getCurrentSession, updateBookProgress, updateBookStatus, type Book, type BookStatus, type CurrentSession, type SessionHistoryItem } from '@/data/books';
import { finishSession, pauseSession, resumeSession, startSession } from '@/data/reading';
import { Button, Card, Chip, Eyebrow, Field, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { formatDuration, sumSegmentSeconds } from '@/domain/time';

const statusOptions: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
];

function returnToPreviousScreen() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/(tabs)/library');
}

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
  const [currentPageDraft, setCurrentPageDraft] = useState('0');
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

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
    if (nextBook) setCurrentPageDraft(String(nextBook.current_page));
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

  async function saveProgress() {
    if (!book) return;
    const currentPage = currentPageDraft.trim() ? Number(currentPageDraft) : 0;
    if (!Number.isSafeInteger(currentPage) || currentPage < 0) {
      setError('Current page must be a whole number of zero or more.');
      return;
    }
    if (book.page_count !== null && currentPage > book.page_count) {
      setError('Current page cannot be greater than the page total from Open Library.');
      return;
    }

    setProgressSaving(true);
    setError('');
    setProgressMessage('');
    try {
      await updateBookProgress(db, book.id, { currentPage, pageCount: book.page_count });
      await load();
      setProgressMessage('Reading position saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reading position could not be saved.');
    } finally {
      setProgressSaving(false);
    }
  }

  if (!book) {
    return (
      <Page>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen}>
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontWeight: '700' }}>‹ Back</Text>
        </Pressable>
        <Card>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {isLoading ? 'Loading book…' : error || 'This book is not in your library.'}
          </Text>
          <Button variant="outline" onPress={returnToPreviousScreen}>Go back</Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <View style={{ gap: 10 }}>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
            ‹ Back
          </Text>
        </Pressable>
        <Eyebrow>Your book</Eyebrow>
        <PageTitle>{book.title}</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 15 }}>
          {book.author || 'Author not added'}
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <Card style={{ padding: 20 }}>
        <Eyebrow>Reading time</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 35 }}>
          {formatDuration(history.reduce((total, item) => total + item.seconds, 0) + sessionSeconds)}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
          {history.length + (matchingSession ? 1 : 0)} reading {history.length === 1 ? 'session' : 'sessions'}
        </Text>
      </Card>

      <Card style={{ padding: 20, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Eyebrow>Reading progress</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 21, fontWeight: '700' }}>
            {book.page_count === null
              ? `Page ${book.current_page}`
              : `Page ${book.current_page} of ${book.page_count}`}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }}>
            {book.page_count === null
              ? 'Open Library has no page total for this edition.'
              : `${Math.round((book.current_page / book.page_count) * 100)}% complete · ${Math.max(0, book.page_count - book.current_page)} pages to go`}
          </Text>
        </View>
        {book.page_count !== null ? (
          <View style={{ height: 7, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View
              style={{
                height: 7,
                width: Math.min(100, Math.round((book.current_page / book.page_count) * 100)) + '%',
                borderRadius: 8,
                backgroundColor: colors.accent,
              }}
            />
          </View>
        ) : null}
        <Field
          label="Current page"
          keyboardType="number-pad"
          onChangeText={setCurrentPageDraft}
          placeholder="0"
          returnKeyType="done"
          value={currentPageDraft}
        />
        {progressMessage ? (
          <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 12 }}>
            {progressMessage}
          </Text>
        ) : null}
        <Button disabled={progressSaving} onPress={() => void saveProgress()}>
          {progressSaving ? 'Saving…' : 'Update page'}
        </Button>
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
              style={{ flex: 1, borderColor: colors.border }}
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
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
              Finished sessions with this book will appear here.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 9 }}>
            {history.map((item) => (
              <Card key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
                  {new Date(item.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={{ color: colors.text, fontFamily: fonts.body, fontWeight: '700', fontSize: 13 }}>
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
