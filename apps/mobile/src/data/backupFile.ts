import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

function backupFilename(): string {
  return 'lire-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
}

export async function saveBackupFile(contents: string): Promise<void> {
  const file = new File(Paths.cache, backupFilename());
  file.create();
  await file.write(contents);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Lire backup',
    UTI: 'public.json',
  });
}

export async function chooseBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return new File(asset.uri).text();
}
