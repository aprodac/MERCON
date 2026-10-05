/**
 * Sends the actual document files (not links) through the phone's share
 * sheet, where the operator picks WhatsApp and the chat. Same approach as
 * trips/details/shareMedia.ts: react-native-share sends several files at
 * once; builds without it fall back to expo-sharing, which sends one.
 */
import { Platform, TurboModuleRegistry } from 'react-native';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';

export interface ShareableDocument { id: string; url: string }

const hasRNShare = (() => {
  try {
    return !!TurboModuleRegistry.get('RNShare');
  } catch {
    return false;
  }
})();

const extOf = (url: string) => {
  const ext = /\.(pdf|jpe?g|png|webp|heic)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  return !ext ? 'jpg' : ext === 'jpeg' ? 'jpg' : ext;
};
const mimeOf = (ext: string) => (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);

/** Downloads the files into the app's cache (reused on a second send). */
async function download(docs: ShareableDocument[]): Promise<{ uri: string; ext: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const out: { uri: string; ext: string }[] = [];
  for (const d of docs) {
    const url = resolveMediaUrl(d.url);
    if (!url) continue;
    const ext = extOf(url);
    const target = `${FileSystem.cacheDirectory}document-${d.id}.${ext}`;
    const info = await FileSystem.getInfoAsync(target).catch(() => null);
    if (info?.exists) {
      out.push({ uri: target, ext });
      continue;
    }
    const res = await FileSystem.downloadAsync(url, target);
    if (res?.status && res.status >= 400) throw new Error(`Could not download a document (HTTP ${res.status})`);
    out.push({ uri: res.uri, ext });
  }
  return out;
}

export async function shareDocumentFiles(docs: ShareableDocument[], caption: string): Promise<{ shared: number; onlyFirst: boolean; dismissed: boolean }> {
  const files = await download(docs);
  if (files.length === 0) throw new Error('No files to send');

  if (hasRNShare) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Share = require('react-native-share').default;
    const allImages = files.every((f) => f.ext !== 'pdf');
    const res = await Share.open({
      urls: files.map((f) => f.uri),
      message: caption,
      type: files.length === 1 ? mimeOf(files[0].ext) : allImages ? 'image/*' : '*/*',
      failOnCancel: false,
      ...(Platform.OS === 'android' ? { title: 'Send on WhatsApp' } : {}),
    });
    const dismissed = !!res?.dismissedAction || res?.success === false;
    return { shared: dismissed ? 0 : files.length, onlyFirst: false, dismissed };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');
  await Sharing.shareAsync(files[0].uri, { mimeType: mimeOf(files[0].ext), dialogTitle: 'Send on WhatsApp' });
  return { shared: 1, onlyFirst: files.length > 1, dismissed: false };
}
