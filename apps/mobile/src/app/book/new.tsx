import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Chip, Eyebrow, Field, Page, PageTitle, StatusMessage } from '@/components/ui';
import { createBook, type BookStatus } from '@/data/books';
import { searchCatalog, type CatalogBook } from '@/data/catalog';
import { colors, fonts } from '@/design/tokens';

const statusOptions: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
];

export default function NewBookScreen() {
  const db = useSQLiteContext();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogBook[]>([]);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [addingCatalogKey, setAddingCatalogKey] = useState('');

  async function saveBook() {
    if (!title.trim()) {
      setError('A title is needed to add this book.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const id = await createBook(db, { title, author, status });
      router.replace({ pathname: '/book/[id]', params: { id } });
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
    setAddingCatalogKey(book.key);
    setCatalogError('');
    try {
      const id = await createBook(db, { title: book.title, author: book.author ?? '', status });
      router.replace({ pathname: '/book/[id]', params: { id } });
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'This book could not be saved.');
      setAddingCatalogKey('');
    }
  }

  return (
    <Page>
      <View style={{ gap: 9 }}>
        <Pressable accessibilityRole="link" onPress={() => router.back()} style={{ paddingVertical: 4 }}>
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
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 16 }}>
                {book.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                {book.author || 'Author not listed'}
                {book.firstPublishYear ? ` · First published ${book.firstPublishYear}` : ''}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>
              {addingCatalogKey === book.key ? 'Adding…' : 'Add'}
            </Text>
          </Pressable>
        ))}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
            Catalog data from
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
      </View>

      <View style={{ gap: 11, marginTop: 5 }}>
        <Button disabled={saving} onPress={() => void saveBook()}>
          {saving ? 'Saving…' : 'Add to library'}
        </Button>
        <Button variant="outline" onPress={() => router.back()}>
          Cancel
        </Button>
      </View>
    </Page>
  );
}
