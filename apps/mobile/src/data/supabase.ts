import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabaseConfigured = Boolean(url && publishableKey);
export const supabase = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function handleAuthRedirect(incomingUrl: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const parsed = new URL(incomingUrl);
    const code = parsed.searchParams.get('code');
    if (!code) return false;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw new Error('The sign-in link could not be opened.');
  }
}
