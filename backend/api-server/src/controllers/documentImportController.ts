import { Response } from 'express';
import { DocType, ImportItemStatus } from '@prisma/client';
import { prisma } from '../db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { analyzeDocumentWithAI, getLocalFilePathFromUrl } from '../services/ocrService';
import {
  loadMatchCandidates,
  matchOwner,
  matchDocumentType,
  findDuplicate,
} from '../services/documentMatchService';

/**
 * The staged-import pipeline: files land here, AI reads them, a human confirms,
 * and only then do they become Documents.
 *
 * The point of staging is that /documents never shows anything unowned or
 * unidentified. Previously an upload wrote a Document row immediately and a
 * separate auto-assign pass tried to work out the owner afterwards, so every
 * file the matcher couldn't place became permanent clutter in the vault.
 */

/** Owner types that can be auto-detected from a document's contents. */
const MATCHABLE_OWNER_TYPES = ['Driver', 'Vehicle'];

async function loadTypeCatalogue() {
  return prisma.documentType.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, ownerType: true },
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * Reads one staged file and writes back what we think it is. Never throws —
 * a file the AI chokes on becomes a Failed item the user can still assign by
 * hand, rather than taking down the whole batch.
 */
async function analyzeItem(itemId: string, candidates: Awaited<ReturnType<typeof loadMatchCandidates>>, catalogue: Awaited<ReturnType<typeof loadTypeCatalogue>>) {
  const item = await prisma.documentImportItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  try {
    const localPath = getLocalFilePathFromUrl(item.file_url);
    if (!localPath) {
      await prisma.documentImportItem.update({
        where: { id: itemId },
        data: { status: ImportItemStatus.Failed, error_message: 'Uploaded file could not be found on the server' },
      });
      return;
    }

    const ocr = await analyzeDocumentWithAI(
      localPath,
      catalogue.map((t) => ({ code: t.code, name: t.name, ownerType: t.ownerType as string })),
    );

    // An unreadable file is a different problem from an unclassifiable one:
    // no amount of picking an owner/type makes a corrupt PDF usable, so say so
    // plainly instead of parking it in the "needs input" queue.
    if (ocr.extraction_error) {
      await prisma.documentImportItem.update({
        where: { id: itemId },
        data: { status: ImportItemStatus.Failed, error_message: ocr.extraction_error },
      });
      return;
    }

    const signals = {
      filename: item.original_filename,
      aiExtracted: { ...ocr, document_type_code: ocr.document_type_code },
      ocrRawText: ocr.raw_text || null,
    };

    const owner = matchOwner(signals, candidates);
    const finalOwnerType = owner.ownerType || item.proposed_owner_type;
    const finalOwnerId = owner.ownerId || item.proposed_owner_id;

    const typeMatch = matchDocumentType(signals, catalogue as any, finalOwnerType);
    const duplicate = await findDuplicate(finalOwnerType, finalOwnerId, typeMatch.documentTypeId);

    const isComplete = !!finalOwnerId && !!typeMatch.documentTypeId;
    const isOutOfScope = !typeMatch.documentTypeId && !finalOwnerId && !!ocr.detected_kind;

    const status = isComplete
      ? ImportItemStatus.Ready
      : isOutOfScope
        ? ImportItemStatus.Unrecognised
        : ImportItemStatus.NeedsInput;

    const reason = finalOwnerId
      ? (owner.ownerId ? owner.reason : 'Assigned from upload folder target')
      : isOutOfScope
        ? `Not one of your document types — appears to be: ${ocr.detected_kind}`
        : typeMatch.reason;

    await prisma.documentImportItem.update({
      where: { id: itemId },
      data: {
        status,
        detected_kind: ocr.detected_kind,
        proposed_owner_type: finalOwnerType,
        proposed_owner_id: finalOwnerId,
        proposed_document_type_id: typeMatch.documentTypeId,
        match_confidence: owner.ownerId ? owner.confidence : (finalOwnerId ? 'HIGH' : 'NONE'),
        match_reason: reason,
        document_number: ocr.document_number,
        issue_date: ocr.issue_date ? new Date(ocr.issue_date) : null,
        expiry_date: ocr.expiry_date ? new Date(ocr.expiry_date) : null,
        issuing_authority: ocr.issuing_authority,
        ai_extracted_json: ocr as any,
        ocr_raw_text: ocr.raw_text || null,
        duplicate_of_document_id: duplicate?.id || null,
      },
    });
  } catch (err: any) {
    await prisma.documentImportItem.update({
      where: { id: itemId },
      data: { status: ImportItemStatus.Failed, error_message: err?.message || 'Analysis failed' },
    });
  }
}

