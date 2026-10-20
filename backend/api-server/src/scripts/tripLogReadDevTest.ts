/**
 * Dev-only end-to-end test of reading trip-log screenshots (services/tripLogRead).
 *
 * Creates clearly labelled TEST records (customer "TEST Trip-log Co", driver
 * "TEST Driver", vehicle TEST-0001, trip TEST-TL-<date>), sends five mock
 * customer-app screenshots as trip-log entries through the same controller the
 * driver app uploads to, waits for the Gemini read, prints read vs expected,
 * then confirms the suggestions through the same controller the operator app's
 * Confirm button calls. The TEST trip is left in place.
 *
 *   node dist/scripts/tripLogReadDevTest.js            run the test
 *   node dist/scripts/tripLogReadDevTest.js --cleanup  soft-delete the TEST records
 *
 * Refuses to run unless the database is mercon_dev_db.
 */
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { AssetType, DriverWorkflow, StopType, TripStatus } from '@prisma/client';
import { placeSimilarity, suggestForEntry, tripLogEntries, zonedWallTimeToUtcIso, type TripLogSuggestion } from '@mercon/shared-types';
import { prisma } from '../db';
import { deploymentTimezone } from '../services/sameDayTrips';
import { getUploadDir } from '../middlewares/upload';
import { startTripLog, uploadTripPhoto } from '../controllers/mobileTripController';
import { logEntryToStop } from '../controllers/tripLogController';

const DEV_DB = 'mercon_dev_db';
const CUSTOMER_NAME = 'TEST Trip-log Co';
const DRIVER_PHONE = '+966500000072';
const PLATE = 'TEST-0001';
const WEB_BASE = 'https://dev.mercon.tech';
// Gemini flash list prices (USD per million tokens) and a fixed rate: an estimate, not a bill.
const USD_PER_M_IN = 0.3;
const USD_PER_M_OUT = 2.5;
const INR_PER_USD = 88;

interface Expected {
  app: string; name: string; arrive: string | null; depart: string | null;
  stop: string | null; type: 'Pickup' | 'Dropoff' | null; suggest: boolean; send: string; gps: [number, number]; note?: string;
}

const dbName = (): string => {
  try { return new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, ''); } catch { return ''; }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs an express handler without a server. */
async function call(handler: (req: Request, res: Response) => Promise<unknown>, req: Record<string, unknown>) {
  const out: { status: number; body: any } = { status: 200, body: null };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  const headers: Record<string, string> = { host: 'dev.mercon.tech', 'x-forwarded-proto': 'https' };
  await handler({ protocol: 'https', get: (h: string) => headers[h.toLowerCase()], headers, params: {}, body: {}, ...req } as unknown as Request, res as unknown as Response);
  return out;
}

