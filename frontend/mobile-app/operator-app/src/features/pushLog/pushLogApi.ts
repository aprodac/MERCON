/**
 * Push log API — did staff pushes reach the operator app, and how fast.
 * Admins only (the server refuses everyone else):
 *   GET /notifications/push-log?filter=all|failed|slow&user=<id>
 */
import { api } from '@mercon/mobile-shared/lib/api';

/** arrived = the phone said it got it; delivered = Apple/Google accepted it; see backend services/pushLog. */
export type PushOutcome = 'arrived' | 'delivered' | 'sending' | 'retrying' | 'failed' | 'unknown';
export type PushLogFilter = 'all' | 'failed' | 'slow';

export interface PushLogItem {
  id: string;
  outcome: PushOutcome;
  delayMs: number | null;
  reason: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string;
  receivedAt: string | null;
  title: string;
  message: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  readInApp: boolean;
  recipient: { id: string; name: string | null; username: string | null; role: string } | null;
  phone: { id: string; platform: string } | null;
}

export interface PushLogPerson {
  id: string;
  name: string | null;
  username: string | null;
  role: string;
  phones: { id: string; platform: string; pushOn: boolean; lastSeenAt: string }[];
}

export interface PushLogSummary {
  total: number;
  arrived: number;
  delivered: number;
  sending: number;
  failed: number;
  slow: number;
  typicalDelayMs: number | null;
}

export interface PushLog {
  summary: PushLogSummary;
  items: PushLogItem[];
  people: PushLogPerson[];
  generatedAt: string;
}

export const pushLogApi = {
  async get(filter: PushLogFilter, userId?: string | null): Promise<PushLog> {
    const { data } = await api.get('/notifications/push-log', { params: { filter, ...(userId ? { user: userId } : {}) } });
    return data.data as PushLog;
  },
};
