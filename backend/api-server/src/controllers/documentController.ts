import { Request, Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../db';
import { DOCUMENT_LIST_SELECT, DOCUMENT_FILES_SELECT } from '../utils/documentSelect';
import { DocType, DocStatus, DocOwnerType } from '@prisma/client';
import path from 'path';
import fs from 'fs';
// @ts-ignore
import archiver from 'archiver';
import { computeDocumentStatus } from '../services/documentStatusService';
import { compressUploadedImage } from '../services/imageCompressor';
import { logAuditEvent } from '../services/auditService';
import { TRASHED_ACTION, TRASH_RETENTION_DAYS, TRIP_MEDIA_ENTITY_TYPES } from '../services/documentTrash';

/* ─── List documents ──────────────────────────────────────────────────────── */
export const getDocuments = async (req: Request, res: Response) => {
  try {
    const {
      entity_type,
      entity_id,
      doc_type,
      document_type_id,
      status,
      expiring_within_days,
      folder_id,
      scope,
      page = '1',
      per_page = '20'
    } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const isUuid = (str: string | null | undefined): boolean =>
      typeof str === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

    const whereClause: any = { deletedAt: null };
    if (entity_type) whereClause.entity_type = entity_type as string;
    // The Documents library: everything except trip/stop media, which lives
    // on the trip and would otherwise bury company documents.
    else if (scope === 'library') whereClause.entity_type = { notIn: TRIP_MEDIA_ENTITY_TYPES };
    if (entity_id) {
      if (isUuid(entity_id as string)) {
        whereClause.entity_id = entity_id as string;
      } else {
        return res.json({ success: true, data: [], meta: { page: pageNumber, per_page: limit, total: 0 } });
      }
    }
    if (doc_type)    whereClause.doc_type = doc_type as DocType;
    if (document_type_id) whereClause.documentTypeId = document_type_id as string;
    if (status)      whereClause.status = status as DocStatus;
    if (folder_id !== undefined && folder_id !== null && folder_id !== '') {
      whereClause.folderId = folder_id === 'null' ? null : (folder_id as string);
    }

    // Filter by expiry window (e.g. docs expiring within 30 days)
    if (expiring_within_days) {
      const days = parseInt(expiring_within_days as string);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      whereClause.expiry_date = { lte: cutoff, gte: new Date() };
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: whereClause,
        select: {
          ...DOCUMENT_LIST_SELECT,
          folder: true,
          documentType: true,
          files: DOCUMENT_FILES_SELECT,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.document.count({ where: whereClause })
    ]);

    res.json({
      success: true,
      data: documents,
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch documents' } });
  }
};

/* ─── Get single document ─────────────────────────────────────────────────── */
export const getDocumentById = async (req: Request, res: Response) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id as string, deletedAt: null },
      include: { folder: true, documentType: true, files: { where: { deletedAt: null, isActive: true }, orderBy: { displayOrder: 'asc' } } }
    });
    if (!document) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch document' } });
  }
};

/* ─── Upload document ─────────────────────────────────────────────────────── */
/** Owner types a document can be filed against (mirrors the DocOwnerType enum). */
const UPLOAD_OWNER_TYPES = new Set(['Driver', 'Vehicle', 'Trip', 'Customer', 'Company', 'Other', 'MaintenanceRecord']);

/** Legacy doc_type to record when the caller didn't send a valid one. */
const LEGACY_DOC_TYPE_BY_OWNER: Record<string, DocType> = {
  Driver: DocType.DriverLicense,
  Vehicle: DocType.VehicleRegistration,
  Trip: DocType.Waybill,
  Customer: DocType.Contract,
  Company: DocType.Contract,
  Other: DocType.Contract,
};

export const LEGACY_DOC_TYPES = new Set<string>(Object.values(DocType));

/** Best-effort cleanup of files multer already wrote for a rejected request. */
function discardUploadedFiles(files: Express.Multer.File[]) {
  for (const f of files) {
    fs.promises.unlink(f.path).catch(() => {});
  }
}

/**
 * Creates one Document from one or more files. Several files become the pages
 * of the same document (e.g. front and back of an ID card), which is why the
 * route accepts both the legacy single `file` field and a `files` array.
 */
