import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getCurrentSession, getReadingSegments, listBooks, type Book, type CurrentSession, type ReadingSegment } from '@/data/books';
import { correctSessionDuration, finishSession, pauseSession, resumeSession } from '@/data/reading';
import { Button, Card, Eyebrow, Field, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts, spacing } from '@/design/tokens';
import { dateLabel, localDayKey, secondsByLocalDay, sumSegmentSeconds } from '@/domain/time';

const CLOCK_SIZE = 248;
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
      color: index % 15 === 0 ? colors.accent : major ? '#66717C' : '#343B43',
    };
  });

  return (
    <Card dark style={{ padding: 20, gap: 18, backgroundColor: '#11161B', borderColor: '#29313A' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Daily reading clock</Eyebrow>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 }}>
          LOCAL / TODAY
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={`Today's reading time ${clockDuration(seconds)}${running ? ', live timer' : ''}`}
        style={{ alignItems: 'center', paddingVertical: 3 }}
      >
        <View
          style={{
            width: CLOCK_SIZE,
            height: CLOCK_SIZE,
            borderRadius: CLOCK_CENTER,
            backgroundColor: '#0D1115',
            borderColor: '#303841',
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.accent,
            shadowOpacity: running ? 0.18 : 0.07,
            shadowRadius: running ? 24 : 14,
            shadowOffset: { width: 0, height: 0 },
            elevation: running ? 8 : 3,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 15,
              top: 15,
              right: 15,
              bottom: 15,
              borderRadius: CLOCK_CENTER,
              borderWidth: 1,
              borderColor: '#20272E',
            }}
          />
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
          <View style={{ alignItems: 'center', gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: running ? colors.accent : '#67727D',
                }}
              />
              <Text
                style={{
                  color: running ? colors.accentLight : colors.textMuted,
                  fontFamily: fonts.body,
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 1.7,
                }}
              >
                {running ? 'SESSION LIVE' : 'TODAY SO FAR'}
              </Text>
            </View>
            <Text
              style={{
                color: colors.text,
                fontFamily: fonts.mono,
                fontSize: 32,
                fontWeight: '600',
                letterSpacing: -1.8,
                fontVariant: ['tabular-nums'],
              }}
            >
              {clockDuration(seconds)}
            </Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1.8 }}>
              HOURS : MIN : SEC
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
          {running ? 'Counting while you read' : 'Your time, on your device'}
        </Text>
        <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 }}>
          01 / DAY
        </Text>
      </View>
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
  const readingBooks = books.filter((book) => book.status === 'reading');
  const sessionSeconds = session ? sumSegmentSeconds(session.segments, now) : 0;
  const activeBook = session ? books.find((book) => book.id === session.book_id) : undefined;
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

  async function correctLongSession(finish: boolean) {
    if (!session) return;
    const minutes = Number(correctionMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 0) {
      setError('Enter the corrected total reading time as whole minutes.');
      return;
    }
    setError('');
    try {
      await correctSessionDuration(db, session.id, minutes, finish);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reading time could not be corrected.');
    }
  }

  return (
    <Page>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 7 }}>
          <Eyebrow>Lire / reading system</Eyebrow>
          <PageTitle>Today</PageTitle>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, letterSpacing: 1.1 }}>
            {dateLabel(now).toUpperCase()}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a book"
          onPress={() => router.push('/book/new')}
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: '#704027',
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 27, fontWeight: '400', marginTop: -2 }}>
            +
          </Text>
        </Pressable>
      </View>

      <TodayClock seconds={todaySeconds} running={Boolean(isSessionRunning)} />

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      {session ? (
        <Card style={{ padding: 20, borderColor: session.status === 'running' ? '#67361F' : colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>{session.status === 'running' ? 'Focus session / active' : 'Focus session / paused'}</Eyebrow>
            <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 }}>
              {session.status === 'running' ? 'LIVE' : 'HOLD'}
            </Text>
          </View>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 24, fontWeight: '700', lineHeight: 30 }}>
            {session.book_title}
          </Text>
          {session.book_author ? (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
              {session.book_author}
            </Text>
          ) : null}
          {activeBook?.page_count ? (
            <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.6 }}>
              PAGE {activeBook.current_page} / {activeBook.page_count}
            </Text>
          ) : null}
          <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 32, fontWeight: '600', marginTop: 2 }}>
            {clockDuration(sessionSeconds)}
          </Text>
          {sessionAgeHours > 6 ? (
            <View style={{ gap: 10 }}>
              <StatusMessage warning>
                This timer has been running for more than six hours. Confirm the time you actually read, or keep the full timer when you finish.
              </StatusMessage>
              <Field
                label="Total time to keep (whole minutes)"
                keyboardType="number-pad"
                onChangeText={setCorrectionMinutes}
                value={correctionMinutes}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button variant="soft" style={{ flex: 1 }} onPress={() => void correctLongSession(false)}>
                  Correct and pause
                </Button>
                <Button variant="outline" style={{ flex: 1 }} onPress={() => void correctLongSession(true)}>
                  Correct and finish
                </Button>
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Button
              variant="soft"
              style={{ flex: 1 }}
              onPress={() => void runSessionAction(session.status === 'running' ? 'pause' : 'resume')}
            >
              {session.status === 'running' ? 'Pause session' : 'Resume session'}
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
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' }}>
              Open book profile →
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {!session && readingBooks.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <Eyebrow>System idle</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 23, fontWeight: '700', lineHeight: 29 }}>
            Ready when you are.
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
            Add a book to start logging your time and page progress.
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
      ) : null}

      {readingBooks.length > 0 && !session ? (
        <View style={{ gap: 13 }}>
          <SectionTitle detail="Tap a title to begin">Pick up a book</SectionTitle>
          <View style={{ gap: 10 }}>
            {readingBooks.slice(0, 3).map((book, index) => {
              const progress = book.page_count
                ? Math.min(100, Math.round((book.current_page / book.page_count) * 100))
                : null;
              return (
                <Pressable
                  key={book.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
                  style={({ pressed }) => ({
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 17,
                    padding: spacing.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 43,
                      height: 57,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: index === 0 ? '#744126' : colors.border,
                      backgroundColor: index === 0 ? colors.accentSoft : colors.surfaceRaised,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: index === 0 ? colors.accent : colors.textMuted, fontFamily: fonts.mono, fontSize: 19 }}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 17, fontWeight: '700' }}>
                      {book.title}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                      {book.author || 'Author not added'}
                    </Text>
                    {book.page_count ? (
                      <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5 }}>
                        PAGE {book.current_page} / {book.page_count}
                      </Text>
                    ) : null}
                    {progress !== null ? (
                      <View style={{ height: 3, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginTop: 3 }}>
                        <View style={{ height: 3, width: progress + '%', backgroundColor: colors.accent }} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 11, fontWeight: '700' }}>
                    OPEN ›
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ paddingBottom: 4, paddingTop: 3 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 18, textAlign: 'center' }}>
          Your reading history stays on this device.
        </Text>
      </View>
    </Page>
  );
}
