import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Eyebrow, Page, PageTitle, StatusMessage } from '@/components/ui';
import { supabase } from '@/data/supabase';
import { colors, fonts } from '@/design/tokens';

export default function AuthCallbackScreen() {
  const { code: rawCode, type: rawType } = useLocalSearchParams<{ code?: string; type?: string }>();
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const type = Array.isArray(rawType) ? rawType[0] : rawType;
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    async function exchangeCode() {
      if (!supabase || !code) {
        setError('This sign-in link is missing or has expired. Return to Lire and request a new one.');
        return;
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!active) return;
      if (exchangeError) setError(exchangeError.message);
      else setComplete(true);
    }
    void exchangeCode().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'The sign-in link could not be opened.');
    });
    return () => { active = false; };
  }, [code]);

  return (
    <Page>
      <Eyebrow>Lire account</Eyebrow>
      <PageTitle>Confirming your link</PageTitle>
      {error ? <StatusMessage warning>{error}</StatusMessage> : null}
      {complete ? (
        <Card>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
            {type === 'recovery' ? 'Your reset link is ready.' : 'Your email is confirmed.'}
          </Text>
          <Button onPress={() => router.replace(type === 'recovery' ? '/(tabs)/profile?recovery=1' : '/(tabs)/profile')}>
            Continue to Profile
          </Button>
        </Card>
      ) : error ? <Button variant="outline" onPress={() => router.replace('/(tabs)/profile')}>Back to Profile</Button> : null}
    </Page>
  );
}
