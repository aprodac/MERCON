/**
 * Sends the actual photo / video files (not a link) through the phone's share
 * sheet, where the operator picks WhatsApp and the chat. The caption goes
 * with them and is also copied, since WhatsApp drops text sent alongside
 * several images on some phones.
 *
 * react-native-share (several files at once) and expo-clipboard are native.
 * Builds without them fall back to expo-sharing, which sends one file.
 */
import { Platform, TurboModuleRegistry } from 'react-native';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { LiveMediaItem } from '../../../lib/operator';

const hasRNShare = (() => {
  try {
    return !!TurboModuleRegistry.get('RNShare');
  } catch {
    return false;
  }
})();

const extOf = (m: LiveMediaItem) => {
  const fromUrl = /\.(jpe?g|png|webp|heic|mp4|mov|3gp|webm)(?:\?|$)/i.exec(m.url)?.[1]?.toLowerCase();
  if (fromUrl) return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  if (m.kind === 'video') return 'mp4';
  return m.mime?.includes('png') ? 'png' : 'jpg';
};

const mimeOf = (m: LiveMediaItem) => m.mime || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg');

/** Downloads the items into the app's cache (reused on a second send). */
async function download(items: LiveMediaItem[]): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const out: string[] = [];
  for (const m of items) {
    const url = resolveMediaUrl(m.url);
    if (!url) continue;
    const target = `${FileSystem.cacheDirectory}trip-media-${m.id}.${extOf(m)}`;
    const info = await FileSystem.getInfoAsync(target).catch(() => null);
    if (info?.exists) {
      out.push(target);
      continue;
    }
    const res = await FileSystem.downloadAsync(url, target);
    if (res?.status && res.status >= 400) throw new Error(`Could not download a photo (HTTP ${res.status})`);
    out.push(res.uri);
  }
  return out;
}

async function copy(text: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export type ShareFilesResult = { shared: number; captionCopied: boolean; onlyFirst: boolean; dismissed: boolean };

export async function shareMediaFiles(items: LiveMediaItem[], caption: string): Promise<ShareFilesResult> {
  const files = await download(items);
  if (files.length === 0) throw new Error('No photos to send');
  const captionCopied = await copy(caption);

  if (hasRNShare) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Share = require('react-native-share').default;
    const allImages = items.every((m) => m.kind !== 'video');
    const res = await Share.open({
      urls: files,
      message: caption,
      type: files.length === 1 ? mimeOf(items[0]) : allImages ? 'image/*' : '*/*',
      failOnCancel: false,
      // iOS shows the caption as a separate item; Android attaches it as the first image's caption.
      ...(Platform.OS === 'android' ? { title: 'Send on WhatsApp' } : {}),
    });
    const dismissed = !!res?.dismissedAction || res?.success === false;
    return { shared: dismissed ? 0 : files.length, captionCopied, onlyFirst: false, dismissed };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');
  await Sharing.shareAsync(files[0], { mimeType: mimeOf(items[0]), dialogTitle: 'Send on WhatsApp' });
  return { shared: 1, captionCopied, onlyFirst: files.length > 1, dismissed: false };
}
