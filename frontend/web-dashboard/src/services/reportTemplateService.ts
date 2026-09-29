import { api } from '@/lib/api';
import type { TemplateLayout, TripReportFieldKey } from '@mercon/shared-types';

export interface InspectedColumn {
  colIndex: number;
  headerText: string;
  sampleValue: string;
  suggestedField: TripReportFieldKey | null;
}

export interface InspectedSheet {
  sheetName: string;
  headerRowIdx: number;
  dataStartRow: number;
  dataEndRow: number;
  bandSize: number;
  columns: InspectedColumn[];
}

export interface TemplateInspection {
  allSheets: string[];
  bestSheet: InspectedSheet | null;
}

/** A customer's own Excel layout for the trip sheet sent with their invoice. */
export interface ReportTemplateSummary {
  id: string;
  name: string;
  source: string;
  customerId: string | null;
  customer: { name: string } | null;
  /** Line-type filter (legacy column name): only trips of this LINE_TYPES value; null = all. */
  rate_category: string | null;
  original_filename: string;
  file_size: number;
  layout: TemplateLayout;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Which trips go in the sheet: an invoice's trips, or the format's customer over a date range. */
export type TripSheetRun = { invoiceId: string } | { startDate: string; endDate: string; status?: string };

export interface TripSheetPreview {
  total: number;
  amount: number;
}

export const reportTemplateService = {
  async inspect(file: File): Promise<TemplateInspection> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/report-templates/inspect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  /** A customer's formats (plus any older shared ones). */
  async list(customerId?: string): Promise<ReportTemplateSummary[]> {
    const res = await api.get('/report-templates', { params: customerId ? { customerId } : undefined });
    return res.data.data;
  },

  async create(params: { file: File; name: string; customerId: string; rate_category?: string | null; layout: TemplateLayout }): Promise<ReportTemplateSummary> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('name', params.name);
    formData.append('customerId', params.customerId);
    if (params.rate_category) formData.append('rate_category', params.rate_category);
    formData.append('layout', JSON.stringify(params.layout));
    const res = await api.post('/report-templates', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async update(
    id: string,
    params: { file?: File; name?: string; rate_category?: string | null; layout?: TemplateLayout }
  ): Promise<ReportTemplateSummary> {
    const formData = new FormData();
    if (params.file) formData.append('file', params.file);
    if (params.name !== undefined) formData.append('name', params.name);
    if (params.rate_category !== undefined) formData.append('rate_category', params.rate_category ?? '');
    if (params.layout !== undefined) formData.append('layout', JSON.stringify(params.layout));
    const res = await api.patch(`/report-templates/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/report-templates/${id}`);
  },

  async preview(id: string, run: TripSheetRun): Promise<TripSheetPreview> {
    const res = await api.post(`/report-templates/${id}/preview`, run);
    return res.data.data;
  },

  /** Builds the filled workbook and saves it in the browser. */
  async download(id: string, run: TripSheetRun): Promise<void> {
    let res;
    try {
      res = await api.post(`/report-templates/${id}/generate`, run, { responseType: 'blob' });
    } catch (err: any) {
      // A blob response hides the API's JSON error message; read it back out.
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          err.response.data = JSON.parse(await data.text());
        } catch {
          /* not JSON — keep the original error */
        }
      }
      throw err;
    }
    const disposition: string = res.headers?.['content-disposition'] ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'trip_sheet.xlsx';
    const url = URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
