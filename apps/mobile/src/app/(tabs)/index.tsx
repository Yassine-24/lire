import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getCurrentSession, getReadingSegments, listBooks, type Book, type CurrentSession, type ReadingSegment } from '@/data/books';
import { correctSessionDuration, finishSession, pauseSession, resumeSession, startSession } from '@/data/reading';
import { BookCover } from '@/components/BookCover';
import { Button, Card, Eyebrow, Field, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { dateLabel, localDayKey, secondsByLocalDay, sumSegmentSeconds } from '@/domain/time';

const CLOCK_SIZE = 222;
const CLOCK_CENTER = CLOCK_SIZE / 2;

function clockDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function TodayClock({ seconds, running }: { seconds: number; running: boolean }) {
  const ticks = Array.from({ length: 60 }, (_, index) => {
    const major = index % 5 === 0;
    const width = major ? 2 : 1;
    const height = major ? 8 : 4;
    const angle = (index / 60) * Math.PI * 2 - Math.PI / 2;
    const radius = CLOCK_CENTER - 8;
    return {
      key: index,
      width,
      height,
      left: CLOCK_CENTER + Math.cos(angle) * radius - width / 2,
      top: CLOCK_CENTER + Math.sin(angle) * radius - height / 2,
      rotation: index * 6,
      color: index % 15 === 0 ? colors.accent : major ? '#727D86' : '#343D45',
    };
  });

  return (
    <Card dark style={{ padding: 18, gap: 14, alignItems: 'center' }}>
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <Eyebrow>Today’s reading</Eyebrow>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>Time set aside for books</Text>
        </View>
        <View style={{ backgroundColor: running ? colors.accentSoft : colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: running ? colors.accentLight : colors.textMuted, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 }}>
            {running ? 'LIVE' : 'LOCAL'}
          </Text>
        </View>
      </View>

      <View
        accessible
        accessibilityLabel={`Today's reading time ${clockDuration(seconds)}${running ? ', live timer' : ''}`}
        style={{ alignItems: 'center', paddingVertical: 2 }}
      >
        <View
          style={{
            width: CLOCK_SIZE,
            height: CLOCK_SIZE,
            borderRadius: CLOCK_CENTER,
            backgroundColor: '#0C1014',
            borderColor: running ? '#5A3826' : '#303941',
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.accent,
            shadowOpacity: running ? 0.22 : 0.1,
            shadowRadius: running ? 26 : 15,
            shadowOffset: { width: 0, height: 0 },
            elevation: running ? 8 : 3,
          }}
        >
          <View style={{ position: 'absolute', left: 14, top: 14, right: 14, bottom: 14, borderRadius: CLOCK_CENTER, borderWidth: 1, borderColor: '#20272E' }} />
          {ticks.map((tick) => (
            <View
              key={tick.key}
              style={{
                position: 'absolute',
                left: tick.left,
                top: tick.top,
                width: tick.width,
                height: tick.height,
                borderRadius: 2,
                backgroundColor: tick.color,
                transform: [{ rotate: tick.rotation + 'deg' }],
              }}
            />
          ))}
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: running ? colors.accentLight : colors.textMuted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 }}>
              {running ? 'SESSION IN PROGRESS' : 'READING TIME'}
            </Text>
            <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 30, fontWeight: '600', letterSpacing: -1.8, fontVariant: ['tabular-nums'] }}>
              {clockDuration(seconds)}
            </Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 9, letterSpacing: 1.5 }}>HOURS · MIN · SEC</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function StartReadingCard({
  books,
  busy,
  onStart,
  onOpenBook,
  onAdd,
  onLibrary,
}: {
  books: Book[];
  busy: string;
  onStart: (bookId: string) => void;
  onOpenBook: (bookId: string) => void;
  onAdd: () => void;
  onLibrary: () => void;
}) {
  return (
    <Card style={{ padding: 18, borderColor: '#54301E', backgroundColor: '#191713' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Ready when you are</Eyebrow>
        <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 10 }}>01 / START</Text>
      </View>
      {books.length > 0 ? (
        <>
          <SectionTitle detail="Start in one tap">Pick up a book</SectionTitle>
          <View style={{ gap: 9 }}>
            {books.slice(0, 2).map((book) => (
              <View key={book.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${book.title} in your library`}
                  onPress={() => onOpenBook(book.id)}
                  style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.72 : 1 })}
                >
                  <BookCover title={book.title} uri={book.cover_url} width={42} height={58} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 15, fontWeight: '700' }}>{book.title}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>{book.author || 'Ready to read'} · {book.status === 'reading' ? 'IN PROGRESS' : 'NEXT UP'}</Text>
                    {book.page_count ? <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9 }}>PAGE {book.current_page} / {book.page_count}</Text> : null}
                  </View>
                </Pressable>
                <Button disabled={busy.length > 0} onPress={() => onStart(book.id)} style={{ minHeight: 42, paddingHorizontal: 13, borderRadius: 13 }}>
                  {busy === book.id ? 'Starting…' : 'Start'}
                </Button>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="link" onPress={onLibrary} style={{ alignSelf: 'center', paddingVertical: 2 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' }}>Browse your library →</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 21, lineHeight: 27, fontWeight: '700' }}>
            Choose a book and start reading.
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
            Your timer is ready. Add a title or choose one from your shelves.
          </Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Button style={{ flex: 1 }} onPress={onAdd}>Find a book</Button>
            <Button variant="outline" style={{ flex: 1 }} onPress={onLibrary}>My library</Button>
          </View>
        </>
      )}
    </Card>
  );
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);
  const [segments, setSegments] = useState<ReadingSegment[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [correctionMinutes, setCorrectionMinutes] = useState('');
  const [busyBookId, setBusyBookId] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);

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
    if (nextSession) setCorrectionMinutes(String(Math.round(sumSegmentSeconds(nextSession.segments, new Date()) / 60)));
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
  const startBooks = books.filter((book) => book.status !== 'finished');
  const sessionSeconds = session ? sumSegmentSeconds(session.segments, now) : 0;
  const activeBook = session ? books.find((book) => book.id === session.book_id) : undefined;
  const activeSegment = session?.segments.find((segment) => segment.ended_at === null);
  const sessionAgeHours = activeSegment ? (now.getTime() - Date.parse(activeSegment.started_at)) / 3600000 : 0;

  async function beginReading(bookId: string) {
    setBusyBookId(bookId);
    setError('');
    try {
      await startSession(db, bookId);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A reading session could not be started.');
    } finally {
      setBusyBookId('');
    }
  }

  async function runSessionAction(action: 'pause' | 'resume' | 'finish') {
    if (!session) return;
    setSessionBusy(true);
    setError('');
    try {
      if (action === 'pause') await pauseSession(db, session.id);
      if (action === 'resume') await resumeSession(db, session.id);
      if (action === 'finish') await finishSession(db, session.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.');
      await load();
    } finally {
      setSessionBusy(false);
    }
  }

  async function correctLongSession(finish: boolean) {
    if (!session) return;
    const minutes = Number(correctionMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 0) {
      setError('Enter the corrected total reading time as whole minutes.');
      return;
    }
    setSessionBusy(true);
    setError('');
    try {
      await correctSessionDuration(db, session.id, minutes, finish);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reading time could not be corrected.');
    } finally {
      setSessionBusy(false);
    }
  }

  return (
    <Page contentStyle={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Eyebrow>A little time for a book</Eyebrow>
          <PageTitle>Today</PageTitle>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
            {dateLabel(now)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a book"
          onPress={() => router.push('/book/new')}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#704027',
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 27, fontWeight: '400', marginTop: -2 }}>+</Text>
        </Pressable>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      {!session ? (
        <StartReadingCard
          books={startBooks}
          busy={busyBookId}
          onStart={(bookId) => void beginReading(bookId)}
          onOpenBook={(bookId) => router.push({ pathname: '/book/[id]', params: { id: bookId } })}
          onAdd={() => router.push('/book/new')}
          onLibrary={() => router.push('/(tabs)/library')}
        />
      ) : (
        <Card dark style={{ padding: 18, borderColor: session.status === 'running' ? '#6A402A' : colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>{session.status === 'running' ? 'You’re reading' : 'Session paused'}</Eyebrow>
            <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.9 }}>{session.status === 'running' ? 'LIVE' : 'ON HOLD'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${session.book_title} in your library`}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: session.book_id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 13, opacity: pressed ? 0.75 : 1 })}
          >
            <BookCover title={session.book_title} uri={activeBook?.cover_url ?? null} width={52} height={70} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19, lineHeight: 24, fontWeight: '700' }}>{session.book_title}</Text>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>{session.book_author || 'Reading session'}</Text>
              {activeBook?.page_count ? <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9 }}>PAGE {activeBook.current_page} / {activeBook.page_count}</Text> : null}
            </View>
            <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 20, fontWeight: '600' }}>{clockDuration(sessionSeconds)}</Text>
          </Pressable>
          {sessionAgeHours > 6 ? (
            <View style={{ gap: 10 }}>
              <StatusMessage warning>This timer has been running for more than six hours. Correct your reading time before closing it.</StatusMessage>
              <Field label="Total time to keep (minutes)" keyboardType="number-pad" onChangeText={setCorrectionMinutes} value={correctionMinutes} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button variant="soft" disabled={sessionBusy} style={{ flex: 1 }} onPress={() => void correctLongSession(false)}>Correct and pause</Button>
                <Button variant="outline" disabled={sessionBusy} style={{ flex: 1 }} onPress={() => void correctLongSession(true)}>Correct and finish</Button>
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Button variant="soft" disabled={sessionBusy} style={{ flex: 1 }} onPress={() => void runSessionAction(session.status === 'running' ? 'pause' : 'resume')}>
              {session.status === 'running' ? 'Pause' : 'Resume reading'}
            </Button>
            <Button variant="outline" disabled={sessionBusy} style={{ flex: 1 }} onPress={() => void runSessionAction('finish')}>Finish session</Button>
          </View>
        </Card>
      )}

      <TodayClock seconds={todaySeconds} running={Boolean(isSessionRunning)} />

      {!session && startBooks.length > 2 ? (
        <View style={{ alignItems: 'center', paddingTop: 1 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>Showing your next two books · {startBooks.length} ready to read</Text>
        </View>
      ) : null}

      <View style={{ paddingBottom: 3, paddingTop: 1 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>
          A quiet record of the time you give to reading.
        </Text>
      </View>
    </Page>
  );
}
