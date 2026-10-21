import { useState } from 'react';
import { Animated, Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Chip, Eyebrow, Field, Page, PageTitle, SearchField, SectionTitle, StatusMessage } from '@/components/ui';
import { BookCover, coverFromIsbn } from '@/components/BookCover';
import { createBook, type BookStatus } from '@/data/books';
import { searchCatalog, type CatalogBook } from '@/data/catalog';
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

function parsePageCount(value: string, catalogCount: number | null): number | null | undefined {
  if (!value.trim()) return catalogCount;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function returnToPreviousScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/library');
}

export default function NewBookScreen() {
  const db = useSQLiteContext();
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogBook[]>([]);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [addingCatalogKey, setAddingCatalogKey] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [currentPage, setCurrentPage] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addedTitle, setAddedTitle] = useState('');
  const [addedMotion] = useState(() => new Animated.Value(0.82));

  function finishAddingBook(id: string, bookTitle: string) {
    setAddedTitle(bookTitle);
    Animated.spring(addedMotion, { toValue: 1, stiffness: 240, damping: 15, useNativeDriver: true }).start();
    setTimeout(() => router.replace({ pathname: '/book/[id]', params: { id } }), 760);
  }

  async function searchBooks() {
    if (catalogQuery.trim().length < 2) {
      setCatalogError('Enter at least two characters to search.');
      return;
    }
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSearched(true);
    try {
      setCatalogResults(await searchCatalog(catalogQuery));
    } catch (cause) {
      setCatalogResults([]);
      setCatalogError(cause instanceof Error ? cause.message : 'The catalog could not be searched.');
    } finally {
      setCatalogLoading(false);
    }
  }

  function readingPosition(catalogTotal: number | null): { currentPage: number; pageCount: number | null } | null {
    const nextCurrentPage = parseCurrentPage(currentPage);
    const nextPageCount = parsePageCount(pageCount, catalogTotal);
    if (nextCurrentPage === null) {
      setCatalogError('Enter the current page as a whole number of zero or more.');
      return null;
    }
    if (nextPageCount === undefined) {
      setCatalogError('Total pages must be a positive whole number, or blank.');
      return null;
    }
    if (nextPageCount !== null && nextCurrentPage > nextPageCount) {
      setCatalogError('Current page cannot be greater than the total page count.');
      return null;
    }
    return { currentPage: nextCurrentPage, pageCount: nextPageCount };
  }

  async function addCatalogBook(book: CatalogBook) {
    const position = readingPosition(book.pageCount);
    if (!position) return;
    setAddingCatalogKey(book.key);
    setCatalogError('');
    try {
      const id = await createBook(db, {
        title: book.title,
        author: book.author ?? '',
        status,
        ...position,
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

  async function saveManualBook() {
    if (!title.trim()) {
      setError('Add a title before saving.');
      return;
    }
    const position = readingPosition(null);
    if (!position) return;
    setSaving(true);
    setError('');
    setCatalogError('');
    try {
      const id = await createBook(db, {
        title,
        author,
        status,
        ...position,
        isbn,
        coverUrl: coverFromIsbn(isbn),
      });
      finishAddingBook(id, title.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This book could not be saved.');
      setSaving(false);
    }
  }

  return (
    <Page contentStyle={{ gap: 16 }}>
      <View style={{ gap: 7 }}>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>‹  Back to library</Text>
        </Pressable>
        <Eyebrow>Build your shelf</Eyebrow>
        <PageTitle>Add a book</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
          Find the edition you own. Lire will fill in its cover and page total when available.
        </Text>
      </View>

      <Card dark style={{ borderColor: '#54301E', padding: 17 }}>
        <View style={{ gap: 5 }}>
          <Eyebrow>01 / Find your book</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19, fontWeight: '700' }}>Search Open Library</Text>
        </View>
        <SearchField
          accessibilityLabel="Search Open Library"
          editable={!catalogLoading}
          onChangeText={(value) => { setCatalogQuery(value); setCatalogResults([]); setCatalogSearched(false); setCatalogError(''); }}
          onSubmitEditing={() => void searchBooks()}
          placeholder="Title, author, or ISBN"
          value={catalogQuery}
        />
        <Button disabled={catalogLoading || catalogQuery.trim().length < 2} onPress={() => void searchBooks()}>
          {catalogLoading ? 'Searching…' : 'Search books'}
        </Button>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 }}>
          Catalog search needs an internet connection. Your library stays on this device.
        </Text>
      </Card>

      {catalogError ? <StatusMessage warning>{catalogError}</StatusMessage> : null}
      {catalogSearched && !catalogLoading && !catalogError && catalogResults.length === 0 ? (
        <Card><Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>No matching editions. Try another title or add the details manually.</Text></Card>
      ) : null}
      {catalogResults.length > 0 ? (
        <View style={{ gap: 9 }}>
          <SectionTitle detail={`${catalogResults.length} found`}>Choose an edition</SectionTitle>
          {catalogResults.map((book) => (
            <Pressable
              key={book.key}
              accessibilityRole="button"
              accessibilityLabel={`Add ${book.title}${book.author ? ` by ${book.author}` : ''} to Lire`}
              accessibilityState={{ disabled: addingCatalogKey.length > 0 }}
              disabled={addingCatalogKey.length > 0}
              onPress={() => void addCatalogBook(book)}
              style={({ pressed }) => ({ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.78 : 1 })}
            >
              <BookCover title={book.title} uri={book.coverUrl} width={47} height={65} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{book.title}</Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
                  {book.author || 'Author not listed'}{book.firstPublishYear ? ` · ${book.firstPublishYear}` : ''}
                </Text>
                <Text style={{ color: colors.accentLight, fontFamily: fonts.mono, fontSize: 9 }}>{book.pageCount ? `${book.pageCount} PAGES` : 'PAGE TOTAL UNKNOWN'}</Text>
              </View>
              <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 11, fontWeight: '700' }}>{addingCatalogKey === book.key ? 'Adding…' : 'ADD  +'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card>
        <Eyebrow>02 / Make it yours</Eyebrow>
        <SectionTitle>Your reading setup</SectionTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }}>
          The edition’s page total comes from the catalog. You can adjust it and set your current page here.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {statusOptions.map((option) => <Chip key={option.key} label={option.label} active={status === option.key} onPress={() => setStatus(option.key)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Field style={{ flex: 1 }} label="Total pages" keyboardType="number-pad" onChangeText={setPageCount} placeholder="From catalog" value={pageCount} />
          <Field style={{ flex: 1 }} label="Current page" keyboardType="number-pad" onChangeText={setCurrentPage} placeholder="0" value={currentPage} />
        </View>
      </Card>

      <Card style={{ padding: 16 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: manualOpen }} onPress={() => setManualOpen((open) => !open)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
            <Eyebrow>Skip the catalog</Eyebrow>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 17, fontWeight: '700' }}>Add manually</Text>
          </View>
          <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 20 }}>{manualOpen ? '−' : '+'}</Text>
        </Pressable>
        {manualOpen ? (
          <View style={{ gap: 11 }}>
            <Field label="Title" autoCapitalize="words" onChangeText={setTitle} placeholder="The book’s title" value={title} />
            <Field label="Author (optional)" autoCapitalize="words" onChangeText={setAuthor} placeholder="Who wrote it?" value={author} />
            <Field label="ISBN (optional)" autoCapitalize="characters" onChangeText={setIsbn} placeholder="ISBN-10 or ISBN-13" value={isbn} />
            {error ? <StatusMessage warning>{error}</StatusMessage> : null}
            <Button disabled={saving} onPress={() => void saveManualBook()}>{saving ? 'Saving…' : 'Add to library'}</Button>
          </View>
        ) : null}
      </Card>

      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://openlibrary.org').catch(() => {})} style={{ alignSelf: 'center', paddingVertical: 2 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10 }}>Catalog data from Open Library</Text>
      </Pressable>

      {addedTitle ? (
        <Animated.View accessible accessibilityLiveRegion="polite" style={{ opacity: addedMotion, transform: [{ scale: addedMotion }], borderRadius: 17, borderWidth: 1, borderColor: '#724326', backgroundColor: colors.accentSoft, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.white, fontFamily: fonts.body, fontSize: 18, fontWeight: '700' }}>✓</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', letterSpacing: 1 }}>ADDED TO YOUR LIBRARY</Text>
            <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 15, fontWeight: '700' }}>{addedTitle}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Page>
  );
}
