import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverUpdates, buildShareMessage, daysUntil, latestPerSlot } from '../services/operatorInbox';

const NOW = Date.parse('2026-09-26T10:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000);

const trip = {
  id: 't1',
  ref_id: 'TRP-0259',
  status: 'InTransit',
  customer: {
    name: 'SHIPA', whatsapp_number: '+966500000001', primary_contact_person: 'Sara', primary_contact_phone: '+966500000002',
    contact_phone: '+966500000003', whatsapp_group_name: 'SHIPA ops', whatsapp_group_link: 'https://chat.whatsapp.com/abc',
  },
  vehicle: { plate_number: 'ESA-4244' },
  driver: { first_name: 'Abu', last_name: 'Bakar', phone_primary: '+966550270263' },
  stops: [
    { id: 'p', stop_sequence: 1, stop_type: 'Pickup', location_name: 'Airport', location_address: null, actual_arrival: ago(7200), delay_reason: null, delay_note: null, delay_logged_at: null },
    { id: 'd', stop_sequence: 2, stop_type: 'Dropoff', location_name: 'Medina', location_address: null, actual_arrival: null, delay_reason: null, delay_note: 'Traffic - jam', delay_logged_at: ago(100) },
  ],
};

const doc = (id: string, op: string, stop: string | undefined, secondsAgo: number, over: Record<string, unknown> = {}) => ({
  id, doc_type: op === 'delivery' ? 'POD' : 'Waybill', file_url: `/uploads/${id}.jpg`, mime_type: 'image/jpeg',
  ai_extracted_json: { operation: op, stop_id: stop }, createdAt: ago(secondsAgo), files: [], ...over,
});

const docs = new Map([['t1', [
  doc('l1', 'pickup', 'p', 7000),
  doc('l2', 'pickup', 'p', 6990),
  doc('v1', 'delay', undefined, 200, { file_url: '/uploads/v1.mp4', mime_type: 'video/mp4' }),
]]]);

test('driver updates', async (t) => {
  await t.test('uploads batch by stop and step, with the stop name and delay reason', () => {
    const ups = buildDriverUpdates([trip], docs, []);
    const loaded = ups.find((u) => u.key === 'p:loaded')!;
    assert.equal(loaded.items.length, 2);
    assert.equal(loaded.stop?.name, 'Airport');
    assert.equal(loaded.unsent_count, 2);
    const delay = ups.find((u) => u.key === 'd:delay')!;
    assert.equal(delay.stop?.name, 'Medina');
    assert.equal(delay.delay_note, 'Traffic - jam');
    assert.equal(loaded.trip.route, 'Airport → Medina');
  });

  await t.test('a forward marks its items sent for everyone; unsent batches come first', () => {
    const ups = buildDriverUpdates([trip], docs, [
      { id: 's1', tripId: 't1', update_key: 'p:loaded', media_ids: ['l1', 'l2'], channel: 'link', recipient: 'customer_group', createdAt: ago(50), sharedBy: { name: 'Ilan', username: 'ilan' } },
    ]);
    const loaded = ups.find((u) => u.key === 'p:loaded')!;
    assert.equal(loaded.unsent_count, 0);
    assert.equal(loaded.shares[0].shared_by, 'Ilan');
    assert.equal(ups[0].key, 'd:delay');
  });

  await t.test('a photo added after a forward shows as new', () => {
    const more = new Map([['t1', [...docs.get('t1')!, doc('l3', 'pickup', 'p', 10)]]]);
    const ups = buildDriverUpdates([trip], more, [
      { id: 's1', tripId: 't1', update_key: 'p:loaded', media_ids: ['l1', 'l2'], channel: 'link', recipient: 'internal', createdAt: ago(50), sharedBy: null },
    ]);
    assert.equal(ups.find((u) => u.key === 'p:loaded')!.unsent_count, 1);
  });

  await t.test('the WhatsApp message is short and carries the link', () => {
    const u = buildDriverUpdates([trip], docs, []).find((x) => x.key === 'd:delay')!;
    assert.equal(
      buildShareMessage(u, u.items, 'https://dev.mercon.tech/s/tok'),
      '*TRP-0259 · Delay on the way to Medina*\nSHIPA · Airport → Medina\nTruck ESA-4244 · Driver Abu Bakar\nReason: Traffic - jam\n\n1 video: https://dev.mercon.tech/s/tok',
    );
  });
});

test('document expiries', async (t) => {
  await t.test('a renewed document replaces the old one in its slot', () => {
    const base = { entity_type: 'Vehicle', entity_id: 'v1', doc_type: 'VehicleRegistration', documentTypeId: 'istimara', documentType: { name: 'Istimara' }, status: 'Verified' };
    const kept = latestPerSlot([
      { ...base, id: 'old', expiry_date: new Date('2026-09-20') },
      { ...base, id: 'new', expiry_date: new Date('2027-09-20') },
      { ...base, id: 'other-slot', documentTypeId: 'insurance', expiry_date: new Date('2026-10-01') },
      { ...base, id: 'rejected', documentTypeId: 'fahas', status: 'Rejected', expiry_date: new Date('2026-09-01') },
    ]);
    assert.deepEqual(kept.map((d) => d.id).sort(), ['new', 'other-slot']);
  });

  await t.test('days count whole calendar days, negative once expired', () => {
    const now = new Date('2026-09-26T22:00:00Z');
    assert.equal(daysUntil(new Date('2026-09-27T01:00:00Z'), now), 1);
    assert.equal(daysUntil(new Date('2026-09-26T00:00:00Z'), now), 0);
    assert.equal(daysUntil(new Date('2026-09-23T12:00:00Z'), now), -3);
  });
});
