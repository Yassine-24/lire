import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getCurrentSession, getReadingSegments, listBooks, type Book, type CurrentSession, type ReadingSegment } from '@/data/books';
import { finishSession, pauseSession, resumeSession } from '@/data/reading';
import { Button, Card, Eyebrow, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts, spacing } from '@/design/tokens';
import { dateLabel, formatDuration, localDayKey, secondsByLocalDay, sumSegmentSeconds } from '@/domain/time';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);
  const [segments, setSegments] = useState<ReadingSegment[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [nextBooks, nextSegments, nextSession] = await Promise.all([
      listBooks(db),
      getReadingSegments(db),
      getCurrentSession(db),
    ]);
    setBooks(nextBooks);
    setSegments(nextSegments);
    setSession(nextSession);
    setNow(new Date());
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => setError('Your reading data could not be loaded. Please reopen Lire.'));
    }, [load]),
  );

  const isSessionRunning = session?.status === 'running';

  useEffect(() => {
    if (!isSessionRunning) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isSessionRunning]);

  const dayTotals = secondsByLocalDay(segments, now);
  const todaySeconds = dayTotals[localDayKey(now)] ?? 0;
  const readingBooks = books.filter((book) => book.status === 'reading');
  const sessionSeconds = session ? sumSegmentSeconds(session.segments, now) : 0;
  const activeSegment = session?.segments.find((segment) => segment.ended_at === null);
  const sessionAgeHours = activeSegment
    ? (now.getTime() - Date.parse(activeSegment.started_at)) / 3600000
    : 0;

  async function runSessionAction(action: 'pause' | 'resume' | 'finish') {
    if (!session) return;
    setError('');
    try {
      if (action === 'pause') await pauseSession(db, session.id);
      if (action === 'resume') await resumeSession(db, session.id);
      if (action === 'finish') await finishSession(db, session.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.');
      await load();
    }
  }

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Eyebrow>Lire · Your reading companion</Eyebrow>
        <PageTitle>Today</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 }}>
          {dateLabel(now)}
        </Text>
      </View>

      <Card style={{ padding: 22 }}>
        <Eyebrow>Time with a book</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 44, lineHeight: 52 }}>
          {formatDuration(todaySeconds)}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          A little reading counts. No goal required.
        </Text>
      </Card>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      {session ? (
        <Card dark style={{ padding: 20 }}>
          <Eyebrow>
            {session.status === 'running' ? 'In your hands now' : 'A quiet pause'}
          </Eyebrow>
          <Text style={{ color: colors.white, fontFamily: fonts.display, fontSize: 25, lineHeight: 31 }}>
            {session.book_title}
          </Text>
          {session.book_author ? (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 }}>
              {session.book_author}
            </Text>
          ) : null}
          <Text style={{ color: colors.white, fontFamily: fonts.display, fontSize: 38, marginTop: 5 }}>
            {formatDuration(sessionSeconds)}
          </Text>
          {sessionAgeHours > 6 ? (
            <StatusMessage warning>
              This timer has been open for more than six hours. Pause or finish it if you stopped reading.
            </StatusMessage>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Button
              variant="soft"
              style={{ flex: 1 }}
              onPress={() => void runSessionAction(session.status === 'running' ? 'pause' : 'resume')}
            >
              {session.status === 'running' ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="outline"
              style={{ flex: 1, borderColor: colors.border }}
              onPress={() => void runSessionAction('finish')}
            >
              Finish
            </Button>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: session.book_id } })}
            style={{ paddingVertical: 5 }}
          >
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, fontWeight: '600' }}>
              View book details
            </Text>
          </Pressable>
        </Card>
      ) : (
        <Card style={{ padding: 20 }}>
          <Eyebrow>Ready when you are</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }}>
            Make a little room for a book.
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
            Choose a book from your library to start a session. Your timer stays on this device.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 3 }}>
            <Button style={{ flex: 1 }} onPress={() => router.push('/book/new')}>
              Add a book
            </Button>
            <Button variant="outline" style={{ flex: 1 }} onPress={() => router.push('/library')}>
              Library
            </Button>
          </View>
        </Card>
      )}

      {readingBooks.length > 0 && !session ? (
        <View style={{ gap: 13 }}>
          <SectionTitle detail="Tap to start reading">Pick up a book</SectionTitle>
          <View style={{ gap: 10 }}>
            {readingBooks.slice(0, 3).map((book) => (
              <Pressable
                key={book.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: spacing.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18 }}>
                    {book.title}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
                    {book.author || 'Author not added'}
                  </Text>
                </View>
                <Text style={{ color: colors.accent, fontFamily: fonts.body, fontWeight: '700', fontSize: 12 }}>
                  Read →
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ paddingBottom: 4 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
          Your library and reading history stay on this device.
        </Text>
      </View>
    </Page>
  );
}
