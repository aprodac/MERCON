/**
 * Documents library actions beyond upload/list: editing a document's details,
 * the "Recently deleted" bin (restore / delete for good), version history and
 * the per-document activity log.
 */
import { Request, Response } from 'express';
import { DocType, DocOwnerType } from '@prisma/client';
import { prisma } from '../db';
import { DOCUMENT_LIST_SELECT, DOCUMENT_FILES_SELECT } from '../utils/documentSelect';
import { logAuditEvent } from '../services/auditService';
import { TRASH_RETENTION_DAYS, TRIP_MEDIA_ENTITY_TYPES, purgeTrashedDocuments } from '../services/documentTrash';
import { LEGACY_DOC_TYPES } from './documentController';

const DAY = 24 * 3600_000;

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });

/* ─── GET /documents/trash ─────────────────────────────────────────────────── */
export const getTrashedDocuments = async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY);
    const documents = await prisma.document.findMany({
      where: { deletedAt: { gte: since }, file_purged_at: null, entity_type: { notIn: TRIP_MEDIA_ENTITY_TYPES } },
      select: { ...DOCUMENT_LIST_SELECT, deletedAt: true, documentType: true, files: DOCUMENT_FILES_SELECT },
      orderBy: { deletedAt: 'desc' },
      take: 1000,
    });
    res.json({ success: true, data: documents, meta: { retention_days: TRASH_RETENTION_DAYS } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch deleted documents' } });
  }
};

/* ─── POST /documents/restore { ids } ──────────────────────────────────────── */
export const restoreDocuments = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'No IDs provided');

    const trashed = await prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: { not: null }, file_purged_at: null, entity_type: { notIn: TRIP_MEDIA_ENTITY_TYPES } },
      select: { id: true },
    });
    const trashedIds = trashed.map((d) => d.id);
    if (trashedIds.length) {
      await prisma.document.updateMany({
        where: { id: { in: trashedIds } },
        data: { deletedAt: null, deleted_by: null, isActive: true, updated_by: (req as any).user?.id },
      });
      await Promise.all(trashedIds.map((id) => logAuditEvent({ req, action: 'DOCUMENT_RESTORED', entityType: 'Document', entityId: id })));
    }
    res.json({ success: true, data: { count: trashedIds.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to restore documents' } });
  }
};

/* ─── POST /documents/purge { ids } — only documents already in the bin ──── */
export const purgeDocuments = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'No IDs provided');

    const count = await purgeTrashedDocuments(ids);
    await logAuditEvent({ req, action: 'DOCUMENTS_PURGED', entityType: 'Document', metadata: { count, ids } });
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to permanently delete documents' } });
  }
};

