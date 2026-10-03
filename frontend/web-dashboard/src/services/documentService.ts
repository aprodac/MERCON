import { api, ApiResponse } from '@/lib/api';
import { MerconFolder } from './folderService';
import type { DocumentType, DocOwnerType } from './documentTypeService';
import { chunk, relativePathOf } from '@/lib/fileDrop';

export type DocType   = 'DriverLicense' | 'VehicleRegistration' | 'Insurance' | 'POD' | 'CustomsClearance' | 'Waybill' | 'Contract' | 'Invoice' | 'Emergency' | 'Passport';
export type DocStatus = 'PendingReview' | 'Verified' | 'Rejected' | 'Expired';

export interface MerconDocument {
  id: string;
  entity_type: string;
  entity_id: string;
  doc_type: DocType;
  status: DocStatus;
  file_url: string;
  mime_type: string | null;
  folderId?: string | null;
  folder?: MerconFolder | null;
  issue_date: string | null;
  expiry_date: string | null;
  ocr_raw_text?: string | null;
  ai_extracted_json?: {
    document_number?: string | null;
    vehicle_plate?: string | null;
    issuing_authority?: string | null;
    extra_details?: Record<string, any> | null;
    notes?: string | null;
    confidence?: number;
  } | null;
  is_confidential: boolean;
  isActive: boolean;
  createdAt: string;
  documentTypeId?: string | null;
  documentType?: DocumentType | null;
  files?: Array<{ id: string; file_url: string; mime_type: string | null; label: string | null }>;
}

export type DocComplianceStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';

export interface OwnerFolderSlot {
  documentType: DocumentType;
  document: MerconDocument | null;
  status: DocComplianceStatus;
}

export interface OwnerFolder {
  ownerType: DocOwnerType;
  ownerId: string;
  ownerName: string;
  avatar_url?: string | null;
  mandatoryTotal: number;
  mandatoryComplete: number;
  slots: OwnerFolderSlot[];
}

export interface OwnerFoldersSummarySlot {
  documentTypeId: string;
  code: string;
  name: string;
  expiry_date: string | null;
  documentId: string | null;
  status: DocComplianceStatus;
}

export interface OwnerFoldersSummaryRow {
  ownerType: 'Driver' | 'Vehicle';
  ownerId: string;
  ownerName: string;
  ownerRef: string | null;
  avatar_url?: string | null;
  relatedName: string | null;
  mandatoryTotal: number;
  mandatoryComplete: number;
  slots: OwnerFoldersSummarySlot[];
}

/* ─── Staged import ────────────────────────────────────────────────────────── */

export type ImportItemStatus = 'Pending' | 'Analyzing' | 'Ready' | 'NeedsInput' | 'Unrecognised' | 'Confirmed' | 'Skipped' | 'Failed';
export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface DocumentImportItem {
  id: string;
  filename: string;
  file_url: string;
  mime_type: string | null;
  status: ImportItemStatus;
  ownerType: 'Driver' | 'Vehicle' | null;
  ownerId: string | null;
  ownerName: string | null;
  documentType: { id: string; name: string; code: string; ownerType: string; allowsMultipleFiles: boolean } | null;
  confidence: MatchConfidence | null;
  reason: string | null;
  /** What the AI thinks the file is, even when it matches no configured type. */
  detectedKind: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  duplicateOfDocumentId: string | null;
  duplicateExpiry: string | null;
  error: string | null;
  createdDocumentId: string | null;
}

export interface DocumentImport {
  id: string;
  items: DocumentImportItem[];
  analyzing: number;
  isComplete: boolean;
  counts: {
    total: number;
    ready: number;
    needsInput: number;
    unrecognised: number;
    failed: number;
    confirmed: number;
    duplicates: number;
  };
}

export interface ImportItemPatch {
  ownerType?: 'Driver' | 'Vehicle' | null;
  ownerId?: string | null;
  documentTypeId?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  document_number?: string | null;
  status?: 'Skipped';
}

export interface ConfirmImportResult {
  created: number;
  replaced: number;
  filesAdded: number;
  skipped: number;
  blocked: Array<{ id: string; reason: string }>;
  remaining: number;
}

