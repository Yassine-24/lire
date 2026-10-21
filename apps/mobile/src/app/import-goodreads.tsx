import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Eyebrow, Page, PageTitle, StatusMessage } from '@/components/ui';
import { chooseGoodreadsCsv } from '@/data/goodreadsFile';
import {
  importGoodreadsBooks,
  previewGoodreadsImport,
  type GoodreadsBook,
  type GoodreadsImportPreview,
  type GoodreadsImportResult,
} from '@/data/goodreads';
import { colors, fonts } from '@/design/tokens';

type BusyAction = 'pick' | 'import' | null;
type CompletedImport = GoodreadsImportResult & { skippedCount: number };

export default function ImportGoodreadsScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [preview, setPreview] = useState<GoodreadsImportPreview | null>(null);
  const [addAsCopies, setAddAsCopies] = useState<string[]>([]);
  const [result, setResult] = useState<CompletedImport | null>(null);
  const [error, setError] = useState('');

  async function chooseFile() {
    setBusy('pick');
    setPreview(null);
    setResult(null);
    setError('');
    try {
      const csv = await chooseGoodreadsCsv();
      if (csv === null) return;
      setPreview(await previewGoodreadsImport(db, csv));
      setAddAsCopies([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Goodreads export could not be opened.');
    } finally {
      setBusy(null);
    }
  }

  async function importBooks() {
    if (!preview || importSelection.length === 0) return;
    setBusy('import');
    setError('');
    try {
      const books = [...preview.books, ...preview.duplicates];
      const imported = await importGoodreadsBooks(db, books, addAsCopies);
      setResult({ ...imported, skippedCount: preview.skippedCount });
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Goodreads books could not be imported.');
    } finally {
      setBusy(null);
    }
  }

  const importSelection = preview
    ? [...preview.books, ...preview.duplicates.filter((book) => addAsCopies.includes(book.sourceKey))]
    : [];

  function metadataSummary(book: GoodreadsBook): string {
    return [
      book.status.replaceAll('_', ' '),
      book.pageCount ? `${book.pageCount} pages` : null,
      book.rating ? `${book.rating}/5` : null,
      book.finishedAt ? 'finished date imported' : null,
    ].filter(Boolean).join(' · ');
  }

  return (
    <Page>
      <Pressable accessibilityRole="link" onPress={() => router.back()} style={{ paddingVertical: 4 }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
          ‹ Back
        </Text>
      </Pressable>

      <View style={{ gap: 9 }}>
        <Eyebrow>Bring your shelves with you</Eyebrow>
        <PageTitle>Import Goodreads</PageTitle>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}>
          Import the book list from a Goodreads library CSV. Your file is read on this device and is not uploaded.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <Card>
        <Eyebrow>Export from Goodreads</Eyebrow>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
          On Goodreads, open My Books, choose Import and export under Tools, then export your library as a CSV file.
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }}>
          Goodreads shelves, ISBNs, page totals, ratings, review notes, and start/finish dates are imported when present. No reading-time sessions are invented.
        </Text>
        <Button disabled={busy !== null} onPress={() => void chooseFile()}>
          {busy === 'pick' ? 'Reading export…' : 'Choose Goodreads CSV'}
        </Button>
      </Card>

      {preview ? (
        <Card style={{ borderColor: colors.accent, gap: 12 }}>
          <Eyebrow>Import preview</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {importSelection.length} {importSelection.length === 1 ? 'book' : 'books'} selected to import
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
            {preview.duplicateCount} existing or repeated {preview.duplicateCount === 1 ? 'book needs' : 'books need'} a duplicate decision. {preview.skippedCount} {preview.skippedCount === 1 ? 'row has' : 'rows have'} no title and will be skipped.
          </Text>
          <StatusMessage>
            Import adds books to your current library. It does not replace your data or create reading sessions.
          </StatusMessage>
          {preview.books.length > 0 ? (
            <View style={{ gap: 7 }}>
              <Eyebrow>New books</Eyebrow>
              {preview.books.slice(0, 40).map((book) => (
                <View key={book.sourceKey} style={{ borderRadius: 12, padding: 11, backgroundColor: colors.surfaceRaised, gap: 3 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 15 }}>{book.title}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>{book.author || 'Author not listed'}</Text>
                  <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 10, textTransform: 'capitalize' }}>{metadataSummary(book)}</Text>
                </View>
              ))}
              {preview.books.length > 40 ? <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>And {preview.books.length - 40} more new books…</Text> : null}
            </View>
          ) : null}
          {preview.duplicates.length > 0 ? (
            <View style={{ gap: 7 }}>
              <Eyebrow>Possible duplicates</Eyebrow>
              {preview.duplicates.slice(0, 40).map((book) => {
                const selected = addAsCopies.includes(book.sourceKey);
                return (
                  <Pressable
                    key={book.sourceKey}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setAddAsCopies((current) => selected ? current.filter((key) => key !== book.sourceKey) : [...current, book.sourceKey])}
                    style={{ borderRadius: 12, padding: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: selected ? colors.accent : colors.border, gap: 4 }}
                  >
                    <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 15 }}>{selected ? '☑ ' : '□ '}{book.title}</Text>
                    <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
                      {book.duplicateMatch === 'isbn' ? 'Matched by ISBN' : book.duplicateMatch === 'same-file' ? 'Repeated in this export' : 'Matched by title and author'} · {selected ? 'Import as another copy' : 'Skip'}
                    </Text>
                  </Pressable>
                );
              })}
              {preview.duplicates.length > 40 ? <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>And {preview.duplicates.length - 40} more possible duplicates…</Text> : null}
            </View>
          ) : null}
          {importSelection.length > 0 ? (
            <Button disabled={busy !== null} onPress={() => void importBooks()}>
              {busy === 'import' ? 'Importing…' : `Import ${importSelection.length} ${importSelection.length === 1 ? 'book' : 'books'}`}
            </Button>
          ) : (
            <StatusMessage>There are no new books to import from this file.</StatusMessage>
          )}
        </Card>
      ) : null}

      {result ? (
        <Card>
          <Eyebrow>Import complete</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {result.added} {result.added === 1 ? 'book added' : 'books added'}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
            {result.duplicateCount} duplicate {result.duplicateCount === 1 ? 'book skipped' : 'books skipped'}; {result.skippedCount} {result.skippedCount === 1 ? 'row without a title was' : 'rows without a title were'} skipped.
          </Text>
          <Button onPress={() => router.back()}>Back to library</Button>
        </Card>
      ) : null}
    </Page>
  );
}
