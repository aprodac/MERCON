/**
 * Background read of a trip-log screenshot (shared-types tripLogRead): the stop
 * name and arrive / depart times the customer's app shows. Runs after the
 * driver's upload has already answered, and a failure just leaves no
 * suggestion — the office makes the stop by hand as before.
 */
import fs from 'fs';
import { Prisma } from '@prisma/client';
import { parseTripLogRead, resolveReadTimes } from '@mercon/shared-types';
import { prisma } from '../db';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { generateWithGemini, getLocalFilePathFromUrl } from './ocrService';
import { deploymentTimezone } from './sameDayTrips';

export const TRIP_LOG_READ_PROMPT = `This is a screenshot from a delivery company's driver app (iMile, JD, Shipa or similar), sent by a truck driver. It may show a trip with stops and the time the truck arrived at and left each stop.
Read it and reply with ONLY this JSON:
{"stops":[{"name":string,"arrive":"HH:MM:SS"|null,"depart":"HH:MM:SS"|null,"date":"YYYY-MM-DD"|null}],"app":"iMile"|"JD"|"Shipa"|"other","confidence":number}
Rules: "name" is the stop / hub / warehouse / city exactly as the screen writes it (English if both languages show). Times are 24-hour clock exactly as shown, to the second if shown; null when the screen does not show that time. "date" only if a date is visible. List every stop that has a name or a time, in screen order. Never guess a time that is not on the screen. "confidence" is 0 to 1: how sure you are the times are copied right. If the screen is not a trip or stop screen, return {"stops":[],"app":"other","confidence":0}.`;

const queued = new Set<string>();

export function queueTripLogRead(documentId: string): void {
  if (queued.has(documentId) || !env.GEMINI_API_KEY) return;
  queued.add(documentId);
  void readTripLogDocument(documentId)
    .catch((err) => logger.warn({ err: err?.message, documentId }, 'trip log read failed'))
    .finally(() => queued.delete(documentId));
}

export async function readTripLogDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, file_url: true, mime_type: true, createdAt: true, ai_extracted_json: true },
  });
  if (!doc || !doc.mime_type?.startsWith('image/')) return;
  const file = getLocalFilePathFromUrl(doc.file_url);
  if (!file) return;

  const meta = (doc.ai_extracted_json ?? {}) as { gps?: { captured_at?: unknown } };
  const capturedAt = typeof meta.gps?.captured_at === 'string' && !Number.isNaN(Date.parse(meta.gps.captured_at)) ? meta.gps.captured_at : null;
  const sentIso = new Date(capturedAt ?? doc.createdAt).toISOString();

  const { text, usage } = await generateWithGemini(env.GEMINI_API_KEY as string, {
    contents: [{ parts: [{ text: TRIP_LOG_READ_PROMPT }, { inline_data: { mime_type: doc.mime_type, data: fs.readFileSync(file).toString('base64') } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
  const parsed = parseTripLogRead(text);
  if (!parsed) return;
  const read = resolveReadTimes(parsed, sentIso, await deploymentTimezone());

  // Merge into whatever the document holds now (the office may have moved it to a stop meanwhile).
  const fresh = await prisma.document.findUnique({ where: { id: doc.id }, select: { ai_extracted_json: true } });
  await prisma.document.update({
    where: { id: doc.id },
    data: { ai_extracted_json: { ...((fresh?.ai_extracted_json ?? {}) as object), read: { ...read, model: usage.model, tokens: { in: usage.promptTokens, out: usage.outputTokens } } } as unknown as Prisma.InputJsonValue },
  });
}
