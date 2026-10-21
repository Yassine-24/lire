import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getCompletedSessionCount, getCurrentSession, getReadingSegments, listBooks, type Book, type ReadingSegment } from '@/data/books';
import { Button, Card, Chip, Eyebrow, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { formatDuration, localDayKey, secondsByLocalDay, shiftLocalDay, sumSegmentSeconds, weekStart } from '@/domain/time';

type Period = 'day' | 'week' | 'month';
type BarPoint = { label: string; seconds: number };

function seriesFor(period: Period, totals: Record<string, number>, now: Date): BarPoint[] {
  if (period === 'day') {
    return [{ label: 'Today', seconds: totals[localDayKey(now)] ?? 0 }];
  }
  if (period === 'week') {
    const start = weekStart(now);
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftLocalDay(start, index);
      return {
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        seconds: totals[localDayKey(date)] ?? 0,
      };
    });
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const bucketCount = Math.ceil(daysInMonth / 7);
  const result: BarPoint[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    let seconds = 0;
    const firstDay = bucket * 7 + 1;
    const lastDay = Math.min(firstDay + 6, daysInMonth, now.getDate());
    for (let day = firstDay; day <= lastDay; day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      seconds += totals[localDayKey(date)] ?? 0;
    }
    result.push({ label: firstDay + '–' + lastDay, seconds });
  }
  return result;
}

function periodTitle(period: Period, now: Date): string {
  if (period === 'day') {
    return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  if (period === 'week') return 'This week';
  return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const [segments, setSegments] = useState<ReadingSegment[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [period, setPeriod] = useState<Period>('week');
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextSegments, nextBooks, nextCompletedSessions, nextSession] = await Promise.all([
        getReadingSegments(db), listBooks(db), getCompletedSessionCount(db), getCurrentSession(db),
      ]);
      setSegments(nextSegments);
      setBooks(nextBooks);
      setCompletedSessions(nextCompletedSessions);
      setHasActiveSession(Boolean(nextSession));
      setNow(new Date());
      setError('');
    } catch {
      setError('Reading time could not be loaded. Please reopen Lire.');
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const totals = secondsByLocalDay(segments, now);
  const points = seriesFor(period, totals, now);
  const selectedTotal = points.reduce((sum, point) => sum + point.seconds, 0);
  const activeDays = points.filter((point) => point.seconds > 0).length;
  const bestDay = points.reduce((best, point) => Math.max(best, point.seconds), 0);
  const max = Math.max(1, ...points.map((point) => point.seconds));
  const lifetimeSeconds = Object.values(totals).reduce((sum, seconds) => sum + seconds, 0);
  const lifetimeDays = Object.values(totals).filter((seconds) => seconds > 0).length;
  const sessionCount = completedSessions + (hasActiveSession ? 1 : 0);
  const bookTotals = books
    .map((book) => ({
      book,
      seconds: sumSegmentSeconds(segments.filter((segment) => segment.book_id === book.id), now),
    }))
    .filter((item) => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Eyebrow>A record of your reading</Eyebrow>
        <PageTitle>Time well spent.</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Your time, gathered from each reading session.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <Card dark style={{ padding: 22 }}>
        <Eyebrow>{periodTitle(period, now)}</Eyebrow>
        <Text style={{ color: colors.white, fontFamily: fonts.display, fontSize: 42, lineHeight: 50 }}>
          {formatDuration(selectedTotal)}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
          {activeDays} {activeDays === 1 ? 'day with reading' : 'days with reading'}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Day" active={period === 'day'} onPress={() => setPeriod('day')} />
        <Chip label="Week" active={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip label="Month" active={period === 'month'} onPress={() => setPeriod('month')} />
      </View>

      <Card style={{ padding: 20, gap: 17 }}>
        <View style={{ gap: 5 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 22 }}>
            {period === 'day' ? 'Today so far' : period === 'week' ? 'This week, day by day' : 'This month, week by week'}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
            {bestDay > 0 ? 'Your strongest day: ' + formatDuration(bestDay) : 'The next page is yours.'}
          </Text>
        </View>

        {points.map((point) => {
          const width = point.seconds > 0 ? Math.max(5, (point.seconds / max) * 100) : 0;
          return (
            <View key={point.label} style={{ gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                  {point.label}
                </Text>
                <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' }}>
                  {formatDuration(point.seconds)}
                </Text>
              </View>
              <View style={{ height: 7, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: 7, width: width + '%', borderRadius: 8, backgroundColor: colors.accent }} />
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18 }}>
          Measured in real time
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Paused time is left out. Reading sessions that cross midnight are split between the days they touched.
        </Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <Eyebrow>Your data</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
          Keep a copy of your reading life.
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Export a private backup or restore one you saved earlier.
        </Text>
        <Button variant="outline" onPress={() => router.push('/backup')}>
          Back up or restore data
        </Button>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle>Reading life</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceRaised, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>ALL TIME</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>{formatDuration(lifetimeSeconds)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceRaised, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>SESSIONS</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>{sessionCount}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceRaised, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>READING DAYS</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>{lifetimeDays}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle detail={`${bookTotals.length} ${bookTotals.length === 1 ? 'book' : 'books'}`}>Time by book</SectionTitle>
        {bookTotals.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
            Finished reading time will appear here as you log sessions.
          </Text>
        ) : bookTotals.slice(0, 8).map(({ book, seconds }) => (
          <View key={book.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 13 }}>{book.title}</Text>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>{formatDuration(seconds)}</Text>
            </View>
            <View style={{ height: 5, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ height: 5, width: `${Math.max(3, (seconds / bookTotals[0].seconds) * 100)}%`, backgroundColor: colors.accent }} />
            </View>
          </View>
        ))}
      </Card>
    </Page>
  );
}
