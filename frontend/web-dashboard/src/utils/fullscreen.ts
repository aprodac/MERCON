/**
 * Full screen that never throws. iPhone Safari has no Fullscreen API for
 * pages (`requestFullscreen` is undefined on <html>), so calling it blindly
 * crashed the whole app on iPhones ("Something went wrong" on every page).
 */
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function canFullscreen(): boolean {
  const el = document.documentElement as FsElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

/** Phones and tablets: no auto full screen (it hides the browser's own controls). */
export function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function enterFullscreen(): void {
  const el = document.documentElement as FsElement;
  try {
    const result = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
    if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => {});
  } catch {
    // Not allowed here (no user gesture, or unsupported): stay windowed.
  }
}

export function exitFullscreen(): void {
  const d = document as FsDocument;
  try {
    const result = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
    if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => {});
  } catch {
    // ignore
  }
}
