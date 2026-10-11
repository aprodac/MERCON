import { api, ApiResponse } from '@/lib/api';
import type { AssistantConfig, PublicSettings, Settings } from '@mercon/shared-types';

export interface EtaAccuracyRow {
  horizon: string;
  label: string;
  predictions: number;
  stops: number;
  typicalMissMin: number | null;
  biasMin: number | null;
  p90Min: number | null;
  within15Pct: number | null;
}

export interface EtaAccuracy {
  days: number;
  rows: EtaAccuracyRow[];
  overall: Omit<EtaAccuracyRow, 'horizon' | 'label'>;
  estimates: number;
}

export interface ServerSnapshotStatus {
  configured: boolean;
  missing: string[];
  hostname: string | null;
  snapshot: { createdAt: string | null; expiresAt: string | null } | null;
  running: { startedAt: string; state: string } | null;
}

export const settingsService = {
  async getPublic(): Promise<PublicSettings> {
    try {
      const res = await api.get<ApiResponse<PublicSettings>>('/settings/public');
      return res.data?.data || {
        appName: 'MERCON Operator Platform',
        companyLegalName: 'MERCON Logistics',
        vatNumber: null,
        crNumber: null,
        logoUrl: null,
        primaryColor: '#E8450F',
        themeColors: null,
        timezone: 'Asia/Riyadh',
        defaultCountryCode: 'SA',
        defaultCountryDialCode: '+966',
        maintenanceMode: false,
        maintenanceBanner: null,
      } as PublicSettings;
    } catch {
      return {
        appName: 'MERCON Operator Platform',
        companyLegalName: 'MERCON Logistics',
        vatNumber: null,
        crNumber: null,
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

  /** SuperAdmin: what "Clean up data" would remove (changes nothing). */
  async getDataCleanup(): Promise<DataCleanupPreview> {
    const res = await api.get<ApiResponse<DataCleanupPreview>>('/settings/data-cleanup');
    return res.data.data;
  },

  /** SuperAdmin, dev databases only: remove the chosen data. */
  async runDataCleanup(body: { allTrips: boolean; finance: boolean; customerIds: string[]; driverIds: string[]; locationIds: string[]; confirm: string }): Promise<DataCleanupResult> {
    const res = await api.post<ApiResponse<DataCleanupResult>>('/settings/data-cleanup', body, { timeout: 180_000 });
    return res.data.data;
  },

  /** How far ETAs were off once trucks arrived, by how far ahead they were predicted. */
  async getEtaAccuracy(days = 30): Promise<EtaAccuracy> {
    const res = await api.get<ApiResponse<EtaAccuracy>>('/settings/eta-accuracy', { params: { days } });
    return res.data.data;
  },

  /** Superadmin: this server's Hostinger snapshot (one per VPS). */
  async getServerSnapshot(): Promise<ServerSnapshotStatus> {
    const res = await api.get<ApiResponse<ServerSnapshotStatus>>('/settings/server-snapshot');
    return res.data.data;
  },

  /** Superadmin: replace the snapshot with a new one. */
  async takeServerSnapshot(): Promise<{ startedAt: string; actionId: string | null }> {
    const res = await api.post<ApiResponse<{ startedAt: string; actionId: string | null }>>('/settings/server-snapshot', { confirm: true }, { timeout: 60_000 });
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

  /** Ops WhatsApp number for the customer tracking page's "Ask us" button (Admin). Empty switches the button off. */
  async updateSupportWhatsapp(supportWhatsapp: string | null): Promise<Settings> {
    const res = await api.put<ApiResponse<Settings>>('/settings/support-whatsapp', { supportWhatsapp });
    return res.data.data;
  },

  /** Settings → Assistant: what the floating assistant reports and how it looks (Admin only). */
  async updateAssistant(config: AssistantConfig): Promise<Settings> {
    const res = await api.put<ApiResponse<Settings>>('/settings/assistant', config);
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

export interface DataCleanupPreview {
  allowed: boolean;
  database: string;
  trips: { live: number; inRecycleBin: number; stops: number; gpsPoints: number; charges: number; documents: number; extraFiles: number };
  finance: Record<string, number>;
  customers: Array<{ id: string; name: string; phone: string | null; trips: number; quotations: number; locations: number; suggested: boolean; reason: string | null }>;
  drivers: Array<{ id: string; name: string; phone: string | null; trips: number; suggested: boolean; reason: string | null }>;
  locations: Array<{ id: string; name: string; customer: string | null; quotations: number; reason: string }>;
}

export interface DataCleanupResult {
  database: string;
  counts: Record<string, number>;
  filesMoved: number;
  filesFolder: string | null;
}