export interface DocumentFilters {
  entity_type?: string;
  entity_id?: string;
  doc_type?: DocType;
  status?: DocStatus;
  expiring_within_days?: number;
  folder_id?: string | null;
  /** 'library' leaves out trip and stop media (photos, POD), which live on the trip. */
  scope?: 'library';
  page?: number;
  per_page?: number;
}

export interface DocumentPatch {
  document_type_id?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  document_number?: string | null;
  is_confidential?: boolean;
  folder_id?: string | null;
}

export interface DocumentVersion {
  id: string;
  status: DocStatus;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string;
  mime_type: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface DocumentActivityEntry {
  id: string;
  action: string;
  at: string;
  by: string | null;
  details: Record<string, any>;
}

export type TrashedDocument = MerconDocument & { deletedAt: string };

export const documentService = {
  async getAll(filters: DocumentFilters = {}): Promise<ApiResponse<MerconDocument[]>> {
    const res = await api.get<ApiResponse<MerconDocument[]>>('/documents', { params: filters });
    return res.data;
  },

  async getById(id: string): Promise<MerconDocument> {
    const res = await api.get<ApiResponse<MerconDocument>>(`/documents/${id}`);
    return res.data.data;
  },

  async upload(formData: FormData, onUploadProgress?: (progressEvent: any) => void): Promise<MerconDocument> {
    // File transfers routinely take longer than the API client's default 15s
    // JSON-request timeout — a multi-MB PDF/photo through the production
    // nginx+Docker hop can easily exceed that and abort with a client-side
    // timeout even though the upload would have succeeded given more time.
    const res = await api.post<ApiResponse<MerconDocument>>('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      onUploadProgress,
    });
    return res.data.data;
  },

