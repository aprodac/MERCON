import { api } from '@/lib/api';
import type { ReportFieldKey, ReportSource, TemplateLayout } from '@mercon/shared-types';

export interface InspectedColumn {
  colIndex: number;
  headerText: string;
  sampleValue: string;
  suggestedField: ReportFieldKey | null;
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

/** A customer's own Excel layout for one kind of data (trips, statement of account, rates). */
export interface ReportTemplateSummary {
  id: string;
  name: string;
  /** 'trips' | 'statement' | 'rates' — older rows only ever had 'trips'. */
  source: ReportSource;
  customerId: string | null;
  customer: { name: string } | null;
  /** Line-type filter (legacy column name): only trips / quotations of this LINE_TYPES value; null = all. */
  rate_category: string | null;
  original_filename: string;
  file_size: number;
  layout: TemplateLayout;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which records go in the sheet: an invoice's trips (trips formats only), the
 * customer's records over a period, or nothing for rates (active quotations).
 */
export type TripSheetRun = { invoiceId: string } | { startDate: string; endDate: string; status?: string } | Record<string, never>;

/** What a run covers: rows always; trips add a total, statements their balances. */
export interface ExportSummary {
  rows: number;
  amount?: number;
  openingBalance?: number;
  closingBalance?: number;
}

export type CustomerExportSummary = Record<ReportSource, ExportSummary>;

async function saveBlobResponse(request: Promise<any>, fallbackName: string): Promise<void> {
  let res;
  try {
    res = await request;
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
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const reportTemplateService = {
  async inspect(file: File, source: ReportSource = 'trips'): Promise<TemplateInspection> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/report-templates/inspect', formData, {
      params: { source },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  /** A customer's formats (plus any older shared ones). */
  async list(customerId?: string): Promise<ReportTemplateSummary[]> {
    const res = await api.get('/report-templates', { params: customerId ? { customerId } : undefined });
    return res.data.data;
  },

  async create(params: {
    file: File;
    name: string;
    customerId: string;
    source: ReportSource;
    rate_category?: string | null;
    layout: TemplateLayout;
  }): Promise<ReportTemplateSummary> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('name', params.name);
    formData.append('customerId', params.customerId);
    formData.append('source', params.source);
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

  async preview(id: string, run: TripSheetRun): Promise<ExportSummary> {
    const res = await api.post(`/report-templates/${id}/preview`, run);
    return res.data.data;
  },

  /** Per data type, what the customer has in the period — the group headers on Excel exports. */
  async summary(customerId: string, range: { startDate: string; endDate: string }): Promise<CustomerExportSummary> {
    const res = await api.post('/report-templates/summary', { customerId, ...range });
    return res.data.data;
  },

  /** Fills a saved format and saves the workbook in the browser. */
  async download(id: string, run: TripSheetRun): Promise<void> {
    await saveBlobResponse(api.post(`/report-templates/${id}/generate`, run, { responseType: 'blob' }), 'export.xlsx');
  },

  /** MERCON's own layout for a data type — for a customer without an uploaded format. */
  async downloadStandard(source: ReportSource, customerId: string, range?: { startDate: string; endDate: string }): Promise<void> {
    await saveBlobResponse(
      api.post(`/report-templates/standard/${source}`, { customerId, ...range }, { responseType: 'blob' }),
      `${source}.xlsx`
    );
  },
};
