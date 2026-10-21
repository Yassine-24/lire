import * as DocumentPicker from 'expo-document-picker';

function backupFilename(): string {
  return 'lire-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
}

export async function saveBackupFile(contents: string): Promise<void> {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename();
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function chooseBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (result.canceled) return null;
  const file = result.assets[0].file;
  if (!file) throw new Error('The selected file could not be read.');
  return file.text();
}