/**
 * Analyses a batch with limited concurrency. Runs detached from the request so
 * the browser gets its import id immediately and polls for results — a 50-file
 * batch takes minutes of Gemini round-trips and must not hold a socket open.
 */
async function analyzeBatch(itemIds: string[]) {
  const candidates = await loadMatchCandidates();
  const catalogue = await loadTypeCatalogue();

  const CONCURRENCY = 3; // keeps us well under Gemini's rate limit
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, itemIds.length) }, async () => {
    while (cursor < itemIds.length) {
      const idx = cursor++;
      await analyzeItem(itemIds[idx], candidates, catalogue);
    }
  });
  await Promise.all(workers);
}

/* ─── POST /documents/imports — stage uploaded files ───────────────────────── */
export const createImport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILES', message: 'No files were uploaded' } });
    }

    const ownerType = req.body.ownerType as string | undefined;
    const ownerId = req.body.ownerId as string | undefined;

    const created = await prisma.documentImport.create({
      data: {
        created_by: req.user?.id,
        items: {
          create: files.map((f) => ({
            original_filename: f.originalname,
            file_url: `/uploads/${f.filename}`,
            mime_type: f.mimetype,
            status: ImportItemStatus.Pending,
            proposed_owner_type: ownerType || null,
            proposed_owner_id: ownerId || null,
          })),
        },
      },
      include: { items: { select: { id: true } } },
    });

    res.status(201).json({ success: true, data: { id: created.id, itemCount: created.items.length } });
  } catch (error: any) {
    console.error('createImport failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to stage the upload' } });
  }
};

/* ─── POST /documents/imports/:id/analyze — trigger AI analysis on demand ──── */
export const triggerImportAnalysis = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const importId = req.params.id as string;
    const { itemIds } = req.body || {};

    const imp = await prisma.documentImport.findFirst({
      where: { id: importId, deletedAt: null },
      include: { items: { select: { id: true, status: true } } },
    });

    if (!imp) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import not found' } });
    }

    let targetItems = imp.items;
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      targetItems = targetItems.filter((i) => itemIds.includes(i.id));
    } else {
      targetItems = targetItems.filter((i) => i.status !== ImportItemStatus.Confirmed && i.status !== ImportItemStatus.Skipped);
    }

    if (targetItems.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_ITEMS', message: 'No items available to analyze' } });
    }

    const targetIds = targetItems.map((i) => i.id);

    await prisma.documentImportItem.updateMany({
      where: { id: { in: targetIds } },
      data: { status: ImportItemStatus.Analyzing },
    });

    void analyzeBatch(targetIds).catch((err) =>
      console.error('[import] on-demand batch analysis failed', err),
    );

    res.json({ success: true, data: { importId, count: targetIds.length, message: `Started AI analysis for ${targetIds.length} file(s)` } });
  } catch (error: any) {
    console.error('triggerImportAnalysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to trigger AI analysis' } });
  }
};

