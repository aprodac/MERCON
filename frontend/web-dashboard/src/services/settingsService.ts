import { api, ApiResponse } from '@/lib/api';
import type { PublicSettings, Settings } from '@mercon/shared-types';

export const settingsService = {
  async getPublic(): Promise<PublicSettings> {
    try {
      const res = await api.get<ApiResponse<PublicSettings>>('/settings/public');
      return res.data?.data || {
        appName: 'MERCON Operator Platform',
        logoUrl: null,
        primaryColor: '#E8450F',
        themeColors: null,
        timezone: 'Asia/Riyadh',
        defaultCountryCode: 'SA',
        defaultCountryDialCode: '+966',
        maintenanceMode: false,
        maintenanceBanner: null,
      };
    } catch {
      return {
        appName: 'MERCON Operator Platform',
        logoUrl: null,
        primaryColor: '#E8450F',
        themeColors: null,
        timezone: 'Asia/Riyadh',
        defaultCountryCode: 'SA',
        defaultCountryDialCode: '+966',
        maintenanceMode: false,
        maintenanceBanner: null,
      } as PublicSettings;
    }
  },

  async get(): Promise<Settings> {
    const res = await api.get<ApiResponse<Settings>>('/settings');
    return res.data.data;
  },

  async update(payload: Record<string, any>): Promise<Settings> {
    const res = await api.put<ApiResponse<Settings>>('/settings', payload);
    return res.data.data;
  },

  async getHealth(): Promise<any> {
    const res = await api.get<ApiResponse<any>>('/settings/health');
    return res.data.data;
  },

  async getAuditLogs(params?: {
    action?: string;
    entityType?: string;
    userId?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<{
    success: boolean;
    data: any[];
    pagination: { page: number; per_page: number; total: number; total_pages: number };
    filters: { actions: string[]; entityTypes: string[] };
  }> {
    const res = await api.get('/settings/audit-logs', { params });
    return res.data;
  },

  /**
   * Deployment timezone only. Separate from update() because it's Admin-gated
   * server-side, while the rest of update()'s fields are superadmin-only.
   */
  async updateTimezone(timezone: string): Promise<Settings> {
    const res = await api.put<ApiResponse<Settings>>('/settings/timezone', { timezone });
    return res.data.data;
  },

  /** Uploads a logo file via the generic upload endpoint, returning its URL to save via update(). */
  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<ApiResponse<{ file_url: string }>>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data.file_url;
  },
};
