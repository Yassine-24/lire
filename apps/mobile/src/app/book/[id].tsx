import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteBook, getBook, getBookSessionHistory, getCurrentSession, updateBookDetails, updateBookProgress, updateBookStatus, type Book, type BookStatus, type CurrentSession, type SessionHistoryItem } from '@/data/books';
import { correctSessionDuration, finishSession, pauseSession, resumeSession, startSession } from '@/data/reading';
import { Button, Card, Chip, ConfirmDialog, Eyebrow, Field, Page, PageTitle, SectionTitle, StatusMessage } from '@/components/ui';
import { BookCover, coverFromIsbn } from '@/components/BookCover';
import { colors, fonts } from '@/design/tokens';
import { supabase } from '@/data/supabase';
import { calendarDaysInclusive, formatDuration, localDateInput, sumSegmentSeconds } from '@/domain/time';

const statusOptions: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to read' },
  { key: 'finished', label: 'Finished' },
  { key: 'paused', label: 'Paused' },
];

function returnToPreviousScreen() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/(tabs)/library');
}

export default function BookDetailScreen() {
  const db = useSQLiteContext();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [book, setBook] = useState<Book | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPageDraft, setCurrentPageDraft] = useState('0');
  const [pageCountDraft, setPageCountDraft] = useState('');
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [authorDraft, setAuthorDraft] = useState('');
  const [isbnDraft, setIsbnDraft] = useState('');
  const [startedDateDraft, setStartedDateDraft] = useState('');
  const [finishedDateDraft, setFinishedDateDraft] = useState('');
  const [ratingDraft, setRatingDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [detailsMessage, setDetailsMessage] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionMinutesDraft, setSessionMinutesDraft] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    const [nextBook, nextSession, nextHistory] = await Promise.all([
      getBook(db, id),
      getCurrentSession(db),
      getBookSessionHistory(db, id),
    ]);
    setBook(nextBook);
    if (nextBook) {
      setCurrentPageDraft(String(nextBook.status === 'finished' && nextBook.page_count !== null ? nextBook.page_count : nextBook.current_page));
      setPageCountDraft(nextBook.page_count === null ? '' : String(nextBook.page_count));
      setTitleDraft(nextBook.title);
      setAuthorDraft(nextBook.author ?? '');
      setIsbnDraft(nextBook.isbn ?? '');
      setStartedDateDraft(localDateInput(nextBook.started_at));
      setFinishedDateDraft(localDateInput(nextBook.finished_at));
      setRatingDraft(nextBook.rating === null ? '' : String(nextBook.rating));
      setNotesDraft(nextBook.notes ?? '');
    }
    setSession(nextSession);
    setHistory(nextHistory);
    setNow(new Date());
    setIsLoading(false);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => {
        setError('This book could not be loaded.');
        setIsLoading(false);
      });
    }, [load]),
  );

  const matchingSession = session?.book_id === id ? session : null;

  const runningSessionId = matchingSession?.status === 'running' ? matchingSession.id : null;

  useEffect(() => {
    if (!runningSessionId) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [runningSessionId]);

  const sessionSeconds = matchingSession ? sumSegmentSeconds(matchingSession.segments, now) : 0;

  async function perform(action: 'start' | 'pause' | 'resume' | 'finish') {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'start') await startSession(db, id);
      if (action === 'pause' && matchingSession) await pauseSession(db, matchingSession.id);
      if (action === 'resume' && matchingSession) await resumeSession(db, matchingSession.id);
      if (action === 'finish' && matchingSession) await finishSession(db, matchingSession.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: BookStatus) {
    if (!book) return;
    setError('');
    try {
      await updateBookStatus(db, book.id, status);
      await load();
    } catch {
      setError('The shelf could not be updated.');
    }
  }

  async function saveProgress() {
    if (!book) return;
    const currentPage = currentPageDraft.trim() ? Number(currentPageDraft) : 0;
    const pageCount = pageCountDraft.trim() ? Number(pageCountDraft) : null;
    if (!Number.isSafeInteger(currentPage) || currentPage < 0) {
      setError('Current page must be a whole number of zero or more.');
      return;
    }
    if (pageCount !== null && (!Number.isSafeInteger(pageCount) || pageCount < 1)) {
      setError('Total pages must be a positive whole number, or leave it blank.');
      return;
    }
    if (pageCount !== null && currentPage > pageCount) {
      setError('Current page cannot be greater than the total page count.');
      return;
    }

    setProgressSaving(true);
    setError('');
    setProgressMessage('');
    try {
      await updateBookProgress(db, book.id, { currentPage, pageCount });
      await load();
      setProgressMessage('Reading position saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reading position could not be saved.');
    } finally {
      setProgressSaving(false);
    }
  }

  async function saveBookDetails() {
    if (!book) return;
    setError('');
    setDetailsMessage('');
    const rating = ratingDraft.trim() ? Number(ratingDraft) : null;
    if (rating !== null && (!Number.isSafeInteger(rating) || rating < 1 || rating > 5)) {
      setError('Rating must be a whole number from one to five, or leave it blank.');
      return;
    }
    try {
      await updateBookDetails(db, book.id, {
        title: titleDraft,
        author: authorDraft,
        isbn: isbnDraft,
        startedAt: startedDateDraft,
        finishedAt: finishedDateDraft,
        rating,
        notes: notesDraft,
      });
      await load();
      setDetailsMessage('Book details saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Book details could not be saved.');
    }
  }

  async function removeBook() {
    if (!book) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const auth = supabase ? await supabase.auth.getSession() : null;
      await deleteBook(db, book.id, auth?.data.session?.user.id);
      setDeleteDialogOpen(false);
      router.replace('/(tabs)/library');
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'This book could not be removed.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveSessionCorrection(item: SessionHistoryItem) {
    const minutes = Number(sessionMinutesDraft);
    if (!Number.isSafeInteger(minutes) || minutes < 0) {
      setError('Enter the corrected session time as a whole number of minutes.');
      return;
    }
    setError('');
    try {
      await correctSessionDuration(db, item.id, minutes, true);
      setEditingSessionId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The session time could not be corrected.');
    }
  }

  if (!book) {
    return (
      <Page>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen}>
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontWeight: '700' }}>‹ Back</Text>
        </Pressable>
        <Card>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {isLoading ? 'Loading book…' : error || 'This book is not in your library.'}
          </Text>
          <Button variant="outline" onPress={returnToPreviousScreen}>Go back</Button>
        </Card>
      </Page>
    );
  }

  const displayPage = book.status === 'finished' && book.page_count !== null ? book.page_count : book.current_page;
  const progressPercent = book.status === 'finished'
    ? 100
    : book.page_count === null
      ? null
      : Math.min(100, Math.round((book.current_page / book.page_count) * 100));

  return (
    <Page>
      <View style={{ gap: 10 }}>
        <Pressable accessibilityRole="link" onPress={returnToPreviousScreen} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' }}>
            ‹ Back
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <BookCover title={book.title} uri={book.cover_url ?? coverFromIsbn(book.isbn)} width={86} height={120} />
          <View style={{ flex: 1, gap: 8 }}>
            <Eyebrow>Your book</Eyebrow>
            <PageTitle>{book.title}</PageTitle>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 15 }}>
              {book.author || 'Author not added'}
            </Text>
          </View>
        </View>
      </View>

      {error ? <StatusMessage warning>{error}</StatusMessage> : null}

      {session && session.book_id !== id ? (
        <Card style={{ borderColor: '#664326' }}>
          <Eyebrow>Another session is active</Eyebrow>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
            Your timer is with {session.book_title}. Finish or pause it before starting this book.
          </Text>
          <Button variant="outline" onPress={() => router.push('/(tabs)')}>Go to today</Button>
        </Card>
      ) : matchingSession ? (
        <Card dark style={{ padding: 18, borderColor: matchingSession.status === 'running' ? '#6A402A' : colors.border }}>
          <Eyebrow>{matchingSession.status === 'running' ? 'Reading now' : 'Paused · ready to resume'}</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 30, fontWeight: '600' }}>{formatDuration(sessionSeconds)}</Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Button variant="soft" disabled={busy} style={{ flex: 1 }} onPress={() => void perform(matchingSession.status === 'running' ? 'pause' : 'resume')}>
              {matchingSession.status === 'running' ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="outline" disabled={busy} style={{ flex: 1 }} onPress={() => void perform('finish')}>Finish</Button>
          </View>
        </Card>
      ) : (
        <Card dark style={{ borderColor: '#54301E', padding: 16 }}>
          <Eyebrow>Ready for a session?</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18, fontWeight: '700' }}>Pick up where you left off.</Text>
          <Button disabled={busy || Boolean(session)} onPress={() => void perform('start')}>
            {busy ? 'Starting…' : 'Start reading'}
          </Button>
        </Card>
      )}

      <Card style={{ padding: 20 }}>
        <Eyebrow>Reading time</Eyebrow>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 35 }}>
          {formatDuration(history.reduce((total, item) => total + item.seconds, 0) + sessionSeconds)}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
          {history.length + (matchingSession ? 1 : 0)} reading {history.length === 1 ? 'session' : 'sessions'}
        </Text>
        {book.started_at ? (
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
            {book.finished_at ? 'Finished' : 'Started'} {new Date(book.finished_at ?? book.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            {` · ${calendarDaysInclusive(book.started_at, book.finished_at ?? now.toISOString())} calendar ${calendarDaysInclusive(book.started_at, book.finished_at ?? now.toISOString()) === 1 ? 'day' : 'days'}`}
          </Text>
        ) : null}
      </Card>

      <Card style={{ padding: 20, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Eyebrow>Reading progress</Eyebrow>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 21, fontWeight: '700' }}>
            {book.status === 'finished'
              ? book.page_count === null ? 'Finished' : `Page ${displayPage} of ${book.page_count}`
              : book.page_count === null ? `Page ${book.current_page}` : `Page ${displayPage} of ${book.page_count}`}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }}>
            {book.status === 'finished'
              ? book.page_count === null ? 'Marked finished · page total unknown.' : '100% complete'
              : book.page_count === null
                ? 'Open Library has no page total for this edition.'
                : `${progressPercent}% complete · ${Math.max(0, book.page_count - book.current_page)} pages to go`}
          </Text>
        </View>
        {progressPercent !== null ? (
          <View style={{ height: 7, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View
              style={{
                height: 7,
                width: `${progressPercent}%`,
                borderRadius: 8,
                backgroundColor: colors.accent,
              }}
            />
          </View>
        ) : null}
        <Field
          label="Total pages (from Open Library; editable)"
          keyboardType="number-pad"
          onChangeText={setPageCountDraft}
          placeholder="Unknown"
          returnKeyType="done"
          value={pageCountDraft}
        />
        <Field
          label="Current page"
          keyboardType="number-pad"
          onChangeText={setCurrentPageDraft}
          placeholder="0"
          returnKeyType="done"
          value={currentPageDraft}
        />
        {progressMessage ? (
          <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 12 }}>
            {progressMessage}
          </Text>
        ) : null}
        <Button disabled={progressSaving} onPress={() => void saveProgress()}>
          {progressSaving ? 'Saving…' : 'Update page'}
        </Button>
      </Card>

      <Card>
        <Eyebrow>Book details</Eyebrow>
        <Field label="Title" onChangeText={setTitleDraft} value={titleDraft} />
        <Field label="Author" onChangeText={setAuthorDraft} value={authorDraft} />
        <Field label="ISBN (optional)" autoCapitalize="characters" onChangeText={setIsbnDraft} value={isbnDraft} />
        <Field label="Started (YYYY-MM-DD)" placeholder="YYYY-MM-DD" onChangeText={setStartedDateDraft} value={startedDateDraft} />
        <Field label="Finished (YYYY-MM-DD)" placeholder="YYYY-MM-DD" onChangeText={setFinishedDateDraft} value={finishedDateDraft} />
        <Field label="Rating (1-5; optional)" keyboardType="number-pad" onChangeText={setRatingDraft} value={ratingDraft} />
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>Notes</Text>
          <TextInput
            accessibilityLabel="Book notes"
            multiline
            onChangeText={setNotesDraft}
            placeholder="A private note about this book"
            placeholderTextColor={colors.textMuted}
            style={{ minHeight: 94, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontFamily: fonts.body, fontSize: 14, padding: 13, textAlignVertical: 'top' }}
            value={notesDraft}
          />
        </View>
        {detailsMessage ? <Text style={{ color: colors.accentLight, fontFamily: fonts.body, fontSize: 12 }}>{detailsMessage}</Text> : null}
        <Button variant="outline" onPress={() => void saveBookDetails()}>Save book details</Button>
      </Card>

      <View style={{ gap: 12 }}>
        <SectionTitle>On your shelf</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {statusOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={book.status === option.key}
              onPress={() => void changeStatus(option.key)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle detail={history.length > 0 ? String(history.length) : undefined}>Past sessions</SectionTitle>
        {history.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
              Finished sessions with this book will appear here.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 9 }}>
            {history.map((item) => (
              <Card key={item.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
                    {new Date(item.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <Text style={{ color: colors.text, fontFamily: fonts.body, fontWeight: '700', fontSize: 13 }}>
                    {formatDuration(item.seconds)}
                  </Text>
                </View>
                {editingSessionId === item.id ? (
                  <>
                    <Field label="Correct total time (whole minutes)" keyboardType="number-pad" onChangeText={setSessionMinutesDraft} value={sessionMinutesDraft} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button style={{ flex: 1 }} onPress={() => void saveSessionCorrection(item)}>Save correction</Button>
                      <Button style={{ flex: 1 }} variant="outline" onPress={() => setEditingSessionId(null)}>Cancel</Button>
                    </View>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setEditingSessionId(item.id);
                      setSessionMinutesDraft(String(Math.round(item.seconds / 60)));
                    }}
                    style={{ paddingVertical: 3 }}
                  >
                    <Text style={{ color: colors.accent, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' }}>Correct this session time</Text>
                  </Pressable>
                )}
              </Card>
            ))}
          </View>
        )}
      </View>

      <Card style={{ borderColor: '#4D2C2A' }}>
        <Eyebrow>Library actions</Eyebrow>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }}>
          Remove this book and its saved reading sessions from your library.
        </Text>
        <Button variant="danger" onPress={() => { setDeleteError(''); setDeleteDialogOpen(true); }}>Remove from library</Button>
      </Card>

      <ConfirmDialog
        visible={deleteDialogOpen}
        title={`Remove “${book.title}”?`}
        detail="The book and its saved sessions will be removed from this device and, when sync is enabled, your account."
        confirmLabel="Remove book"
        onConfirm={() => void removeBook()}
        onCancel={() => { setDeleteDialogOpen(false); setDeleteError(''); }}
        busy={deleteBusy}
        warning={deleteError || undefined}
      />
    </Page>
  );
}