  async addFile(id: string, file: File, label?: string, onUploadProgress?: (progressEvent: any) => void): Promise<MerconDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (label) formData.append('label', label);
    const res = await api.post<ApiResponse<MerconDocument>>(`/documents/${id}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      onUploadProgress,
    });
    return res.data.data;
  },

  async updateStatus(id: string, status: DocStatus, expiry_date?: string): Promise<MerconDocument> {
    const res = await api.patch<ApiResponse<MerconDocument>>(`/documents/${id}/status`, { status, expiry_date });
    return res.data.data;
  },

  async updateDates(id: string, dates: { issue_date?: string | null; expiry_date?: string | null }): Promise<MerconDocument> {
    return documentService.update(id, dates);
  },

  /** Edit a document's details. Only the fields sent are changed. */
  async update(id: string, patch: DocumentPatch): Promise<MerconDocument> {
    const res = await api.patch<ApiResponse<MerconDocument>>(`/documents/${id}`, patch);
    return res.data.data;
  },

  async getVersions(id: string): Promise<DocumentVersion[]> {
    const res = await api.get<ApiResponse<DocumentVersion[]>>(`/documents/${id}/versions`);
    return res.data.data;
  },

  async getActivity(id: string): Promise<DocumentActivityEntry[]> {
    const res = await api.get<ApiResponse<DocumentActivityEntry[]>>(`/documents/${id}/activity`);
    return res.data.data;
  },

  /** Recently deleted — restorable for 30 days. */
  async getTrash(): Promise<TrashedDocument[]> {
    const res = await api.get<ApiResponse<TrashedDocument[]>>('/documents/trash');
    return res.data.data;
  },

  async restore(ids: string[]): Promise<number> {
    const res = await api.post<ApiResponse<{ count: number }>>('/documents/restore', { ids });
    return res.data.data.count;
  },

  /** Deletes documents already in Recently deleted, for good. */
  async purge(ids: string[]): Promise<number> {
    const res = await api.post<ApiResponse<{ count: number }>>('/documents/purge', { ids });
    return res.data.data.count;
  },


  async delete(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },

  async bulkDelete(ids: string[]): Promise<void> {
    await api.post('/documents/bulk-delete', { ids });
  },

  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    await api.post('/documents/bulk-update-status', { ids, status });
  },

  async bulkMoveToFolder(ids: string[], folderId: string | null): Promise<void> {
    await api.post('/documents/bulk-move', { ids, folder_id: folderId });
  },

  async bulkDownloadZip(ids: string[]): Promise<Blob> {
    const res = await api.post('/documents/bulk-download', { ids }, { responseType: 'blob', timeout: 120_000 });
    return res.data as Blob;
  },

  async batchImportTruckDocs(folderPath?: string): Promise<any> {
    const res = await api.post('/documents/batch-truck-docs-local', { folderPath });
    return res.data;
  },

  async batchUploadFolder(formData: FormData): Promise<any> {
    const res = await api.post('/documents/batch-upload-folder', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    return res.data;
  },

  async uploadRawChunk(payload: { filename: string; chunk: string; isFirst: boolean; isLast: boolean; cleanId?: string }): Promise<any> {
    const res = await api.post('/documents/upload-raw-chunk', payload);
    return res.data;
  },

  async bulkOcrExtract(onlyMissingExpiry = true, limit = 200, ids?: string[]): Promise<any> {
    const res = await api.post('/documents/bulk-ocr-extract', {
      only_missing_expiry: ids && ids.length > 0 ? false : onlyMissingExpiry,
      limit,
      ids,
    });
    return res.data;
  },

  async extractDocumentOcr(id: string): Promise<any> {
    const res = await api.post(`/documents/${id}/ocr-extract`);
    return res.data;
  },

  async autoAssignUnlinked(): Promise<any> {
    const res = await api.post('/documents/auto-assign-unlinked');
    return res.data;
  },

  async previewAutoAssign(): Promise<any> {
    const res = await api.get('/documents/preview-auto-assign');
    return res.data;
  },

  async confirmAutoAssign(assignments: Array<{ docId: string; entityType: string; entityId: string }>): Promise<any> {
    const res = await api.post('/documents/confirm-auto-assign', { assignments });
    return res.data;
  },

  async getOwnerFolder(ownerType: DocOwnerType | string, ownerId: string): Promise<OwnerFolder> {
    const res = await api.get<ApiResponse<OwnerFolder>>('/documents/owner-folder', { params: { ownerType, ownerId } });
    return res.data.data;
  },

  async getOwnerFolders(ownerType: 'Driver' | 'Vehicle'): Promise<OwnerFoldersSummaryRow[]> {
    const res = await api.get<ApiResponse<OwnerFoldersSummaryRow[]>>('/documents/owner-folders', { params: { ownerType } });
    return res.data.data;
  },

  async deleteFile(documentId: string, fileId: string): Promise<void> {
    await api.delete(`/documents/${documentId}/files/${fileId}`);
  },

  /* ─── Staged import pipeline ─────────────────────────────────────────────
   * Files are uploaded here, read by AI, reviewed, and only become real
   * Documents on confirm — nothing unowned ever reaches the vault. */

  async createImport(
    files: File[],
    ownerType?: string,
    ownerId?: string,
    onUploadProgress?: (progressEvent: any) => void,
  ): Promise<{ id: string; itemCount: number }> {
    const formData = importFormData(files, ownerType, ownerId);
    const res = await api.post<ApiResponse<{ id: string; itemCount: number }>>('/documents/imports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000, // a large batch is a long single upload
      onUploadProgress,
    });
    return res.data.data;
  },

  async appendImportFiles(
    importId: string,
    files: File[],
    onUploadProgress?: (progressEvent: any) => void,
  ): Promise<{ id: string; itemCount: number; added: number }> {
    const res = await api.post<ApiResponse<{ id: string; itemCount: number; added: number }>>(
      `/documents/imports/${importId}/files`,
      importFormData(files),
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000, onUploadProgress },
    );
    return res.data.data;
  },

  /**
   * Stages any number of files (a whole folder, say) as one import, sending
   * them in small batches so progress is real and one slow request doesn't
   * sink the lot. Reports overall progress as a 0–100 percentage.
   */
  async stageImport(
    files: File[],
    opts: { ownerType?: string; ownerId?: string; onProgress?: (pct: number, sentFiles: number) => void } = {},
  ): Promise<{ id: string; itemCount: number }> {
    const batches = batchFiles(files);
    const totalBytes = files.reduce((n, f) => n + f.size, 0) || 1;
    let doneBytes = 0;
    let sentFiles = 0;
    let importId: string | null = null;
    let itemCount = 0;

    for (const batch of batches) {
      const batchBytes = batch.reduce((n, f) => n + f.size, 0);
      const onUploadProgress = (evt: any) => {
        const loaded = evt.total ? (evt.loaded / evt.total) * batchBytes : 0;
        opts.onProgress?.(Math.min(99, Math.round(((doneBytes + loaded) / totalBytes) * 100)), sentFiles);
      };
      if (!importId) {
        const created = await documentService.createImport(batch, opts.ownerType, opts.ownerId, onUploadProgress);
        importId = created.id;
        itemCount = created.itemCount;
      } else {
        itemCount = (await documentService.appendImportFiles(importId, batch, onUploadProgress)).itemCount;
      }
      doneBytes += batchBytes;
      sentFiles += batch.length;
      opts.onProgress?.(Math.round((doneBytes / totalBytes) * 100), sentFiles);
    }
    return { id: importId!, itemCount };
  },

  async getImport(id: string): Promise<DocumentImport> {
    const res = await api.get<ApiResponse<DocumentImport>>(`/documents/imports/${id}`);
    return res.data.data;
  },

  async analyzeImport(id: string, itemIds?: string[]): Promise<{ importId: string; count: number; message: string }> {
    const res = await api.post<ApiResponse<{ importId: string; count: number; message: string }>>(`/documents/imports/${id}/analyze`, { itemIds });
    return res.data.data;
  },

  async listImports(): Promise<Array<{ id: string; createdAt: string; total: number; pending: number }>> {
    const res = await api.get<ApiResponse<Array<{ id: string; createdAt: string; total: number; pending: number }>>>('/documents/imports');
    return res.data.data;
  },

  async updateImportItem(importId: string, itemId: string, patch: ImportItemPatch): Promise<any> {
    const res = await api.patch(`/documents/imports/${importId}/items/${itemId}`, patch);
    return res.data.data;
  },

  async confirmImport(
    importId: string,
    itemIds: string[],
    duplicateActions?: Record<string, 'replace' | 'addFile' | 'skip'>,
  ): Promise<ConfirmImportResult> {
    const res = await api.post<ApiResponse<ConfirmImportResult>>(
      `/documents/imports/${importId}/confirm`,
      { itemIds, duplicateActions },
      { timeout: 120_000 },
    );
    return res.data.data;
  },

  async discardImport(id: string): Promise<void> {
    await api.delete(`/documents/imports/${id}`);
  },

  async analyzeAgreement(id: string): Promise<{
    agreement_ref: string | null;
    valid_from: string | null;
    valid_to: string | null;
    payment_terms: string | null;
    conditions: string | null;
    routes: Array<{
      origin_name: string;
      destination_name: string;
      vehicle_class: string;
      line_type: string;
      billing_rate: number;
      driver_charge?: number | null;
    }>;
    confidence: number;
    notes?: string | null;
  }> {
    const res = await api.post<ApiResponse<any>>(`/documents/${id}/analyze-agreement`);
    return res.data.data;
  },
};

/** Multipart body for staging files, carrying each file's folder path. */
function importFormData(files: File[], ownerType?: string, ownerId?: string): FormData {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('relativePaths', JSON.stringify(files.map(relativePathOf)));
  if (ownerType) formData.append('ownerType', ownerType);
  if (ownerId) formData.append('ownerId', ownerId);
  return formData;
}

/** Groups files into requests of at most 25 files / ~40 MB each. */
function batchFiles(files: File[]): File[][] {
  const MAX_FILES = 25;
  const MAX_BYTES = 40 * 1024 * 1024;
  const out: File[][] = [];
  let current: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (current.length > 0 && (current.length >= MAX_FILES || bytes + f.size > MAX_BYTES)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(f);
    bytes += f.size;
  }
  if (current.length) out.push(current);
  return out.length ? out : chunk(files, MAX_FILES);
}