export const uploadDocument = async (req: Request, res: Response) => {
  const fieldFiles = (req.files || {}) as Record<string, Express.Multer.File[]>;
  const uploaded: Express.Multer.File[] = [
    ...(req.file ? [req.file] : []),
    ...(fieldFiles.file || []),
    ...(fieldFiles.files || []),
  ];
  const reject = (message: string) => {
    discardUploadedFiles(uploaded);
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
  };

  try {
    if (uploaded.length === 0) return reject('No file uploaded');

    let { entity_type, entity_id, doc_type, document_type_id, issue_date, expiry_date, is_confidential, folder_id, folderId } = req.body;

    if (!entity_type || !entity_id || (!doc_type && !document_type_id)) {
      return reject('entity_type, entity_id, and either doc_type or document_type_id are required');
    }
    if (!UPLOAD_OWNER_TYPES.has(entity_type)) {
      return reject(`Unknown owner type "${entity_type}"`);
    }

    let documentType = null;
    if (document_type_id) {
      documentType = await prisma.documentType.findUnique({ where: { id: document_type_id as string } });
      if (!documentType) return reject('Unknown document type');
      if (documentType.requiresExpiryDate && !expiry_date) return reject(`${documentType.name} requires an expiry date`);
      if (documentType.requiresIssueDate && !issue_date) return reject(`${documentType.name} requires an issue date`);
      if (uploaded.length > 1 && !documentType.allowsMultipleFiles) {
        return reject(`${documentType.name} holds a single file — upload one file, or use AI sort to file them separately`);
      }
    }

    // doc_type is a legacy enum column. Configured types carry free-form codes
    // ("Isthimara", "IQAMA", custom ones) that are not enum members, and
    // writing one would make Prisma throw — so only keep a real enum value and
    // otherwise derive one from the owner.
    if (!doc_type || !LEGACY_DOC_TYPES.has(doc_type)) {
      if (documentType && LEGACY_DOC_TYPES.has(documentType.code)) {
        doc_type = documentType.code;
      } else if (documentType || doc_type) {
        doc_type = LEGACY_DOC_TYPE_BY_OWNER[documentType?.ownerType || entity_type] || DocType.Contract;
      }
    }

    const parsedIssue = issue_date ? new Date(issue_date) : null;
    const parsedExpiry = expiry_date ? new Date(expiry_date) : null;
    if ((parsedIssue && Number.isNaN(parsedIssue.getTime())) || (parsedExpiry && Number.isNaN(parsedExpiry.getTime()))) {
      return reject('Invalid issue or expiry date');
    }
    if (parsedIssue && parsedExpiry && parsedExpiry < parsedIssue) {
      return reject('Expiry date cannot be before the issue date');
    }

    // Compress images to save disk space & mobile data bandwidth
    for (const f of uploaded) await compressUploadedImage(f.path);

    const urlFor = (f: Express.Multer.File) => (env.BASE_URL ? `${env.BASE_URL}/uploads/${f.filename}` : `/uploads/${f.filename}`);
    const primary = uploaded[0];
    const userId = (req as any).user?.id;
    const targetFolderId = folder_id || folderId || null;

    const document = await prisma.document.create({
      data: {
        entity_type,
        entity_id,
        doc_type: doc_type ? (doc_type as DocType) : null,
        documentTypeId: documentType?.id ?? null,
        status: DocStatus.PendingReview,
        file_url: urlFor(primary),
        mime_type: primary.mimetype,
        folderId: targetFolderId,
        issue_date: parsedIssue,
        expiry_date: parsedExpiry,
        is_confidential: is_confidential === 'true' || is_confidential === true,
        created_by: userId,
        files: {
          create: uploaded.map((f, i) => ({
            file_url: urlFor(f),
            displayOrder: i,
            mime_type: f.mimetype,
            label: uploaded.length > 1 ? f.originalname : null,
            created_by: userId,
          })),
        },
      },
      include: { folder: true, documentType: true, files: true }
    });
    await logAuditEvent({ req, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: document.id, metadata: { files: uploaded.length } });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    console.error('uploadDocument failed:', error);
    discardUploadedFiles(uploaded);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to upload document' } });
  }
};