async function cleanup() {
  const now = new Date();
  const trips = await prisma.trip.findMany({ where: { ref_id: { startsWith: 'TEST-TL-' }, deletedAt: null }, select: { id: true, ref_id: true } });
  const ids = trips.map((t) => t.id);
  const docs = await prisma.document.updateMany({ where: { entity_type: 'Trip', entity_id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
  const stops = await prisma.tripStop.updateMany({ where: { tripId: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
  await prisma.trip.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, isActive: false } });
  await prisma.customer.updateMany({ where: { name: CUSTOMER_NAME, deletedAt: null }, data: { deletedAt: now, isActive: false } });
  await prisma.driver.updateMany({ where: { phone_primary: DRIVER_PHONE, deletedAt: null }, data: { deletedAt: now, isActive: false, status: 'Available' } });
  await prisma.vehicle.updateMany({ where: { plate_number: PLATE, deletedAt: null }, data: { deletedAt: now, isActive: false, status: 'Available' } });
  console.log(`Soft-deleted ${trips.length} TEST trip(s) [${trips.map((t) => t.ref_id).join(', ')}], ${stops.count} stops, ${docs.count} documents, and the TEST customer/driver/vehicle.`);
}

async function main() {
  const db = dbName();
  if (db !== DEV_DB) {
    console.error(`Refusing to run: database is "${db || 'unknown'}", this script only runs on ${DEV_DB}.`);
    process.exit(2);
  }
  if (process.argv.includes('--cleanup')) return cleanup();
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in this container: the read cannot run.');
    process.exit(3);
  }

  const fixtures = [process.env.FIXTURES_DIR, path.resolve(__dirname, '../../test-fixtures/trip-log-read'), path.resolve(process.cwd(), 'test-fixtures/trip-log-read')]
    .filter((p): p is string => !!p).find((p) => fs.existsSync(path.join(p, 'expected.json')));
  if (!fixtures) throw new Error('Fixtures not found (test-fixtures/trip-log-read)');
  const expected = JSON.parse(fs.readFileSync(path.join(fixtures, 'expected.json'), 'utf8')) as Record<string, Expected>;
  const files = Object.keys(expected).sort();

  const tz = await deploymentTimezone();
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: tz });
  const stamp = yesterday.replace(/-/g, '');
  const at = (hhmm: string) => zonedWallTimeToUtcIso(yesterday, hhmm, tz);

  // ---- TEST records -------------------------------------------------------
  const customer = (await prisma.customer.findFirst({ where: { name: CUSTOMER_NAME, deletedAt: null } }))
    ?? await prisma.customer.create({ data: { name: CUSTOMER_NAME, contact_phone: '+966500000000', driver_workflow: DriverWorkflow.EXTERNAL_APP } });
  const driver = (await prisma.driver.findFirst({ where: { phone_primary: DRIVER_PHONE, deletedAt: null } }))
    ?? await prisma.driver.create({ data: { first_name: 'TEST', last_name: 'Driver', phone_primary: DRIVER_PHONE, license_number: 'TEST-LICENSE-72', license_expiry: new Date(Date.now() + 365 * 86_400_000) } });
  const vehicle = (await prisma.vehicle.findFirst({ where: { plate_number: PLATE, deletedAt: null } }))
    ?? await prisma.vehicle.create({ data: { plate_number: PLATE, asset_type: AssetType.Box, capacity_kg: 10000 } });
  let ref = `TEST-TL-${stamp}`;
  for (let n = 2; await prisma.trip.findUnique({ where: { ref_id: ref }, select: { id: true } }); n += 1) ref = `TEST-TL-${stamp}-${n}`;

  const route = [
    { name: 'Riyadh', type: StopType.Pickup, lat: 24.7136, lng: 46.6753, planned: '06:00' },
    { name: 'Taif', type: StopType.Dropoff, lat: 21.2703, lng: 40.4158, planned: '12:00' },
    { name: 'Jeddah', type: StopType.Dropoff, lat: 21.5433, lng: 39.1728, planned: '18:00' },
  ];
  const trip = await prisma.trip.create({
    data: {
      ref_id: ref, customerId: customer.id, driverId: driver.id, vehicleId: vehicle.id,
      status: TripStatus.Scheduled, driver_workflow: DriverWorkflow.EXTERNAL_APP, driver_workflow_state: 'ASSIGNED',
      planned_start: new Date(at('06:00')), planned_end: new Date(at('18:30')),
      stops: {
        create: route.map((s, i) => ({
          stop_sequence: i + 1, leg_index: 0, stop_type: s.type, location_name: s.name, location_lat: s.lat, location_lng: s.lng,
          planned_arrival: new Date(at(s.planned)),
        })),
      },
    },
  });
  console.log(`Created TEST trip ${ref} (${trip.id}); route Riyadh → Taif → Jeddah; send date ${yesterday} (${tz}).`);

  const driverReq = { user: { id: 'test-driver-user', driver_id: driver.id } };
  const started = await call(startTripLog, { ...driverReq, params: { id: trip.id } });
  if (!started.body?.success) throw new Error(`startTripLog failed: ${JSON.stringify(started.body)}`);
  console.log('Trip started in trip-log mode.');

  // ---- Sends --------------------------------------------------------------
  const uploads = getUploadDir();
  const docIds: Record<string, string> = {};
  const entryIds: Record<string, string> = {};
  for (const [i, f] of files.entries()) {
    const e = expected[f];
    const filename = `files-testtl-${Date.now()}-${i}.png`;
    fs.copyFileSync(path.join(fixtures, f), path.join(uploads, filename));
    const entry = `testtl-${stamp}-${i + 1}`;
    const up = await call(uploadTripPhoto, {
      ...driverReq,
      params: { id: trip.id },
      file: { path: path.join(uploads, filename), filename, originalname: f, mimetype: 'image/png' },
      body: { kind: 'cargo', operation: 'log', log_entry: entry, location_lat: String(e.gps[0]), location_lng: String(e.gps[1]), captured_at: at(e.send) },
    });
    if (up.status !== 201) throw new Error(`upload ${f} failed: ${JSON.stringify(up.body)}`);
    docIds[f] = up.body.data.id;
    entryIds[f] = entry;
  }
  console.log(`Sent ${files.length} screenshots; waiting for the read…`);

  const deadline = Date.now() + 120_000;
  const pending = new Set(files);
  while (pending.size && Date.now() < deadline) {
    await sleep(3000);
    for (const f of [...pending]) {
      const d = await prisma.document.findUnique({ where: { id: docIds[f] }, select: { ai_extracted_json: true } });
      if ((d?.ai_extracted_json as any)?.read) pending.delete(f);
      // A screen the model sees no stop on may legitimately save no read; give it a shorter wait.
      else if (!expected[f].suggest && Date.now() > deadline - 75_000) pending.delete(f);
    }
  }

  // ---- Compare ------------------------------------------------------------
  const loadTrip = async () => {
    const t = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      select: { stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' }, select: { id: true, stop_type: true, location_name: true, actual_arrival: true, actual_departure: true } } },
    });
    const docs = await prisma.document.findMany({ where: { entity_type: 'Trip', entity_id: trip.id, deletedAt: null }, select: { id: true, file_url: true, createdAt: true, ai_extracted_json: true } });
    return { stops: t.stops, entries: tripLogEntries(docs) };
  };
  const suggestAll = (stops: Awaited<ReturnType<typeof loadTrip>>['stops'], entries: Awaited<ReturnType<typeof loadTrip>>['entries']) => {
    const sug = new Map<string, TripLogSuggestion>();
    const taken = new Set(entries.map((e) => e.stop_id).filter((x): x is string => !!x));
    const sstops = stops.map((s) => ({ id: s.id, stop_type: s.stop_type, location_name: s.location_name, actual_arrival: s.actual_arrival?.toISOString() ?? null }));
    let openIndex = 0;
    for (const e of entries) {
      if (e.stop_id) continue;
      const sg = suggestForEntry(e, sstops, { taken, openIndex });
      openIndex += 1;
      if (!sg) continue;
      if (sg.stop_id) taken.add(sg.stop_id);
      sug.set(e.id, sg);
    }
    return sug;
  };
  const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour12: false }) : null);
  const norm = (t: string | null) => (t && t.length === 5 ? `${t}:00` : t);

  const { stops, entries } = await loadTrip();
  const suggestions = suggestAll(stops, entries);
  let right = 0;
  let inTok = 0;
  let outTok = 0;
  console.log('\n=== READ vs EXPECTED ===');
  for (const f of files) {
    const e = expected[f];
    const d = await prisma.document.findUnique({ where: { id: docIds[f] }, select: { ai_extracted_json: true } });
    const read = (d?.ai_extracted_json as any)?.read as { stops: { name: string; arrive: string | null; depart: string | null; arrive_at?: string; depart_at?: string }[]; app: string; confidence: number; tokens?: { in: number; out: number } } | undefined;
    const line = read?.stops.find((s) => s.arrive || s.depart) ?? read?.stops[0];
    const sg = suggestions.get(entryIds[f]);
    const checks: string[] = [];
    let ok = true;
    const check = (label: string, pass: boolean, detail: string) => { checks.push(`${pass ? '✅' : '❌'} ${label}: ${detail}`); ok &&= pass; };
    if (e.suggest) {
      check('name', !!line && placeSimilarity(line.name, e.name) >= 0.5, `read "${line?.name ?? '—'}" / expected "${e.name}"`);
      check('arrive', norm(line?.arrive ?? null) === norm(e.arrive), `read ${line?.arrive ?? 'null'} / expected ${e.arrive ?? 'null'}`);
      check('depart', norm(line?.depart ?? null) === norm(e.depart), `read ${line?.depart ?? 'null'} / expected ${e.depart ?? 'null'}`);
      check('suggestion', !!sg, sg ? 'present' : 'missing');
      // Stop + type are only judged for the sends that are the first claim on their stop.
      if (sg && !/resend/.test(e.note ?? '')) {
        check('stop', sg.action === 'attach' && placeSimilarity(sg.name, e.stop ?? '') >= 0.5, `${sg.action} ${sg.name} / expected ${e.stop}`);
        check('LOAD/UNLOAD', sg.stop_type === e.type, `${sg.stop_type === 'Pickup' ? 'LOAD' : 'UNLOAD'} / expected ${e.type === 'Pickup' ? 'LOAD' : 'UNLOAD'}`);
      }
    } else {
      check('no suggestion', !sg, sg ? `unexpected suggestion ${sg.name} ${sg.arrive_at ?? ''}` : 'none, as expected');
    }
    if (ok) right += 1;
    const tin = read?.tokens?.in ?? 0;
    const tout = read?.tokens?.out ?? 0;
    inTok += tin; outTok += tout;
    const inr = ((tin * USD_PER_M_IN + tout * USD_PER_M_OUT) / 1e6) * INR_PER_USD;
    console.log(`\n${ok ? '✅' : '❌'} ${f}${e.note ? `  (${e.note})` : ''}`);
    console.log(`   read: ${read ? `${read.app} · confidence ${read.confidence} · ${read.stops.length} stop line(s)` : 'NO READ SAVED'}`);
    checks.forEach((c) => console.log(`   ${c}`));
    if (sg) console.log(`   Suggested: ${sg.name} · ${sg.stop_type === 'Pickup' ? 'LOAD' : 'UNLOAD'} · Arrived ${clock(sg.arrive_at) ?? '—'} · Left ${clock(sg.depart_at) ?? '—'}${sg.needs_check ? ' (needs check)' : ''}`);
    console.log(`   tokens in ${tin} out ${tout} · ≈ ₹${inr.toFixed(3)}`);
  }
  const tripInr = ((inTok * USD_PER_M_IN + outTok * USD_PER_M_OUT) / 1e6) * INR_PER_USD;
  console.log(`\nACCURACY: ${right}/${files.length}`);
  console.log(`COST (estimate, Gemini flash list price, $1=₹${INR_PER_USD}): ₹${(tripInr / files.length).toFixed(3)} per screenshot, ₹${tripInr.toFixed(3)} for this trip (${inTok} in / ${outTok} out tokens)`);

  // ---- Confirm (what the operator app's Confirm button calls) ---------------
  console.log('\n=== CONFIRM ===');
  for (const f of files) {
    const e = expected[f];
    if (!e.suggest || /resend/.test(e.note ?? '')) continue;
    const fresh = await loadTrip();
    const sg = suggestAll(fresh.stops, fresh.entries).get(entryIds[f]);
    if (!sg) { console.log(`${f}: no suggestion to confirm`); continue; }
    const r = await call(logEntryToStop, {
      user: { id: 'test-operator' },
      params: { id: trip.id, entry: entryIds[f] },
      body: { action: sg.action, stop_id: sg.stop_id ?? undefined, stop_type: sg.stop_type, name: sg.name, arrive_at: sg.arrive_at ?? undefined, depart_at: sg.depart_at ?? undefined, needs_check: sg.needs_check },
    });
    console.log(`${f}: confirm → ${r.status} ${r.body?.success ? 'ok' : JSON.stringify(r.body)}`);
  }
  const final = await loadTrip();
  console.log('\n=== TRIP STOPS AFTER CONFIRM ===');
  final.stops.forEach((s, i) => console.log(`${i + 1}. ${s.location_name} · ${s.stop_type} · arrived ${clock(s.actual_arrival?.toISOString()) ?? '—'} · left ${clock(s.actual_departure?.toISOString()) ?? '—'}`));
  console.log(`\nTEST trip left on dev: ${ref}\nURL: ${WEB_BASE}/trips/${ref}`);
}

main()
  .catch((err) => { console.error(err?.message ?? err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); setTimeout(() => process.exit(process.exitCode ?? 0), 500); });
