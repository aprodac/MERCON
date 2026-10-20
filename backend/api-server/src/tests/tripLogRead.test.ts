import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTripLogRead, resolveReadTimes, placeSimilarity, suggestForEntry, entryRead } from '@mercon/shared-types';

const TZ = 'Asia/Riyadh'; // UTC+3, no DST
const SENT = '2026-10-17T10:00:00Z'; // 13:00 Riyadh, 17 Oct

const reply = (stops: unknown[], confidence = 0.9) => '```json\n' + JSON.stringify({ stops, app: 'iMile', confidence }) + '\n```';
const doc = (read: unknown) => ({ id: 'd', file_url: '/u/d.jpg', ai_extracted_json: { read } });
const readOf = (stops: unknown[], confidence = 0.9) => resolveReadTimes(parseTripLogRead(reply(stops, confidence))!, SENT, TZ);

test('trip log read', async (t) => {
  await t.test('parses fenced, bare and chatty replies; rejects junk', () => {
    const body = JSON.stringify({ stops: [{ name: ' Riyadh DC ', arrive: '6:10:00', depart: '06:55', date: null }], app: 'iMile', confidence: 0.9 });
    for (const text of ['```json\n' + body + '\n```', body, `Here you go: ${body} hope it helps`]) {
      const r = parseTripLogRead(text)!;
      assert.equal(r.stops[0].name, 'Riyadh DC');
      assert.equal(r.stops[0].arrive, '06:10:00');
      assert.equal(r.stops[0].depart, '06:55:00');
    }
    assert.equal(parseTripLogRead('no json here'), null);
    assert.equal(parseTripLogRead('{"stops":"x"}'), null);
    assert.equal(parseTripLogRead(null), null);
  });

  await t.test('drops invalid clocks, bad dates, empty stops; clamps confidence', () => {
    const r = parseTripLogRead(JSON.stringify({ stops: [{ name: 'A', arrive: '25:00:00', depart: 'soon', date: '17/10' }, {}], confidence: 7 }))!;
    assert.equal(r.stops.length, 1);
    assert.deepEqual([r.stops[0].arrive, r.stops[0].depart, r.stops[0].date], [null, null, null]);
    assert.equal(r.confidence, 1);
  });

  await t.test('a clock earlier than the send time is the send day, in the company zone', () => {
    const [s] = readOf([{ name: 'Riyadh DC', arrive: '06:10:00', depart: '06:55:00' }]).stops;
    assert.equal(s.arrive_at, '2026-10-17T03:10:00.000Z');
    assert.equal(s.depart_at, '2026-10-17T03:55:00.000Z');
  });

  await t.test('a clock later than the send time belongs to the previous day', () => {
    const [s] = readOf([{ name: 'Jeddah', arrive: '23:30:00', depart: null }]).stops;
    assert.equal(s.arrive_at, '2026-10-16T20:30:00.000Z');
    assert.equal(s.depart_at, null);
  });

  await t.test('send just after midnight local: yesterday evening times roll back across the date line', () => {
    const r = resolveReadTimes(parseTripLogRead(reply([{ name: 'X', arrive: '23:50:00', depart: '00:20:00' }]))!, '2026-10-16T21:30:00Z', TZ); // 00:30 on the 17th
    assert.equal(r.stops[0].arrive_at, '2026-10-16T20:50:00.000Z'); // 23:50 on the 16th
    assert.equal(r.stops[0].depart_at, '2026-10-16T21:20:00.000Z'); // 00:20 on the 17th
  });

  await t.test('departure earlier than arrival rolls to the next day; a date on the screen wins', () => {
    const r = resolveReadTimes(parseTripLogRead(reply([{ name: 'A', arrive: '09:00:00', depart: '08:00:00' }]))!, '2026-10-18T10:00:00Z', TZ);
    assert.equal(r.stops[0].arrive_at, '2026-10-18T06:00:00.000Z');
    assert.equal(r.stops[0].depart_at, '2026-10-19T05:00:00.000Z');
    const d = readOf([{ name: 'A', arrive: '23:00:00', depart: null, date: '2026-10-12' }]);
    assert.equal(d.stops[0].arrive_at, '2026-10-12T20:00:00.000Z');
  });

  await t.test('names match across case, spelling, noise words and Arabic-free typos', () => {
    assert.equal(placeSimilarity('RIYADH DC', 'Riyadh'), 1);
    assert.equal(placeSimilarity('Jedda Hub', 'Jeddah Warehouse'), 1);
    assert.equal(placeSimilarity('Al-Dammam Sorting Center', 'dammam'), 1);
    assert.equal(placeSimilarity('Riyadh', 'Jeddah'), 0);
    assert.equal(placeSimilarity('', 'Jeddah'), 0);
  });

  const stops = [
    { id: 's1', stop_type: 'Pickup', location_name: 'Riyadh' },
    { id: 's2', stop_type: 'Dropoff', location_name: 'Jeddah Warehouse' },
  ];
  const entry = (read: unknown) => ({ docs: [doc(read)], place: 'Riyadh', stop_id: null });

  await t.test('suggests attaching to the planned stop with its type and the read times', () => {
    const sg = suggestForEntry(entry(readOf([{ name: 'Riyadh DC', arrive: '06:10:00', depart: '06:55:00' }])), stops)!;
    assert.equal(sg.action, 'attach');
    assert.equal(sg.stop_id, 's1');
    assert.equal(sg.stop_index, 0);
    assert.equal(sg.stop_type, 'Pickup');
    assert.equal(sg.arrive_at, '2026-10-17T03:10:00.000Z');
    assert.equal(sg.needs_check, false);
  });

  await t.test('an unknown name is a new stop: first open entry loads, later ones unload', () => {
    const r = readOf([{ name: 'Taif Hub', arrive: '09:00:00', depart: null }]);
    assert.equal(suggestForEntry(entry(r), [], { openIndex: 0 })!.stop_type, 'Pickup');
    const later = suggestForEntry(entry(r), stops, { openIndex: 1 })!;
    assert.equal(later.action, 'new');
    assert.equal(later.stop_type, 'Dropoff');
    assert.equal(later.name, 'Taif Hub');
  });

  await t.test('a stop another entry already claimed is not suggested twice', () => {
    const r = readOf([{ name: 'Jeddah', arrive: '09:00:00', depart: null }]);
    assert.equal(suggestForEntry(entry(r), stops)!.stop_id, 's2');
    assert.equal(suggestForEntry(entry(r), stops, { taken: new Set(['s2']) })!.action, 'new');
  });

  await t.test('a low-confidence read still suggests but needs a check; no read or no times means no suggestion', () => {
    assert.equal(suggestForEntry(entry(readOf([{ name: 'Riyadh', arrive: '06:10:00', depart: null }], 0.6)), stops)!.needs_check, true);
    assert.equal(suggestForEntry({ docs: [{ id: 'x', file_url: '/x.jpg' }], place: null, stop_id: null }, stops), null);
    assert.equal(suggestForEntry(entry(readOf([{ name: 'Riyadh', arrive: null, depart: null }])), stops), null);
    assert.equal(suggestForEntry({ ...entry(readOf([{ name: 'Riyadh', arrive: '06:10:00', depart: null }])), stop_id: 's1' }, stops), null);
  });

  await t.test('of several screenshots in one send, the one with times is used', () => {
    const blank = doc(readOf([{ name: 'Riyadh', arrive: null, depart: null }], 0.99));
    const good = doc(readOf([{ name: 'Riyadh', arrive: '06:10:00', depart: null }], 0.7));
    assert.equal(entryRead([blank, good])!.stops[0].arrive, '06:10:00');
  });
});