/* ─── Update document status (verify / reject) ────────────────────────────── */
export const updateDocumentStatus = async (req: Request, res: Response) => {
  try {
    const { status, expiry_date } = req.body;

    const allowedStatuses = Object.values(DocStatus);
    if (!status || !allowedStatuses.includes(status as DocStatus)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${allowedStatuses.join(', ')}` }
      });
    }

    const updateData: any = {
      status: status as DocStatus,
      updated_by: (req as any).user?.id
    };

    if (status === DocStatus.Verified) {
      updateData.verified_by = (req as any).user?.id;
    }
    if (expiry_date) {
      updateData.expiry_date = new Date(expiry_date);
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id as string },
      data: updateData
    });
    await logAuditEvent({ req, action: 'DOCUMENT_STATUS_CHANGED', entityType: 'Document', entityId: updated.id, metadata: { status } });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update document status' } });
  }
};

/* ─── Delete documents → Recently deleted (restorable for 30 days) ──────── */
async function trashDocuments(req: Request, ids: string[]): Promise<number> {
  const userId = (req as any).user?.id;
  const live = await prisma.document.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
  if (!live.length) return 0;
  const liveIds = live.map((d) => d.id);
  await prisma.document.updateMany({
    where: { id: { in: liveIds } },
    data: { deletedAt: new Date(), deleted_by: userId, isActive: false },
  });
  await Promise.all(liveIds.map((id) => logAuditEvent({ req, action: TRASHED_ACTION, entityType: 'Document', entityId: id })));
  return liveIds.length;
}

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const count = await trashDocuments(req, [req.params.id as string]);
    if (!count) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    res.json({ success: true, data: { count, message: `Moved to Recently deleted for ${TRASH_RETENTION_DAYS} days` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete document' } });
  }
};

export const bulkDeleteDocuments = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No IDs provided' } });
    }

    const count = await trashDocuments(req, ids);
    res.json({ success: true, data: { count, message: `Moved ${count} documents to Recently deleted` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to bulk delete documents` } });
  }
};

/* ─── Bulk download as ZIP ─────────────────────────────────────────────────── */
export const bulkDownloadDocuments = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No IDs provided' } });
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null }
    });

    if (documents.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No matching documents found' } });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="documents-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: any) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to build archive' } });
      } else {
        res.destroy(err);
      }
    });
    archive.pipe(res);

    const usedNames = new Set<string>();
    for (const doc of documents) {
      const storedFilename = path.basename(new URL(doc.file_url).pathname);
      const filePath = path.join(process.cwd(), 'uploads', storedFilename);
      if (!fs.existsSync(filePath)) continue;

      let entryName = `${doc.doc_type}${path.extname(storedFilename)}`;
      if (usedNames.has(entryName)) {
        entryName = `${doc.doc_type}-${doc.id.slice(0, 8)}${path.extname(storedFilename)}`;
      }
      usedNames.add(entryName);

      archive.file(filePath, { name: entryName });
    }

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to bulk download documents' } });
    }
  }
};

export const bulkUpdateDocumentStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'IDs and status are required' } });
    }

    if (!(Object.values(DocStatus) as string[]).includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${Object.values(DocStatus).join(', ')}` } });
    }

    await prisma.document.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: {
        status: status as DocStatus,
        updated_by: userId,
        ...(status === DocStatus.Verified ? { verified_by: userId } : {}),
      }
    });
    await Promise.all(ids.map((id: string) => logAuditEvent({ req, action: 'DOCUMENT_STATUS_CHANGED', entityType: 'Document', entityId: id, metadata: { status } })));
    res.json({ success: true, data: { message: `Successfully updated ${ids.length} documents` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to bulk update documents` } });
  }
};

