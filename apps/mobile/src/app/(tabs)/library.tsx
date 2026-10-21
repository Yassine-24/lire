import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getReadingSegments, listBooks, type Book, type BookStatus, type ReadingSegment } from '@/data/books';
import { Button, Card, Chip, EmptyState, Eyebrow, Page, PageTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { formatDuration, sumSegmentSeconds } from '@/domain/time';

type Filter = 'all' | BookStatus;

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All books' },
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
];

const statusLabels: Record<BookStatus, string> = {
  reading: 'Reading',
  want_to_read: 'Want to read',
  finished: 'Finished',
};

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);
  const [segments, setSegments] = useState<ReadingSegment[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextBooks, nextSegments] = await Promise.all([listBooks(db), getReadingSegments(db)]);
      setBooks(nextBooks);
      setSegments(nextSegments);
      setError('');
    } catch {
      setError('Your library could not be loaded. Please reopen Lire.');
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return books.filter((book) => {
      const matchesStatus = filter === 'all' || book.status === filter;
      const matchesQuery =
        normalized.length === 0 ||
        book.title.toLocaleLowerCase().includes(normalized) ||
        (book.author ?? '').toLocaleLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [books, filter, query]);

  function secondsFor(bookId: string): number {
    return sumSegmentSeconds(segments.filter((segment) => segment.book_id === bookId));
  }

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Eyebrow>Your shelves, your pace</Eyebrow>
        <PageTitle>Library</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Keep the books you are reading and the ones you hope to pick up.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <Button onPress={() => router.push('/book/new')}>Add a book</Button>
      <Button variant="outline" onPress={() => router.push('/import-goodreads')}>
        Import Goodreads CSV
      </Button>

      <TextInput
        accessibilityLabel="Search your library"
        onChangeText={setQuery}
        placeholder="Search title or author"
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        style={{
          minHeight: 50,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 15,
          color: colors.text,
          fontFamily: fonts.body,
          fontSize: 14,
          paddingHorizontal: 15,
        }}
        value={query}
      />

      <View style={{ gap: 11 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {filters.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              active={filter === item.key}
              onPress={() => setFilter(item.key)}
            />
          ))}
        </View>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
          {visibleBooks.length} {visibleBooks.length === 1 ? 'book' : 'books'}
        </Text>
      </View>

      {visibleBooks.length === 0 ? (
        <Card>
          <EmptyState
            title={books.length === 0 ? 'Your shelves are waiting.' : 'No books found.'}
            detail={
              books.length === 0
                ? 'Add a book you are reading now or one you would like to read later.'
                : 'Try another title, author, or shelf.'
            }
            action={
              books.length === 0 ? (
                <Button onPress={() => router.push('/book/new')}>Add your first book</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {visibleBooks.map((book) => (
            <Pressable
              key={book.id}
              accessibilityRole="button"
              accessibilityLabel={book.title + ', ' + statusLabels[book.status]}
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
              style={{
                minHeight: 98,
                borderRadius: 18,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 56,
                  borderRadius: 8,
                  backgroundColor: book.status === 'finished' ? colors.surfaceRaised : colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: book.status === 'finished' ? colors.accentLight : colors.accent, fontFamily: fonts.display, fontSize: 21 }}>
                  {book.title.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18 }}>
                  {book.title}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
                  {book.author || 'Author not added'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                    {statusLabels[book.status].toUpperCase()}
                  </Text>
                  {book.page_count ? (
                    <Text style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 }}>
                      PAGE {book.current_page}/{book.page_count}
                    </Text>
                  ) : null}
                </View>
                {book.page_count ? (
                  <View style={{ height: 3, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 }}>
                    <View
                      style={{
                        height: 3,
                        width: Math.min(100, Math.round((book.current_page / book.page_count) * 100)) + '%',
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>
                  {formatDuration(secondsFor(book.id))}
                </Text>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
                  read
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Page>
  );
}
