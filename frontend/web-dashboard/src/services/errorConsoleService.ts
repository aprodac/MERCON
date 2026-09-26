import { api, ApiResponse } from '@/lib/api';

export interface ErrorEvent {
  id: string;
  fingerprint: string;
  code: string;
  message: string;
  stack: string | null;
  route: string;
  source: 'api' | 'web';
  count: number;
  status: 'New' | 'Acknowledged' | 'Resolved';
  lastRequestId: string | null;
  firstUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ErrorEventListParams {
  page?: number;
  per_page?: number;
  status?: string;
  source?: string;
}

export const errorConsoleService = {
  async getAll(params: ErrorEventListParams = {}): Promise<ApiResponse<ErrorEvent[]>> {
    const res = await api.get<ApiResponse<ErrorEvent[]>>('/error-events', { params });
    return res.data;
  },

  async getById(id: string): Promise<ApiResponse<ErrorEvent>> {
    const res = await api.get<ApiResponse<ErrorEvent>>(`/error-events/${id}`);
    return res.data;
  },

  async updateStatus(id: string, payload: { status: ErrorEvent['status']; notes?: string }): Promise<ApiResponse<ErrorEvent>> {
    const res = await api.patch<ApiResponse<ErrorEvent>>(`/error-events/${id}`, payload);
    return res.data;
  },

  /** Fire-and-forget: a failed error report must never block the UI it's reporting from. */
  async reportClientError(payload: { message: string; stack?: string; route: string }): Promise<void> {
    await api.post('/client-errors', payload);
  },
};