/* ─── PATCH /documents/:id — edit details ──────────────────────────────────── */
/** undefined = not sent, null = cleared, Date = new value; 'invalid' for junk. */
function parseDateField(v: unknown): Date | null | undefined | 'invalid' {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export const updateDocument = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { document_type_id, issue_date, expiry_date, document_number, is_confidential, folder_id } = req.body || {};

    const existing = await prisma.document.findFirst({ where: { id, deletedAt: null }, include: { documentType: true } });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });

    const data: Record<string, any> = { updated_by: (req as any).user?.id };
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    let documentType = existing.documentType;
    if (document_type_id !== undefined && (document_type_id || null) !== existing.documentTypeId) {
      documentType = document_type_id ? await prisma.documentType.findUnique({ where: { id: document_type_id } }) : null;
      if (document_type_id && !documentType) return badRequest(res, 'Unknown document type');
      const ownerIsTyped = (Object.values(DocOwnerType) as string[]).includes(existing.entity_type);
      if (documentType && ownerIsTyped && documentType.ownerType !== existing.entity_type) {
        return badRequest(res, `${documentType.name} is not a ${existing.entity_type} document`);
      }
      data.documentTypeId = documentType?.id ?? null;
      if (documentType && LEGACY_DOC_TYPES.has(documentType.code)) data.doc_type = documentType.code as DocType;
      changes.type = { from: existing.documentType?.name ?? null, to: documentType?.name ?? null };
    }

    const issue = parseDateField(issue_date);
    const expiry = parseDateField(expiry_date);
    if (issue === 'invalid' || expiry === 'invalid') return badRequest(res, 'Invalid issue or expiry date');
    const nextIssue = issue === undefined ? existing.issue_date : issue;
    const nextExpiry = expiry === undefined ? existing.expiry_date : expiry;
    if (nextIssue && nextExpiry && nextExpiry < nextIssue) return badRequest(res, 'Expiry date cannot be before the issue date');
    if (documentType?.requiresExpiryDate && !nextExpiry) return badRequest(res, `${documentType.name} requires an expiry date`);
    if (documentType?.requiresIssueDate && !nextIssue) return badRequest(res, `${documentType.name} requires an issue date`);

    if (issue !== undefined && isoDay(issue) !== isoDay(existing.issue_date)) {
      data.issue_date = issue;
      changes.issue_date = { from: isoDay(existing.issue_date), to: isoDay(issue) };
    }
    if (expiry !== undefined && isoDay(expiry) !== isoDay(existing.expiry_date)) {
      data.expiry_date = expiry;
      changes.expiry_date = { from: isoDay(existing.expiry_date), to: isoDay(expiry) };
    }

    // The document number only exists in the AI-read metadata. A person's
    // correction overrides what the AI read, in the place every reader
    // already looks.
    if (document_number !== undefined) {
      const ai = (existing.ai_extracted_json as Record<string, any> | null) || {};
      const next = document_number ? String(document_number).trim() || null : null;
      if ((ai.document_number ?? null) !== next) {
        data.ai_extracted_json = { ...ai, document_number: next, document_number_edited: true };
        changes.document_number = { from: ai.document_number ?? null, to: next };
      }
    }

    if (is_confidential !== undefined && !!is_confidential !== existing.is_confidential) {
      data.is_confidential = !!is_confidential;
      changes.is_confidential = { from: existing.is_confidential, to: !!is_confidential };
    }
    if (folder_id !== undefined && (folder_id || null) !== existing.folderId) {
      data.folderId = folder_id || null;
      changes.folder = { from: existing.folderId, to: folder_id || null };
    }

    const include = {
      folder: true,
      documentType: true,
      files: { where: { deletedAt: null, isActive: true }, orderBy: { displayOrder: 'asc' as const } },
    };

    if (!Object.keys(changes).length) {
      const unchanged = await prisma.document.findUnique({ where: { id }, include });
      return res.json({ success: true, data: unchanged });
    }

    const updated = await prisma.document.update({ where: { id }, data, include });
    await logAuditEvent({ req, action: 'DOCUMENT_UPDATED', entityType: 'Document', entityId: id, metadata: { changes } });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updateDocument failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update document' } });
  }
};

/* ─── GET /documents/:id/versions ──────────────────────────────────────────── */
// Renewing uploads a new document of the same type for the same owner. The
// owner folder always uses the newest one; the older ones are its history.
export const getDocumentVersions = async (req: Request, res: Response) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: { id: true, entity_type: true, entity_id: true, documentTypeId: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    if (!doc.documentTypeId) return res.json({ success: true, data: [] });

    const versions = await prisma.document.findMany({
      where: { entity_type: doc.entity_type, entity_id: doc.entity_id, documentTypeId: doc.documentTypeId, deletedAt: null },
      select: { id: true, status: true, issue_date: true, expiry_date: true, file_url: true, mime_type: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: versions.map((v, i) => ({ ...v, isCurrent: i === 0 })) });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch document versions' } });
  }
};

/* ─── GET /documents/:id/activity ──────────────────────────────────────────── */
export const getDocumentActivity = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, createdAt: true, created_by: true } });
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });

    const [logs, uploader] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entityType: 'Document', entityId: id },
        select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      doc.created_by ? prisma.user.findUnique({ where: { id: doc.created_by }, select: { name: true, username: true } }) : null,
    ]);

    const entries = logs.map((l) => {
      const { ipAddress: _ip, userAgent: _ua, ...details } = (l.metadata as Record<string, any> | null) || {};
      return { id: l.id, action: l.action, at: l.createdAt, by: l.user?.name || l.user?.username || null, details };
    });
    // Documents uploaded before activity was recorded still show their upload.
    if (!entries.some((e) => e.action === 'DOCUMENT_UPLOADED')) {
      entries.push({ id: `upload-${doc.id}`, action: 'DOCUMENT_UPLOADED', at: doc.createdAt, by: uploader?.name || uploader?.username || null, details: {} });
    }
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch document activity' } });
  }
};