export const bulkMoveDocumentsToFolder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { ids, folder_id } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Document IDs are required' } });
    }

    await prisma.document.updateMany({
      where: { id: { in: ids } },
      data: {
        folderId: folder_id || null,
        updated_by: userId
      }
    });

    res.json({ success: true, data: { message: `Successfully moved ${ids.length} documents` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to move documents to folder' } });
  }
};

/* ─── Owner folder (single owner's full document-type checklist) ─────────────
 * Powers the Documents Center's owner-folder view and the Driver/Vehicle
 * detail-page document tab. Returns every active DocumentType configured for
 * ownerType, each joined with the owner's current Document (if any) for that
 * type, with status computed centrally via documentStatusService. */
async function resolveOwnerInfo(ownerType: string, ownerId: string): Promise<{ name: string; avatar_url: string | null }> {
  if (ownerType === 'Driver') {
    const driver = await prisma.driver.findUnique({ where: { id: ownerId }, select: { first_name: true, last_name: true, ref_id: true, avatar_url: true } });
    return {
      name: driver ? `${driver.first_name} ${driver.last_name}`.trim() : 'Unknown Driver',
      avatar_url: driver?.avatar_url || null,
    };
  }
  if (ownerType === 'Vehicle') {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: ownerId }, select: { plate_number: true, ref_id: true } });
    return {
      name: vehicle ? (vehicle.plate_number || vehicle.ref_id || 'Unknown Vehicle') : 'Unknown Vehicle',
      avatar_url: null,
    };
  }
  return { name: ownerType, avatar_url: null };
}

