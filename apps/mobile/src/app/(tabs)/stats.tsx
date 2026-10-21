import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getCompletedSessionCount, getCurrentSession, getReadingSegments, listBooks, type Book, type ReadingSegment } from '@/data/books';
import { BookCover } from '@/components/BookCover';
import { Card, Eyebrow, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
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
      setError('Reading time could not be loaded. Try reopening Lire.');
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
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
    .map((book) => ({ book, seconds: sumSegmentSeconds(segments.filter((segment) => segment.book_id === book.id), now) }))
    .filter((item) => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return (
    <Page contentStyle={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Eyebrow>Your reading, in focus</Eyebrow>
        <PageTitle>Reading time</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
          Every minute comes from a session you started.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 3 }}>
        {(['day', 'week', 'month'] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: period === item }}
            onPress={() => setPeriod(item)}
            style={{ flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: period === item ? colors.surfaceElevated : 'transparent' }}
          >
            <Text style={{ color: period === item ? colors.accentLight : colors.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>{item === 'day' ? 'Day' : item === 'week' ? 'Week' : 'Month'}</Text>
          </Pressable>
        ))}
      </View>

      <Card dark style={{ padding: 20, borderColor: '#54301E' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>{periodTitle(period, now)}</Eyebrow>
          <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 }}>YOUR TIME</Text>
        </View>
        <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 42, fontWeight: '600', letterSpacing: -1.8 }}>
          {formatDuration(selectedTotal)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <View style={{ flex: 1, borderRadius: 15, padding: 12, backgroundColor: colors.surface, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>READING DAYS</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18, fontWeight: '700' }}>{activeDays}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 15, padding: 12, backgroundColor: colors.surface, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>BEST DAY</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18, fontWeight: '700' }}>{formatDuration(bestDay)}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ padding: 18, gap: 15 }}>
        <View style={{ gap: 4 }}>
          <SectionTitle>{period === 'day' ? 'Today so far' : period === 'week' ? 'Your week' : 'Your month'}</SectionTitle>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
            {bestDay > 0 ? `Your longest day reached ${formatDuration(bestDay)}.` : 'The next page is yours.'}
          </Text>
        </View>
        {points.map((point) => {
          const width = point.seconds > 0 ? Math.max(4, (point.seconds / max) * 100) : 0;
          return (
            <View key={point.label} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>{point.label}</Text>
                <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 10 }}>{formatDuration(point.seconds)}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: 6, width: `${width}%`, borderRadius: 8, backgroundColor: colors.accent }} />
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle>Reading life</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'ALL TIME', value: formatDuration(lifetimeSeconds) },
            { label: 'SESSIONS', value: String(sessionCount) },
            { label: 'DAYS', value: String(lifetimeDays) },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, borderRadius: 15, padding: 11, backgroundColor: colors.surfaceRaised, gap: 5 }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 8, fontWeight: '700', letterSpacing: 0.7 }}>{item.label}</Text>
              <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 16, fontWeight: '700' }}>{item.value}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle detail={`${bookTotals.length} ${bookTotals.length === 1 ? 'book' : 'books'}`}>Time by book</SectionTitle>
        {bookTotals.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>Your book totals will appear after your first session.</Text>
        ) : bookTotals.slice(0, 8).map(({ book, seconds }) => (
          <Pressable key={book.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <BookCover title={book.title} uri={book.cover_url} width={35} height={48} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' }}>{book.title}</Text>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 }}>{formatDuration(seconds)}</Text>
              </View>
              <View style={{ height: 4, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: 4, width: `${Math.max(3, (seconds / bookTotals[0].seconds) * 100)}%`, backgroundColor: colors.accent }} />
              </View>
            </View>
          </Pressable>
        ))}
      </Card>

      <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>
        Paused time is left out. Sessions that cross midnight are split between the days they touched.
      </Text>
    </Page>
  );
}
