/**
 * Uploads Loading / Delivery photos as soon as they are taken and tracks each
 * one's progress for the upload bar. A photo is sent at most once per session;
 * a failed one is sent again the next time `uploadNow` is called for it
 * (the Complete button does that for all three).
 */
import { useCallback, useRef, useState } from 'react';
import type { CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import type { UploadItem } from '../components/UploadProgressBar';

type Send = (onProgress: (fraction: number) => void) => Promise<void>;

export function usePhotoUploads() {
  const [state, setState] = useState<Record<string, UploadItem>>({});
  const doneRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const failedRef = useRef<Set<string>>(new Set());

  const patch = (uri: string, item: UploadItem) => setState((prev) => ({ ...prev, [uri]: item }));

  /** Photos that are already on the server (saved drafts, server documents). */
  const markUploaded = useCallback((uris: string[]) => {
    if (uris.length === 0) return;
    uris.forEach((u) => doneRef.current.add(u));
    setState((prev) => {
      const next = { ...prev };
      uris.forEach((u) => { next[u] = { progress: 1, done: true, failed: false }; });
      return next;
    });
  }, []);

  const isUploaded = useCallback((uri: string) => doneRef.current.has(uri), []);

  /** True once this photo has been sent, is being sent, or failed. */
  const isKnown = useCallback(
    (uri: string) => doneRef.current.has(uri) || pendingRef.current.has(uri) || failedRef.current.has(uri),
    [],
  );

  const uploadNow = useCallback((p: CapturedPhoto, send: Send): Promise<boolean> => {
    if (!p.uri) return Promise.resolve(false);
    if (doneRef.current.has(p.uri)) return Promise.resolve(true);
    const pending = pendingRef.current.get(p.uri);
    if (pending) return pending;

    failedRef.current.delete(p.uri);
    patch(p.uri, { progress: 0, done: false, failed: false });
    let last = 0;
    const job = send((f) => {
      // Re-render at most every ~5% so a fast upload doesn't flood the screen.
      if (f - last < 0.05 && f < 1) return;
      last = f;
      patch(p.uri, { progress: f, done: false, failed: false });
    })
      .then(() => {
        doneRef.current.add(p.uri);
        patch(p.uri, { progress: 1, done: true, failed: false });
        return true;
      })
      .catch((err) => {
        console.warn('Photo upload warning:', err);
        failedRef.current.add(p.uri);
        patch(p.uri, { progress: 0, done: false, failed: true });
        return false;
      })
      .finally(() => {
        pendingRef.current.delete(p.uri);
      });
    pendingRef.current.set(p.uri, job);
    return job;
  }, []);

  /** One bar entry per photo, in slot order. */
  const itemsFor = (photos: CapturedPhoto[]): UploadItem[] =>
    photos.filter((p) => p?.uri).map((p) => state[p.uri] ?? { progress: 0, done: false, failed: false });

  return { uploadNow, markUploaded, isUploaded, isKnown, itemsFor };
}
