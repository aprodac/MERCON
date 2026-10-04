/**
 * Private documents behind signed links (services/fileLinks.ts, middlewares/fileLinks.ts).
 * Prisma is stubbed; the last tests run a real Express app with express.static
 * over a temp folder, the way index.ts mounts /uploads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import { prisma } from '../db';
import {
  checkSignedLink,
  clearPrivateFileCache,
  fileSignature,
  linkExpiry,
  privateFileNames,
  signUploadUrl,
  stringifyWithSignedLinks,
  unsignInPlace,
  unsignUploadUrl,
  uploadNamesIn,
} from '../services/fileLinks';
import { apiFileLinks, uploadsGuard } from '../middlewares/fileLinks';

const PASSPORT = 'files-1787659967483-325494989.jpg'; // a Driver document
const POD = 'files-1790000000000-111111111.png'; // a Trip photo (public)
const NOW = Date.UTC(2026, 9, 4, 8, 20, 0); // 13:50 IST

/** Stub the three tables the private-file lookup reads; returns a call counter. */
function stubPrivate(t: any, privateUrls: string[]) {
  const orig = { d: prisma.document.findMany, f: prisma.documentFile.findMany, i: prisma.documentImportItem.findMany };
  let calls = 0;
  const match = (args: any) =>
    privateUrls.filter((u) => args.where.OR.some((o: any) => u.endsWith(o.file_url.endsWith))).map((file_url) => ({ file_url }));
  prisma.document.findMany = (async (args: any) => {
    calls += 1;
    assert.deepEqual(args.where.entity_type, { notIn: ['Trip'] }, 'trip documents stay public');
    return match(args);
  }) as any;
  prisma.documentFile.findMany = (async () => []) as any;
  prisma.documentImportItem.findMany = (async () => []) as any;
  t.after(() => {
    prisma.document.findMany = orig.d;
    prisma.documentFile.findMany = orig.f;
    prisma.documentImportItem.findMany = orig.i;
    clearPrivateFileCache();
  });
  clearPrivateFileCache();
  return () => calls;
}

test('signed links keep the file name last and live 1–2 hours', () => {
  const signed = signUploadUrl(`/uploads/${PASSPORT}`, NOW);
  const exp = linkExpiry(NOW);
  assert.equal(signed, `/uploads/s/${exp}/${fileSignature(PASSPORT, exp)}/${PASSPORT}`);
  assert.ok(signed.endsWith('.jpg'), 'extension checks still work');
  assert.ok(exp * 1000 - NOW > 3600_000 && exp * 1000 - NOW <= 7200_000);
  // Stable within the hour (browser cache), new after it.
  assert.equal(signUploadUrl(`/uploads/${PASSPORT}`, NOW + 30 * 60_000), signed);
  assert.notEqual(signUploadUrl(`/uploads/${PASSPORT}`, NOW + 60 * 60_000), signed);
});

test('origins are kept; non-upload strings are left alone', () => {
  assert.match(signUploadUrl(`https://dev.mercon.tech/uploads/${PASSPORT}`, NOW), /^https:\/\/dev\.mercon\.tech\/uploads\/s\/\d+\/[\w-]+\/files-/);
  assert.equal(signUploadUrl('https://example.com/a.jpg', NOW), 'https://example.com/a.jpg');
  assert.equal(signUploadUrl(`see /uploads/${PASSPORT}`, NOW), `see /uploads/${PASSPORT}`);
  assert.equal(unsignUploadUrl(signUploadUrl(`https://dev.mercon.tech/uploads/${PASSPORT}`, NOW)), `https://dev.mercon.tech/uploads/${PASSPORT}`);
});

test('signature check: valid, expired, tampered, other file', () => {
  const exp = linkExpiry(NOW);
  const sig = fileSignature(PASSPORT, exp);
  assert.equal(checkSignedLink(String(exp), sig, PASSPORT, NOW), 'ok');
  assert.equal(checkSignedLink(String(exp), sig, PASSPORT, exp * 1000 + 1), 'expired');
  assert.equal(checkSignedLink(String(exp + 3600), sig, PASSPORT, NOW), 'invalid', 'cannot extend the expiry');
  assert.equal(checkSignedLink(String(exp), sig, POD, NOW), 'invalid', 'cannot reuse for another file');
  assert.equal(checkSignedLink(String(exp), sig.replace(/^./, sig[0] === 'A' ? 'B' : 'A'), PASSPORT, NOW), 'invalid');
});

