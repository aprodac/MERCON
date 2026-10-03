/**
 * Safe clipboard helper for web, native dev clients, and Expo Go.
 *
 * Dynamically resolves `expo-clipboard` inside a try/catch so that runtimes
 * without the native 'ExpoClipboard' module (e.g. older dev clients, Expo Go, SSR)
 * do not throw uncaught errors on top-level module load.
 */

export async function getStringAsync(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard');
    if (Clipboard?.getStringAsync) {
      const val = await Clipboard.getStringAsync();
      return typeof val === 'string' ? val : '';
    }
  } catch {
    // Native module not linked in runtime binary
  }

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.readText) {
    try {
      const val = await navigator.clipboard.readText();
      return typeof val === 'string' ? val : '';
    } catch {
      // Permission denied or unhandled
    }
  }

  return '';
}

export async function setStringAsync(text: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard');
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(text);
      return true;
    }
  } catch {
    // Native module not linked in runtime binary
  }

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or unhandled
    }
  }

  return false;
}
