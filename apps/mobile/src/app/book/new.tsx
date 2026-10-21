import { useState } from 'react';
import { Animated, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Chip, Eyebrow, Field, Page, PageTitle, StatusMessage } from '@/components/ui';
import { createBook, type BookStatus } from '@/data/books';
import { searchCatalog, type CatalogBook } from '@/data/catalog';
import { BookCover, coverFromIsbn } from '@/components/BookCover';
import { colors, fonts } from '@/design/tokens';

const statusOptions: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
  { key: 'paused', label: 'Paused' },
];

function parseCurrentPage(value: string): number | null {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function returnToPreviousScreen() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/(tabs)/library');
}

export default function NewBookScreen() {
  const db = useSQLiteContext();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [isbn, setIsbn] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogBook[]>([]);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [addingCatalogKey, setAddingCatalogKey] = useState('');
  const [addedTitle, setAddedTitle] = useState('');
  const [addedMotion] = useState(() => new Animated.Value(0.82));

  function finishAddingBook(id: string, bookTitle: string) {
    setAddedTitle(bookTitle);
    Animated.spring(addedMotion, { toValue: 1, stiffness: 240, damping: 15, useNativeDriver: true }).start();
    setTimeout(() => router.replace({ pathname: '/book/[id]', params: { id } }), 760);
  }

  async function saveBook() {
    if (!title.trim()) {
      setError('A title is needed to add this book.');
      return;
    }

    const parsedCurrentPage = parseCurrentPage(currentPage);
    if (parsedCurrentPage === null) {
      setError('Enter the current page as a whole number of zero or more.');
      return;
    }
    const parsedPageCount = pageCount.trim() ? Number(pageCount) : null;
    if (parsedPageCount !== null && (!Number.isSafeInteger(parsedPageCount) || parsedPageCount < 1)) {
      setError('Total pages must be a positive whole number, or leave it blank.');
      return;
    }
    if (parsedPageCount !== null && parsedCurrentPage > parsedPageCount) {
      setError('Current page cannot be greater than the total page count.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const id = await createBook(db, {
        title,
        author,
        status,
        currentPage: parsedCurrentPage,
        pageCount: parsedPageCount,
        isbn,
        coverUrl: coverFromIsbn(isbn),
      });
      finishAddingBook(id, title.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This book could not be saved.');
      setSaving(false);
    }
  }

  async function searchBooks() {
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSearched(true);
    try {
      setCatalogResults(await searchCatalog(catalogQuery));
    } catch (cause) {
      setCatalogResults([]);
      setCatalogError(cause instanceof Error ? cause.message : 'The book catalog could not be searched.');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function addCatalogBook(book: CatalogBook) {
    const parsedCurrentPage = parseCurrentPage(currentPage);
    if (parsedCurrentPage === null) {
      setCatalogError('Enter the current page as a whole number of zero or more.');
      return;
    }
    if (book.pageCount !== null && parsedCurrentPage > book.pageCount) {
      setCatalogError('Current page cannot be greater than the page total from Open Library.');
      return;
    }

    setAddingCatalogKey(book.key);
    setCatalogError('');
    try {
      const id = await createBook(db, {
        title: book.title,
        author: book.author ?? '',
        status,
        currentPage: parsedCurrentPage,
        pageCount: book.pageCount,
        catalogId: book.key,
        isbn: book.isbn,
        coverUrl: book.coverUrl,
        publishedYear: book.firstPublishYear,
      });
      finishAddingBook(id, book.title);
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'This book could not be saved.');
      setAddingCatalogKey('');
    }
  }

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
            ‹ Back
          </Text>
        </Pressable>
        <Eyebrow>Make a place on your shelf</Eyebrow>
        <PageTitle>Add a book</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Search a book catalog or enter the details yourself.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
          Add it to
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {statusOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={status === option.key}
              onPress={() => setStatus(option.key)}
            />
          ))}
        </View>
      </View>

      <Card style={{ gap: 9 }}>
        <Eyebrow>Reading position</Eyebrow>
        <Field
          label="Total pages (optional)"
          keyboardType="number-pad"
          onChangeText={setPageCount}
          placeholder="Catalog total fills this in"
          returnKeyType="done"
          value={pageCount}
        />
        <Field
          label="Current page (optional)"
          keyboardType="number-pad"
          onChangeText={setCurrentPage}
          placeholder="0"
          returnKeyType="done"
          value={currentPage}
        />
      </Card>

      <Card>
        <Eyebrow>Search Open Library</Eyebrow>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Find a title or author in the public book catalog. Searching requires an internet connection.
        </Text>
        <TextInput
          accessibilityLabel="Search the book catalog"
          autoCapitalize="none"
          editable={!catalogLoading}
          onChangeText={(value) => {
            setCatalogQuery(value);
            setCatalogResults([]);
            setCatalogSearched(false);
            setCatalogError('');
          }}
          onSubmitEditing={() => void searchBooks()}
          placeholder="Title or author"
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
          value={catalogQuery}
        />
        <Button disabled={catalogLoading || catalogQuery.trim().length < 2} onPress={() => void searchBooks()}>
          {catalogLoading ? 'Searching…' : 'Search catalog'}
        </Button>
        {catalogError ? <StatusMessage warning>{catalogError}</StatusMessage> : null}
        {catalogSearched && !catalogLoading && !catalogError && catalogResults.length === 0 ? (
          <StatusMessage>No matching books found. Try another title or author.</StatusMessage>
        ) : null}
        {catalogResults.map((book) => (
          <Pressable
            key={book.key}
            accessibilityRole="button"
            accessibilityLabel={`Add ${book.title}${book.author ? ` by ${book.author}` : ''} to Lire`}
            accessibilityState={{ disabled: addingCatalogKey.length > 0 }}
            disabled={addingCatalogKey.length > 0}
            onPress={() => void addCatalogBook(book)}
            style={({ pressed }) => ({
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceRaised,
              padding: 13,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <BookCover title={book.title} uri={book.coverUrl} width={42} height={58} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 16 }}>
                {book.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                {book.author || 'Author not listed'}
                {book.firstPublishYear ? ` · ${book.firstPublishYear}` : ''}
                {book.pageCount ? ` · ${book.pageCount} pages` : ''}
              </Text>
              {book.isbn ? <Text style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 }}>ISBN {book.isbn}</Text> : null}
            </View>
            <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>
              {addingCatalogKey === book.key ? 'Adding…' : 'Add'}
            </Text>
          </Pressable>
        ))}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
            Catalog data and page totals from
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://openlibrary.org').catch(() => {})}
          >
            <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>
              Open Library
            </Text>
          </Pressable>
        </View>
      </Card>

      <View style={{ gap: 6 }}>
        <Eyebrow>Manual entry</Eyebrow>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          Or add a title that is not in the catalog.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <View style={{ gap: 18 }}>
        <Field
          label="Title"
          autoCapitalize="words"
          onChangeText={setTitle}
          placeholder="The book’s title"
          returnKeyType="next"
          value={title}
        />
        <Field
          label="Author (optional)"
          autoCapitalize="words"
          onChangeText={setAuthor}
          placeholder="Who wrote it?"
          returnKeyType="done"
          value={author}
        />
        <Field
          label="ISBN (optional)"
          autoCapitalize="characters"
          onChangeText={setIsbn}
          placeholder="ISBN-10 or ISBN-13"
          returnKeyType="done"
          value={isbn}
        />
      </View>

      {addedTitle ? (
        <Animated.View
          accessible
          accessibilityLiveRegion="polite"
          style={{ opacity: addedMotion, transform: [{ scale: addedMotion }], borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.white, fontFamily: fonts.body, fontSize: 18, fontWeight: '700' }}>✓</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>ADDED TO YOUR LIBRARY</Text>
            <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 16 }}>{addedTitle}</Text>
          </View>
        </Animated.View>
      ) : null}

      <View style={{ gap: 11, marginTop: 5 }}>
        <Button disabled={saving} onPress={() => void saveBook()}>
          {saving ? 'Saving…' : 'Add to library'}
        </Button>
        <Button variant="outline" onPress={returnToPreviousScreen}>
          Cancel
        </Button>
      </View>
    </Page>
  );
}
