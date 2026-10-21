import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Eyebrow, Page, PageTitle, StatusMessage } from '@/components/ui';
import { chooseGoodreadsCsv } from '@/data/goodreadsFile';
import {
  importGoodreadsBooks,
  previewGoodreadsImport,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Goodreads export could not be opened.');
    } finally {
      setBusy(null);
    }
  }

  async function importBooks() {
    if (!preview || preview.books.length === 0) return;
    setBusy('import');
    setError('');
    try {
      const imported = await importGoodreadsBooks(db, preview.books);
      setResult({ ...imported, skippedCount: preview.skippedCount });
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Goodreads books could not be imported.');
    } finally {
      setBusy(null);
    }
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
          Goodreads’ read, currently-reading, and to-read shelves map to Lire’s matching shelves. Other custom shelves go to Want to read.
        </Text>
        <Button disabled={busy !== null} onPress={() => void chooseFile()}>
          {busy === 'pick' ? 'Reading export…' : 'Choose Goodreads CSV'}
        </Button>
      </Card>

      {preview ? (
        <Card style={{ borderColor: colors.accent, gap: 12 }}>
          <Eyebrow>Import preview</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {preview.books.length} {preview.books.length === 1 ? 'new book' : 'new books'} ready
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }}>
            {preview.duplicateCount} existing or repeated {preview.duplicateCount === 1 ? 'book will' : 'books will'} be skipped. {preview.skippedCount} {preview.skippedCount === 1 ? 'row has' : 'rows have'} no title and will be skipped.
          </Text>
          <StatusMessage>
            Import adds books to your current library. It does not replace your data or create reading sessions.
          </StatusMessage>
          {preview.books.length > 0 ? (
            <Button disabled={busy !== null} onPress={() => void importBooks()}>
              {busy === 'import' ? 'Importing…' : `Import ${preview.books.length} ${preview.books.length === 1 ? 'book' : 'books'}`}
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
