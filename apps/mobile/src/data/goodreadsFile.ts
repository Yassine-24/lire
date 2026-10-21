import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { maxGoodreadsCsvBytes } from '@/data/goodreads';

export async function chooseGoodreadsCsv(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (typeof asset.size === 'number' && asset.size > maxGoodreadsCsvBytes) {
    throw new Error('This Goodreads export is larger than Lire can safely import.');
  }
  return new File(asset.uri).text();
}