test('private files = non-Trip documents; answers are cached', async (t) => {
  const calls = stubPrivate(t, [`/uploads/${PASSPORT}`]);
  const set = await privateFileNames([PASSPORT, POD], NOW);
  assert.deepEqual([...set], [PASSPORT]);
  await privateFileNames([PASSPORT, POD], NOW + 60_000);
  assert.equal(calls(), 1, 'second lookup within 5 minutes comes from the cache');
  await privateFileNames([PASSPORT], NOW + 6 * 60_000);
  assert.equal(calls(), 2, 'cache expires after 5 minutes');
});

test('response JSON: only private links are signed; request bodies are unsigned', () => {
  const body = { data: { documents: [{ file_url: `/uploads/${PASSPORT}` }], pod: `/uploads/${POD}`, note: 'x' } };
  assert.deepEqual([...uploadNamesIn(body)].sort(), [PASSPORT, POD].sort());
  const out = JSON.parse(stringifyWithSignedLinks(body, new Set([PASSPORT]), NOW));
  assert.match(out.data.documents[0].file_url, /^\/uploads\/s\//);
  assert.equal(out.data.pod, `/uploads/${POD}`);

  const edited = { file_url: out.data.documents[0].file_url, pages: [{ url: out.data.documents[0].file_url }] };
  unsignInPlace(edited);
  assert.deepEqual(edited, { file_url: `/uploads/${PASSPORT}`, pages: [{ url: `/uploads/${PASSPORT}` }] });
});

/* ── End to end with Express + express.static ─────────────────────────────── */

async function startServer(t: any, user: object | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mercon-uploads-'));
  fs.writeFileSync(path.join(dir, PASSPORT), 'PASSPORT-BYTES');
  fs.writeFileSync(path.join(dir, POD), 'POD-BYTES');

  const app = express();
  app.use(express.json());
  app.use('/uploads', uploadsGuard);
  app.use('/uploads', express.static(dir));
  const api = express.Router();
  api.use(apiFileLinks);
  api.use((req, _res, next) => { if (user) (req as any).user = user; next(); });
  api.get('/documents', (_req, res) => res.json({ success: true, data: [{ file_url: `/uploads/${PASSPORT}` }, { file_url: `/uploads/${POD}` }] }));
  // Plain text, so the answer shows exactly what the route received (JSON answers get signed).
  api.post('/echo', (req, res) => res.type('text').send(req.body.file_url));
  app.use('/api', api);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('end to end: plain link to a passport is refused; the signed link from the API opens it', async (t) => {
  stubPrivate(t, [`/uploads/${PASSPORT}`]);
  const base = await startServer(t, { id: 'u1', role: 'Operator' });

  const plain = await fetch(`${base}/uploads/${PASSPORT}`);
  assert.equal(plain.status, 403);
  assert.match(await plain.text(), /not valid or has expired/);

  const pod = await fetch(`${base}/uploads/${POD}`);
  assert.equal(pod.status, 200, 'trip photos stay public (tracking pages)');
  assert.equal(await pod.text(), 'POD-BYTES');

  const list = await (await fetch(`${base}/api/documents`)).json() as any;
  const signed = list.data[0].file_url;
  assert.match(signed, /^\/uploads\/s\/\d+\/[\w-]+\/files-1787659967483-325494989\.jpg$/);
  assert.equal(list.data[1].file_url, `/uploads/${POD}`);

  const opened = await fetch(`${base}${signed}`);
  assert.equal(opened.status, 200);
  assert.equal(await opened.text(), 'PASSPORT-BYTES');

  const forged = await fetch(`${base}${signed.replace(/\/s\/(\d+)\//, (_m: string, e: string) => `/s/${Number(e) + 3600}/`)}`);
  assert.equal(forged.status, 403, 'changing the expiry breaks the signature');

  const received = await (await fetch(`${base}/api/echo`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_url: signed }),
  })).text();
  assert.equal(received, `/uploads/${PASSPORT}`, 'a signed link sent back reaches the route in its plain form');
});

test('end to end: not signed in -> no signed links handed out', async (t) => {
  stubPrivate(t, [`/uploads/${PASSPORT}`]);
  const base = await startServer(t, null);
  const list = await (await fetch(`${base}/api/documents`)).json() as any;
  assert.equal(list.data[0].file_url, `/uploads/${PASSPORT}`);
});

test('end to end: lookup failure refuses the plain link (fails closed)', async (t) => {
  const orig = prisma.document.findMany;
  prisma.document.findMany = (async () => { throw new Error('db down'); }) as any;
  t.after(() => { prisma.document.findMany = orig; clearPrivateFileCache(); });
  clearPrivateFileCache();
  const base = await startServer(t, null);
  assert.equal((await fetch(`${base}/uploads/${PASSPORT}`)).status, 403);
});
