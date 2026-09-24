import axios, { AxiosError } from 'axios';
import { authStore } from '@/store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

/* ─── Request interceptor — attach JWT ─────────────────────────────────────── */
api.interceptors.request.use((config) => {
  const token = authStore.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Every response — success or error — carries an X-Request-Id header (set by
 * the backend's requestContext middleware). Surfacing it lets a user hand a
 * support conversation a short reference instead of a raw stack trace.
 */
function refSuffix(error: any): string {
  const requestId = error?.response?.headers?.['x-request-id'];
  return requestId ? ` (Ref: ${requestId})` : '';
}

/**
 * Extract human-readable error message from API errors.
 *
 * Server-side failures (5xx) never surface the backend's raw message here —
 * that used to include Prisma/DB internals ("Database / Schema Error: ...")
 * whenever the backend's own error text happened to mention a column/table.
 * A generic message + request-id reference is always safe and is enough for
 * a user to hand to support; the real detail lives in the Admin Error
 * Console (backend logs + error_events), not in a toast.
 *
 * Client errors (4xx — validation/business-rule/auth) are intentionally
 * written to be shown to the user, so those still pass the backend's
 * message straight through.
 */
export function extractApiErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred.';

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    if (status === 502) {
      return `Server unavailable — the API is restarting or unreachable.${refSuffix(error)}`;
    }
    if (status === 504) {
      return `Server took too long to respond.${refSuffix(error)}`;
    }
    if (typeof status === 'number' && status >= 500) {
      return `Something went wrong on our end. Please try again.${refSuffix(error)}`;
    }

    // Client errors (4xx) — the backend writes these to be user-facing.
    if (responseData) {
      if (typeof responseData === 'object') {
        const msg =
          responseData.error?.message ||
          responseData.message ||
          responseData.error ||
          responseData.details ||
          (responseData.error?.code ? `Error Code: ${responseData.error.code}` : null);

        if (msg && typeof msg === 'string') return msg;
      } else if (typeof responseData === 'string' && responseData.trim()) {
        return responseData.replace(/<[^>]*>/g, '').slice(0, 200).trim() || `Server returned HTTP ${status}`;
      }
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Cannot reach the server. Please check your connection and try again.';
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return 'An unexpected server error occurred.';
}

/* ─── Response interceptor — handle 401 & enrich error messages ─────────────── */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const userMessage = extractApiErrorMessage(error);
    (error as any).userMessage = userMessage;

    const errCode = error.response?.data?.error?.code;
    const errMsg = (error.response?.data?.error?.message || '').toLowerCase();
    const isTokenErr =
      error.response?.status === 401 ||
      errCode === 'INVALID_TOKEN' ||
      errCode === 'UNAUTHORIZED' ||
      errCode === 'TOKEN_EXPIRED' ||
      errMsg.includes('expired token') ||
      errMsg.includes('invalid token') ||
      errMsg.includes('token missing');

    if (isTokenErr) {
      authStore.clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/* ─── Typed response wrapper ────────────────────────────────────────────────── */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