/* ─── GET /documents/imports/:id — poll progress + proposals ───────────────── */
export const getImport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const imp = await prisma.documentImport.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: { proposedDocumentType: { select: { id: true, name: true, code: true, ownerType: true, allowsMultipleFiles: true } } },
        },
      },
    });
    if (!imp) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import not found' } });
    }

    // Resolve owner display names in bulk so the review table can show
    // "Truck 102" rather than a UUID.
    const vehicleIds = imp.items.filter((i) => i.proposed_owner_type === 'Vehicle' && i.proposed_owner_id).map((i) => i.proposed_owner_id!);
    const driverIds = imp.items.filter((i) => i.proposed_owner_type === 'Driver' && i.proposed_owner_id).map((i) => i.proposed_owner_id!);
    const [vehicles, drivers, duplicates] = await Promise.all([
      vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate_number: true, ref_id: true } }) : [],
      driverIds.length ? prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, first_name: true, last_name: true, ref_id: true } }) : [],
      prisma.document.findMany({
        where: { id: { in: imp.items.map((i) => i.duplicate_of_document_id).filter(Boolean) as string[] } },
        select: { id: true, expiry_date: true },
      }),
    ]);
    const vMap = new Map(vehicles.map((v) => [v.id, v.plate_number || v.ref_id || 'Vehicle']));
    const dMap = new Map(drivers.map((d) => [d.id, `${d.first_name} ${d.last_name}`.trim()]));
    const dupMap = new Map(duplicates.map((d) => [d.id, d.expiry_date]));

    const items = imp.items.map((i) => ({
      id: i.id,
      filename: i.original_filename,
      file_url: i.file_url,
      mime_type: i.mime_type,
      status: i.status,
      ownerType: i.proposed_owner_type,
      ownerId: i.proposed_owner_id,
      ownerName: i.proposed_owner_id
        ? (i.proposed_owner_type === 'Vehicle' ? vMap.get(i.proposed_owner_id) : dMap.get(i.proposed_owner_id)) || null
        : null,
      documentType: i.proposedDocumentType,
      confidence: i.match_confidence,
      reason: i.match_reason,
      detectedKind: i.detected_kind,
      document_number: i.document_number,
      issue_date: i.issue_date,
      expiry_date: i.expiry_date,
      issuing_authority: i.issuing_authority,
      duplicateOfDocumentId: i.duplicate_of_document_id,
      duplicateExpiry: i.duplicate_of_document_id ? dupMap.get(i.duplicate_of_document_id) ?? null : null,
      error: i.error_message,
      createdDocumentId: i.createdDocumentId,
    }));

    const analyzing = items.filter((i) => i.status === 'Analyzing').length;
    res.json({
      success: true,
      data: {
        id: imp.id,
        items,
        analyzing,
        isComplete: analyzing === 0,
        counts: {
          total: items.length,
          ready: items.filter((i) => i.status === 'Ready').length,
          needsInput: items.filter((i) => i.status === 'NeedsInput').length,
          unrecognised: items.filter((i) => i.status === 'Unrecognised').length,
          failed: items.filter((i) => i.status === 'Failed').length,
          confirmed: items.filter((i) => i.status === 'Confirmed').length,
          duplicates: items.filter((i) => i.duplicateOfDocumentId).length,
        },
      },
    });
  } catch (error: any) {
    console.error('getImport failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load the import' } });
  }
};

/* ─── PATCH /documents/imports/:id/items/:itemId — user corrects a row ─────── */
export const updateImportItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ownerType, ownerId, documentTypeId, issue_date, expiry_date, document_number, status } = req.body || {};

    const existing = await prisma.documentImportItem.findFirst({
      where: { id: req.params.itemId as string, importId: req.params.id as string },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import item not found' } });
    }

    const nextOwnerType = ownerType !== undefined ? ownerType : existing.proposed_owner_type;
    const nextOwnerId = ownerId !== undefined ? ownerId : existing.proposed_owner_id;
    const nextTypeId = documentTypeId !== undefined ? documentTypeId : existing.proposed_document_type_id;

    // A hand-picked owner/type changes what counts as a duplicate, so re-check.
    const duplicate = await findDuplicate(nextOwnerType, nextOwnerId, nextTypeId);
    const isComplete = !!nextOwnerId && !!nextTypeId;

    const updated = await prisma.documentImportItem.update({
      where: { id: existing.id },
      data: {
        proposed_owner_type: nextOwnerType,
        proposed_owner_id: nextOwnerId,
        proposed_document_type_id: nextTypeId,
        issue_date: issue_date !== undefined ? (issue_date ? new Date(issue_date) : null) : existing.issue_date,
        expiry_date: expiry_date !== undefined ? (expiry_date ? new Date(expiry_date) : null) : existing.expiry_date,
        document_number: document_number !== undefined ? document_number : existing.document_number,
        duplicate_of_document_id: duplicate?.id || null,
        // An edited row is the user's own answer — mark it Ready even if the
        // matcher had no opinion, but honour an explicit Skip.
        status: status === 'Skipped'
          ? ImportItemStatus.Skipped
          : existing.status === ImportItemStatus.Confirmed
            ? existing.status
            : isComplete ? ImportItemStatus.Ready : ImportItemStatus.NeedsInput,
        match_reason: ownerId !== undefined || documentTypeId !== undefined ? 'Set manually' : existing.match_reason,
        match_confidence: ownerId !== undefined ? 'HIGH' : existing.match_confidence,
      },
    });

    res.json({ success: true, data: { id: updated.id, status: updated.status, duplicateOfDocumentId: updated.duplicate_of_document_id } });
  } catch (error: any) {
    console.error('updateImportItem failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update the item' } });
  }
};

