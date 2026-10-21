import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteBook, getReadingSegments, listBooks, type Book, type BookStatus, type ReadingSegment } from '@/data/books';
import { BookCover } from '@/components/BookCover';
import { Button, Card, Chip, ConfirmDialog, EmptyState, Eyebrow, Page, PageTitle, SearchField, SectionTitle, StatusMessage } from '@/components/ui';
import { getSetting, saveSetting } from '@/data/settings';
import { supabase } from '@/data/supabase';
import { colors, fonts } from '@/design/tokens';
import { formatDuration, sumSegmentSeconds } from '@/domain/time';

type Filter = 'all' | BookStatus;
type DisplayMode = 'list' | 'tiles';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
  { key: 'paused', label: 'Paused' },
];

const statusLabels: Record<BookStatus, string> = {
  reading: 'Reading',
  want_to_read: 'Want to read',
  finished: 'Finished',
  paused: 'Paused',
};

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<Book[]>([]);
  const [segments, setSegments] = useState<ReadingSegment[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [error, setError] = useState('');
  const [bookToRemove, setBookToRemove] = useState<Book | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextBooks, nextSegments, savedMode] = await Promise.all([
        listBooks(db),
        getReadingSegments(db),
        getSetting(db, 'library_display_mode'),
      ]);
      setBooks(nextBooks);
      setSegments(nextSegments);
      if (savedMode === 'list' || savedMode === 'tiles') setDisplayMode(savedMode);
      setError('');
    } catch {
      setError('Your library could not be loaded. Try reopening Lire.');
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visibleBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return books.filter((book) => {
      const matchesStatus = filter === 'all' || book.status === filter;
      const matchesQuery = normalized.length === 0 ||
        book.title.toLocaleLowerCase().includes(normalized) ||
        (book.author ?? '').toLocaleLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [books, filter, query]);

  const readingCount = books.filter((book) => book.status === 'reading').length;
  const totalMinutes = Math.floor(segments.reduce((total, segment) => total + sumSegmentSeconds([segment]), 0) / 60);

  async function setView(mode: DisplayMode) {
    setDisplayMode(mode);
    try {
      await saveSetting(db, 'library_display_mode', mode);
    } catch {
      setError('Your view preference could not be saved.');
    }
  }

  async function confirmRemove() {
    if (!bookToRemove) return;
    setRemoving(true);
    setRemoveError('');
    try {
      const auth = supabase ? await supabase.auth.getSession() : null;
      const userId = auth?.data.session?.user.id;
      await deleteBook(db, bookToRemove.id, userId);
      setBookToRemove(null);
      await load();
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : 'This book could not be removed.');
    } finally {
      setRemoving(false);
    }
  }

  function askToRemove(book: Book) {
    setRemoveError('');
    setBookToRemove(book);
  }

  return (
    <Page contentStyle={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Eyebrow>Your personal shelves</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <PageTitle>Library</PageTitle>
          <View style={{ alignItems: 'flex-end', paddingBottom: 5 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 18, fontWeight: '600' }}>{books.length}</Text>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 9, letterSpacing: 1 }}>BOOKS</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
          A shelf for the books you’re in, and the ones you’ll return to.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Button style={{ flex: 1 }} onPress={() => router.push('/book/new')}>＋ Add a book</Button>
        <Button variant="outline" style={{ flex: 1 }} onPress={() => router.push('/import-goodreads')}>Import CSV</Button>
      </View>

      <View style={{ gap: 12 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Find a title or author" accessibilityLabel="Search your library" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {filters.map((item) => (
            <Chip key={item.key} label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />
          ))}
        </ScrollView>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 3 }}>
          <SectionTitle>{filter === 'all' ? 'Your books' : statusLabels[filter]}</SectionTitle>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
            {visibleBooks.length} shown · {readingCount} in progress · {formatDuration(totalMinutes * 60)} read
          </Text>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, padding: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 13 }}>
          {(['list', 'tiles'] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: displayMode === mode }}
              onPress={() => void setView(mode)}
              style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: displayMode === mode ? colors.surfaceElevated : 'transparent' }}
            >
              <Text style={{ color: displayMode === mode ? colors.accentLight : colors.textMuted, fontFamily: fonts.body, fontSize: 11, fontWeight: '700' }}>{mode === 'list' ? 'List' : 'Tiles'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {visibleBooks.length === 0 ? (
        <Card>
          <EmptyState
            title={books.length === 0 ? 'Your shelf starts here.' : 'No books found.'}
            detail={books.length === 0 ? 'Add a book you’re reading or searching for.' : 'Try a different search or shelf.'}
            action={books.length === 0 ? <Button onPress={() => router.push('/book/new')}>Find a book</Button> : undefined}
          />
        </Card>
      ) : (
        <View style={{ gap: displayMode === 'tiles' ? 8 : 12, flexDirection: displayMode === 'tiles' ? 'row' : 'column', flexWrap: displayMode === 'tiles' ? 'wrap' : 'nowrap' }}>
          {visibleBooks.map((book) => {
            const seconds = sumSegmentSeconds(segments.filter((segment) => segment.book_id === book.id));
            const progress = book.page_count ? Math.min(100, Math.round((book.current_page / book.page_count) * 100)) : null;
            const tile = displayMode === 'tiles';
            return (
              <View key={book.id} style={{ width: tile ? '48%' : '100%', gap: tile ? 3 : 7 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${book.title}, ${statusLabels[book.status]}`}
                  onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
                  style={({ pressed }) => ({
                    minHeight: tile ? 188 : 112,
                    borderRadius: tile ? 17 : 20,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: tile ? 10 : 14,
                    flexDirection: tile ? 'column' : 'row',
                    gap: tile ? 8 : 13,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <View style={{ flexDirection: tile ? 'column' : 'row', alignItems: tile ? 'stretch' : 'center', gap: tile ? 8 : 11, flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tile ? 8 : 11 }}>
                      <BookCover title={book.title} uri={book.cover_url} width={tile ? 58 : 48} height={tile ? 80 : 66} />
                      <View style={{ flex: 1, gap: tile ? 3 : 5 }}>
                        <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.display, fontSize: tile ? 14 : 17, lineHeight: tile ? 18 : 23, fontWeight: '700' }}>{book.title}</Text>
                        <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>{book.author || 'Author not added'}</Text>
                        {tile ? <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>{statusLabels[book.status].toUpperCase()}</Text> : null}
                      </View>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'flex-end', gap: tile ? 5 : 7 }}>
                      {!tile ? <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>{statusLabels[book.status].toUpperCase()}</Text> : null}
                      {book.page_count ? (
                        <>
                          <Text style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 }}>PAGE {book.current_page} / {book.page_count}</Text>
                          <View style={{ height: 4, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
                            <View style={{ height: 4, width: `${progress}%`, backgroundColor: colors.accent }} />
                          </View>
                        </>
                      ) : null}
                      <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 11, fontWeight: '700' }}>{formatDuration(seconds)} read</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${book.title} from your library`}
                  onPress={() => askToRemove(book)}
                  style={({ pressed }) => ({ alignSelf: tile ? 'flex-end' : 'flex-start', paddingHorizontal: 8, paddingVertical: tile ? 1 : 3, opacity: pressed ? 0.65 : 1 })}
                >
                  <Text style={{ color: colors.danger, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <ConfirmDialog
        visible={bookToRemove !== null}
        title={bookToRemove ? `Remove “${bookToRemove.title}”?` : 'Remove this book?'}
        detail="This removes the book and its saved reading sessions from this device. If sync is enabled, the removal will sync to your account."
        confirmLabel="Remove book"
        onConfirm={() => void confirmRemove()}
        onCancel={() => { setBookToRemove(null); setRemoveError(''); }}
        busy={removing}
        warning={removeError || undefined}
      />
    </Page>
  );
}