export const getOwnerFolder = async (req: Request, res: Response) => {
  try {
    const { ownerType, ownerId } = req.query;
    if (!ownerType || !ownerId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'ownerType and ownerId are required' } });
    }
    if (!Object.values(DocOwnerType).includes(ownerType as DocOwnerType)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `ownerType must be one of: ${Object.values(DocOwnerType).join(', ')}` } });
    }

    const [ownerInfo, documentTypes, documents] = await Promise.all([
      resolveOwnerInfo(ownerType as string, ownerId as string),
      prisma.documentType.findMany({
        where: { ownerType: ownerType as DocOwnerType, isActive: true, requirementStatus: { not: 'DISABLED' } },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.document.findMany({
        where: { entity_type: ownerType as string, entity_id: ownerId as string, deletedAt: null, documentTypeId: { not: null } },
        select: { ...DOCUMENT_LIST_SELECT, files: DOCUMENT_FILES_SELECT },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const docByTypeId = new Map<string, (typeof documents)[number]>();
    for (const doc of documents) {
      if (doc.documentTypeId && !docByTypeId.has(doc.documentTypeId)) {
        docByTypeId.set(doc.documentTypeId, doc); // most recent wins (already sorted desc)
      }
    }

    const slots = documentTypes.map((dt) => {
      const document = docByTypeId.get(dt.id) || null;
      const status = document
        ? computeDocumentStatus(document.expiry_date, dt.requiresExpiryDate)
        : 'MISSING';
      return { documentType: dt, document, status };
    });

    const mandatorySlots = slots.filter((s) => s.documentType.requirementStatus === 'MANDATORY');
    const mandatoryComplete = mandatorySlots.filter((s) => s.status !== 'MISSING' && s.status !== 'EXPIRED').length;

    res.json({
      success: true,
      data: {
        ownerType,
        ownerId,
        ownerName: ownerInfo.name,
        avatar_url: ownerInfo.avatar_url,
        mandatoryTotal: mandatorySlots.length,
        mandatoryComplete,
        slots,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch owner document folder' } });
  }
};

/* ─── Owner folders (compliance summary for EVERY owner of a type) ──────────
 * The Documents Center lists hundreds of drivers/vehicles as folder cards, so
 * it can't call getOwnerFolder per owner. This resolves every owner's mandatory
 * checklist in a fixed number of queries regardless of fleet size. */
export const getOwnerFolders = async (req: Request, res: Response) => {
  try {
    const { ownerType } = req.query;
    if (ownerType !== 'Driver' && ownerType !== 'Vehicle') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'ownerType must be Driver or Vehicle' } });
    }

    const [documentTypes, owners] = await Promise.all([
      prisma.documentType.findMany({
        where: { ownerType: ownerType as DocOwnerType, isActive: true, requirementStatus: { not: 'DISABLED' } },
        orderBy: { displayOrder: 'asc' },
      }),
      ownerType === 'Driver'
        ? prisma.driver.findMany({
            where: { deletedAt: null },
            select: { id: true, first_name: true, last_name: true, ref_id: true, avatar_url: true, assignedVehicle: { select: { plate_number: true, ref_id: true } } },
            orderBy: { first_name: 'asc' },
          })
        : prisma.vehicle.findMany({
            where: { deletedAt: null },
            select: { id: true, plate_number: true, ref_id: true, assignedDriver: { select: { first_name: true, last_name: true } } },
            orderBy: { plate_number: 'asc' },
          }),
    ]);

    const ownerIds = owners.map((o) => o.id);
    const documents = await prisma.document.findMany({
      where: { entity_type: ownerType as string, entity_id: { in: ownerIds }, deletedAt: null, documentTypeId: { not: null } },
      select: { id: true, entity_id: true, documentTypeId: true, expiry_date: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // entity_id -> documentTypeId -> most recent document (list already sorted desc)
    const byOwner = new Map<string, Map<string, (typeof documents)[number]>>();
    for (const doc of documents) {
      let perType = byOwner.get(doc.entity_id);
      if (!perType) { perType = new Map(); byOwner.set(doc.entity_id, perType); }
      if (doc.documentTypeId && !perType.has(doc.documentTypeId)) perType.set(doc.documentTypeId, doc);
    }

    const mandatoryTypes = documentTypes.filter((dt) => dt.requirementStatus === 'MANDATORY');

    const data = owners.map((owner: any) => {
      const perType = byOwner.get(owner.id);
      const slots = mandatoryTypes.map((dt) => {
        const doc = perType?.get(dt.id) || null;
        return {
          documentTypeId: dt.id,
          code: dt.code,
          name: dt.name,
          expiry_date: doc?.expiry_date ?? null,
          documentId: doc?.id ?? null,
          status: doc ? computeDocumentStatus(doc.expiry_date, dt.requiresExpiryDate) : 'MISSING',
        };
      });
      return {
        ownerType,
        ownerId: owner.id,
        ownerName: ownerType === 'Driver'
          ? `${owner.first_name} ${owner.last_name}`.trim()
          : (owner.plate_number || owner.ref_id || 'Vehicle'),
        ownerRef: owner.ref_id || null,
        avatar_url: ownerType === 'Driver' ? owner.avatar_url || null : null,
        relatedName: ownerType === 'Driver'
          ? (owner.assignedVehicle?.plate_number || owner.assignedVehicle?.ref_id || null)
          : (owner.assignedDriver ? `${owner.assignedDriver.first_name} ${owner.assignedDriver.last_name}`.trim() : null),
        mandatoryTotal: slots.length,
        mandatoryComplete: slots.filter((s) => s.status === 'VALID' || s.status === 'EXPIRING_SOON').length,
        slots,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch owner folders' } });
  }
};

/* ─── Add an additional file to an existing (multi-file) document ────────── */
export const addDocumentFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }

    const document = await prisma.document.findUnique({
      where: { id: req.params.id as string, deletedAt: null },
      include: { documentType: true },
    });
    if (!document) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    if (document.documentType && !document.documentType.allowsMultipleFiles) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${document.documentType.name} does not allow multiple files` } });
    }

    const file_url = env.BASE_URL
      ? `${env.BASE_URL}/uploads/${req.file.filename}`
      : `/uploads/${req.file.filename}`;

    const file = await prisma.documentFile.create({
      data: {
        documentId: document.id,
        file_url,
        mime_type: req.file.mimetype,
        label: req.body.label || null,
        created_by: (req as any).user?.id,
      },
    });
    await logAuditEvent({ req, action: 'DOCUMENT_PAGE_ADDED', entityType: 'Document', entityId: document.id });

    res.status(201).json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to add file to document' } });
  }
};

/* ─── Remove a file from a document (hard delete) ─────────────────────────── */
export const deleteDocumentFile = async (req: Request, res: Response) => {
  try {
    await prisma.documentFile.delete({
      where: { id: req.params.fileId as string },
    });
    await logAuditEvent({ req, action: 'DOCUMENT_PAGE_REMOVED', entityType: 'Document', entityId: req.params.id as string });
    res.json({ success: true, data: { message: 'File permanently removed successfully' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to remove file' } });
  }
};