/* ─── POST /documents/imports/:id/confirm — write real Documents ───────────── */
export const confirmImport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { itemIds, duplicateActions } = req.body as {
      itemIds?: string[];
      /** itemId -> what to do when this row collides with an existing document. */
      duplicateActions?: Record<string, 'replace' | 'addFile' | 'skip'>;
    };

    const items = await prisma.documentImportItem.findMany({
      where: {
        importId: req.params.id as string,
        ...(itemIds && itemIds.length > 0 ? { id: { in: itemIds } } : {}),
        status: { in: [ImportItemStatus.Ready, ImportItemStatus.NeedsInput, ImportItemStatus.Unrecognised] },
      },
      include: { proposedDocumentType: true },
    });

    const results = { created: 0, replaced: 0, filesAdded: 0, skipped: 0, blocked: [] as Array<{ id: string; reason: string }> };

    for (const item of items) {
      // Never write a half-identified document — that is the exact state this
      // whole pipeline exists to keep out of the vault.
      if (!item.proposed_owner_id || !item.proposed_owner_type) {
        results.blocked.push({ id: item.id, reason: 'Missing Owner' });
        continue;
      }
      if (!item.proposed_document_type_id) {
        results.blocked.push({ id: item.id, reason: 'Missing Document Type' });
        continue;
      }

      const action = duplicateActions?.[item.id];
      if (action === 'skip') {
        await prisma.documentImportItem.update({ where: { id: item.id }, data: { status: ImportItemStatus.Skipped } });
        results.skipped++;
        continue;
      }

      if (item.duplicate_of_document_id && action === 'addFile') {
        await prisma.documentFile.create({
          data: {
            documentId: item.duplicate_of_document_id,
            file_url: item.file_url,
            mime_type: item.mime_type,
            label: item.original_filename,
            created_by: req.user?.id,
          },
        });
        await prisma.documentImportItem.update({
          where: { id: item.id },
          data: { status: ImportItemStatus.Confirmed, createdDocumentId: item.duplicate_of_document_id },
        });
        results.filesAdded++;
        continue;
      }

      if (item.duplicate_of_document_id && action === 'replace') {
        await prisma.document.update({
          where: { id: item.duplicate_of_document_id },
          data: { deletedAt: new Date(), isActive: false, deleted_by: req.user?.id },
        });
        results.replaced++;
      }

      // doc_type is legacy-required; derive something sane from the configured
      // type's owner rather than asking the user about a column we are retiring.
      const legacyDocType: DocType = item.proposedDocumentType?.ownerType === 'Driver'
        ? DocType.DriverLicense
        : DocType.VehicleRegistration;

      const doc = await prisma.document.create({
        data: {
          entity_type: item.proposed_owner_type,
          entity_id: item.proposed_owner_id,
          documentTypeId: item.proposed_document_type_id,
          doc_type: legacyDocType,
          file_url: item.file_url,
          mime_type: item.mime_type,
          issue_date: item.issue_date,
          expiry_date: item.expiry_date,
          ai_extracted_json: item.ai_extracted_json as any,
          ocr_raw_text: item.ocr_raw_text,
          created_by: req.user?.id,
          files: {
            create: {
              file_url: item.file_url,
              mime_type: item.mime_type,
              label: item.original_filename,
              created_by: req.user?.id,
            },
          },
        },
      });

      await prisma.documentImportItem.update({
        where: { id: item.id },
        data: { status: ImportItemStatus.Confirmed, createdDocumentId: doc.id },
      });
      results.created++;
    }

    // Close the batch once nothing is left awaiting a decision.
    const remaining = await prisma.documentImportItem.count({
      where: { importId: req.params.id as string, status: { in: [ImportItemStatus.Analyzing, ImportItemStatus.Ready, ImportItemStatus.NeedsInput, ImportItemStatus.Unrecognised] } },
    });
    if (remaining === 0) {
      await prisma.documentImport.update({ where: { id: req.params.id as string }, data: { isActive: false } });
    }

    res.json({ success: true, data: { ...results, remaining } });
  } catch (error: any) {
    console.error('confirmImport failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to confirm the import' } });
  }
};

/* ─── GET /documents/imports — unfinished batches ──────────────────────────── */
export const listImports = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const imports = await prisma.documentImport.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { items: { select: { status: true } } },
    });

    res.json({
      success: true,
      data: imports.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        total: i.items.length,
        pending: i.items.filter((it) => ['Analyzing', 'Ready', 'NeedsInput', 'Unrecognised'].includes(it.status)).length,
      })),
    });
  } catch (error: any) {
    console.error('listImports failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to list imports' } });
  }
};

/* ─── DELETE /documents/imports/:id — discard a staged batch ───────────────── */
export const discardImport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.documentImport.update({
      where: { id: req.params.id as string },
      data: { deletedAt: new Date(), isActive: false },
    });
    res.json({ success: true, data: { discarded: true } });
  } catch (error: any) {
    console.error('discardImport failed:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to discard the import' } });
  }
};
