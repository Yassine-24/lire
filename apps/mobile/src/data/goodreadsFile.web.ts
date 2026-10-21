import * as DocumentPicker from 'expo-document-picker';
import { maxGoodreadsCsvBytes } from '@/data/goodreads';

export async function chooseGoodreadsCsv(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  });
  if (result.canceled) return null;
  const file = result.assets[0].file;
  if (!file) throw new Error('The selected file could not be read.');
  if (file.size > maxGoodreadsCsvBytes) {
    throw new Error('This Goodreads export is larger than Lire can safely import.');
  }
  return file.text();
}
