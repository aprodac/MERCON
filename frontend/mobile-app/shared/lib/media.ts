import { API_URL } from './api';

/**
 * A stored media path ("/uploads/x.jpg") as a full URL on the API server this
 * build talks to. Full http(s)/data URLs are returned unchanged.
 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  const origin = (API_URL || '').replace(/\/api(\/v\d+)?\/?$/, '');
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}
