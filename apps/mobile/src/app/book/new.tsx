import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createBook, type BookStatus } from '@/data/books';
import { Button, Chip, Eyebrow, Field, Page, PageTitle, StatusMessage } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';

export default function NewBookScreen() {
  const db = useSQLiteContext();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
          A title is enough to begin. You can add details later.
        </Text>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      <View style={{ gap: 18 }}>
        <Field
          label="Title"
          autoFocus
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

      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
          Shelf
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Reading" active={status === 'reading'} onPress={() => setStatus('reading')} />
          <Chip label="Want to read" active={status === 'want_to_read'} onPress={() => setStatus('want_to_read')} />
        </View>
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
