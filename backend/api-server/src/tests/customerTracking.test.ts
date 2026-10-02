import test from 'node:test';
import { whatsAppGroupUrl } from '@mercon/shared-types';
import assert from 'node:assert/strict';
import {
  ETA_STALE_MS, TRACKING_AFTER_END_DAYS, buildPublicTracking, firstName, lateMinutes, optionsOf, placeName, routeLabel, trackingLinkState, truckSeconds, waDigits,
  type TrackingOptions, type TrackingTripMeta,
} from '../services/tracking/customerTracking';
import { deliveredTripFilter, fleetTripFilter, sortFleet, toDeliveredTrip, toFleetTruck } from '../services/tracking/customerFleetTracking';
import { renderPreviewTags, tripPreview } from '../services/tracking/trackingPreview';
import type { LiveTripMedia } from '../services/fleetLiveMap';
import type { TripOverview } from '../services/tripOverview';
import type { RouteResult } from '../services/routing/routeProvider';

const NOW = new Date('2026-10-02T12:00:00Z');

function overview(over: Partial<TripOverview> = {}, posAgeMs = 30_000): TripOverview {
  return {
    trip_id: 't1',
    status: 'InTransit',
    phase: 'active',
    stops: [
      { id: 's1', sequence: 1, type: 'Pickup', name: 'iMile CDC Riyadh', address: 'Riyadh', lat: 24.6, lng: 46.7, planned_arrival: null, actual_arrival: '2026-10-02T06:00:00Z', actual_departure: '2026-10-02T06:40:00Z' },
      { id: 's2', sequence: 2, type: 'Dropoff', name: null, address: 'Al Baha, Saudi Arabia', lat: 20.01, lng: 41.47, planned_arrival: '2026-10-02T18:00:00Z', actual_arrival: null, actual_departure: null },
    ],
    next_stop_index: 1,
    unit: {
      key: 'v:1', vehicle: null, driver: null, trip: null, vehicle_gps: null, driver_gps: null,
      position: {
        lat: 22.123456789, lng: 43.987654321, speed_kph: 82.4, heading_deg: 210, accuracy_m: null,
        recorded_at: new Date(NOW.getTime() - posAgeMs).toISOString(), fresh: posAgeMs < 180_000, source: 'vehicle',
      },
      feed: 'vehicle', motion: 'moving', feeds_gap_m: null,
    },
    path: [[46.7, 24.6], [45, 23.5], [43.98, 22.12]],
    path_distance_m: 400_000,
    checks: null,
    ...over,
  };
}

const meta: TrackingTripMeta = {
  ref_id: 'TRP-0412', status: 'InTransit', vehicle_type: '10 TON', planned_start: null, actual_start: new Date('2026-10-02T06:40:00Z'), actual_end: null,
  updatedAt: NOW, is_third_party: false,
  vehicle: { plate_number: 'VRA-3358', asset_type: 'Truck10Ton' },
  driver: { first_name: 'UMAR BASHIR' },
  subcontract: null,
};

const route = (distanceMeters: number, durationSeconds: number): RouteResult => ({
  geometry: [[43.98, 22.12], [41.47, 20.01]], distanceMeters, durationSeconds,
  legs: [{ distanceMeters, durationSeconds }], provider: 'osrm',
});

const DEFAULTS: TrackingOptions = { show_deadline: false, show_delay_reason: false, show_photos: true };
const BRAND = { name: 'MERCON', logo_url: '/uploads/logo.png', primary_color: null, support_whatsapp: '966500000000', ask_group_url: null };

const build = (
  ov: TripOverview, ahead: RouteResult | null, all: RouteResult | null = route(900_000, 30_000), m = meta,
  options: TrackingOptions = DEFAULTS, media: LiveTripMedia | null = null,
) => buildPublicTracking({ overview: ov, meta: m, brand: BRAND, timezone: 'Asia/Riyadh', options, ahead, all, media, now: NOW });

const MEDIA: LiveTripMedia = {
  stops: [
    {
      stop_id: 's1', sequence: 1, delay: null,
      media: [
        { id: 'p1', kind: 'photo', stage: 'loaded', url: '/uploads/load.jpg', mime: 'image/jpeg', captured_at: '2026-10-02T06:30:00Z' },
        { id: 'v1', kind: 'video', stage: 'delay', url: '/uploads/delay.mp4', mime: 'video/mp4', captured_at: '2026-10-02T09:00:00Z' },
      ],
    },
    { stop_id: 's2', sequence: 2, delay: { reason: 'Traffic', note: 'stuck behind police check, very angry', logged_at: '2026-10-02T11:00:00Z' }, media: [] },
  ],
  unplaced: [],
};

test('whatsapp group link: only real invite links count', () => {
  assert.equal(whatsAppGroupUrl('https://chat.whatsapp.com/AbCdEf1234567890xyz'), 'https://chat.whatsapp.com/AbCdEf1234567890xyz');
  assert.equal(whatsAppGroupUrl(' chat.whatsapp.com/invite/AbCdEf1234567890xyz?mode=r '), 'https://chat.whatsapp.com/AbCdEf1234567890xyz');
  assert.equal(whatsAppGroupUrl('iMile ops group'), null);
  assert.equal(whatsAppGroupUrl('https://evil.example/chat.whatsapp.com/AbCdEf1234567890xyz'), null);
  assert.equal(whatsAppGroupUrl(null), null);
});

test('customer tracking', async (t) => {
  await t.test('a truck is never timed faster than the average-speed cap', () => {
    // 300 km the router says takes 2.5 h (120 km/h) → held to 80 km/h = 3.75 h.
    assert.equal(truckSeconds(300_000, 9_000), 13_500);
    // A slow route stays as the router timed it.
    assert.equal(truckSeconds(10_000, 1_200), 1_200);
  });

  await t.test('driver shows by first name only', () => {
    assert.equal(firstName('UMAR BASHIR'), 'Umar');
    assert.equal(firstName('  '), null);
    assert.equal(firstName(null), null);
  });

  await t.test('active trip: ETA to the next stop, progress, no phone or full name', () => {
    const out = build(overview(), route(300_000, 9_000));
    assert.equal(out.eta?.stop_index, 1);
    assert.equal(out.eta?.seconds, 13_500);
    assert.equal(out.eta?.arrival, new Date(NOW.getTime() + 13_500_000).toISOString());
    assert.equal(out.eta_gap, null);
    assert.deepEqual(out.progress, { done_m: 600_000, total_m: 900_000, pct: 67 });
    assert.equal(out.driver_first_name, 'Umar');
    assert.equal(out.vehicle.plate, 'VRA-3358');
    assert.equal(out.vehicle.type, '10 TON');
    assert.ok(!('planned_arrival' in out.stops[1]), 'planned stop times are not shown to customers');
    assert.equal(out.position?.lat, 22.12346);
    assert.equal(out.position?.moving, true);
    assert.deepEqual(out.stops.map((s) => s.state), ['done', 'next']);
    assert.equal(out.stops[1].name, 'Al Baha');
    assert.ok(!JSON.stringify(out).includes('phone'));
  });

  await t.test('an old position gives no ETA instead of a wrong one', () => {
    const out = build(overview({}, ETA_STALE_MS + 60_000), route(300_000, 9_000));
    assert.equal(out.eta, null);
    assert.equal(out.eta_gap, 'stale');
    assert.equal(out.progress, null);
    assert.equal(out.position?.fresh, false);
  });

  await t.test('no position and no route are reported, not guessed', () => {
    assert.equal(build(overview({ unit: null }), null).eta_gap, 'no_position');
    assert.equal(build(overview(), null).eta_gap, 'no_route');
  });

  await t.test('planned trip: ETA is the drive to the pickup', () => {
    const ov = overview({ phase: 'planned', status: 'Scheduled', next_stop_index: 0, path: [] });
    ov.stops = ov.stops.map((s) => ({ ...s, actual_arrival: null, actual_departure: null }));
    const out = build(ov, route(20_000, 1_800));
    assert.equal(out.eta?.stop_index, 0);
    assert.equal(out.next_stop_index, 0);
    assert.deepEqual(out.stops.map((s) => s.state), ['next', 'upcoming']);
    assert.ok(out.route, 'planned trips draw the route through the stops');
    assert.deepEqual(out.path, []);
  });

  await t.test('finished trip: no live truck, every stop done, full progress', () => {
    const out = build(overview({ phase: 'done', status: 'Completed', unit: null }), null);
    assert.equal(out.position, null);
    assert.equal(out.eta, null);
    assert.equal(out.next_stop_index, null);
    assert.deepEqual(out.stops.map((s) => s.state), ['done', 'done']);
    assert.equal(out.progress?.pct, 100);
  });

  await t.test('third-party trip shows the subcontractor truck', () => {
    const out = build(overview(), null, null, {
      ...meta, is_third_party: true, vehicle: null, driver: null,
      subcontract: { vehiclePlate: 'ABC-1234', vehicleType: '5 TON', driverName: 'ali khan' },
    });
    assert.equal(out.vehicle.plate, 'ABC-1234');
    assert.equal(out.driver_first_name, 'Ali');
  });

  await t.test('deadlines stay hidden unless the customer has them switched on', () => {
    const off = build(overview(), route(300_000, 9_000));
    assert.equal(off.punctuality, null);
    assert.ok(off.stops.every((s) => s.due_at === null && s.late_min === null));

    // ETA 15:45 against a planned 18:00 → on time; the planned time is shown.
    const on = build(overview(), route(300_000, 9_000), undefined, meta, { ...DEFAULTS, show_deadline: true });
    assert.deepEqual(on.punctuality, { late_min: 0 });
    assert.equal(on.stops[1].due_at, '2026-10-02T18:00:00Z');

    // Planned 14:00 → 105 minutes late.
    const late = overview();
    late.stops[1] = { ...late.stops[1], planned_arrival: '2026-10-02T14:00:00Z' };
    assert.deepEqual(build(late, route(300_000, 9_000), undefined, meta, { ...DEFAULTS, show_deadline: true }).punctuality, { late_min: 105 });
  });

  await t.test('late minutes allow the same five-minute grace as the dashboard', () => {
    assert.equal(lateMinutes('2026-10-02T12:04:00Z', '2026-10-02T12:00:00Z'), 0);
    assert.equal(lateMinutes('2026-10-02T12:20:00Z', '2026-10-02T12:00:00Z'), 20);
    assert.equal(lateMinutes(null, '2026-10-02T12:00:00Z'), null);
  });

  await t.test('delay reason: the category only, never the typed note, and only when switched on', () => {
    assert.equal(build(overview(), route(300_000, 9_000), undefined, meta, DEFAULTS, MEDIA).delay, null);
    const on = build(overview(), route(300_000, 9_000), undefined, meta, { ...DEFAULTS, show_delay_reason: true }, MEDIA);
    assert.deepEqual(on.delay, { reason: 'Traffic' });
    assert.ok(!JSON.stringify(on).includes('angry'));
  });

  await t.test('photos: done stops only, delay videos included and marked, and only when switched on', () => {
    const on = build(overview(), route(300_000, 9_000), undefined, meta, DEFAULTS, MEDIA);
    assert.deepEqual(on.stops[0].photos.map((p) => [p.url, p.kind, p.delay]), [['/uploads/load.jpg', 'photo', false], ['/uploads/delay.mp4', 'video', true]]);
    // The driver's typed note never reaches the customer.
    assert.ok(!JSON.stringify(on).includes('very angry'));
    assert.deepEqual(on.stops[1].photos, []);
    const off = build(overview(), route(300_000, 9_000), undefined, meta, { ...DEFAULTS, show_photos: false }, MEDIA);
    assert.deepEqual(off.stops[0].photos, []);
  });

  await t.test('customer settings map to page options; a customer with no settings gets the defaults', () => {
    assert.deepEqual(optionsOf(null), DEFAULTS);
    assert.deepEqual(optionsOf({
      tracking_enabled: true, tracking_auto_link: false, tracking_show_deadline: true, tracking_show_delay_reason: true, tracking_show_photos: false,
    }), { show_deadline: true, show_delay_reason: true, show_photos: false });
  });

  await t.test('support number is digits only, or nothing', () => {
    assert.equal(waDigits('+966 50 000 0000'), '966500000000');
    assert.equal(waDigits('123'), null);
    assert.equal(waDigits(null), null);
  });

  await t.test('WhatsApp preview says where the truck is going and when', () => {
    const p = tripPreview(build(overview(), route(300_000, 9_000)));
    assert.equal(p.title, 'Track VRA-3358 · 10 TON · MERCON');
    assert.match(p.description, /^On the way to Al Baha · arrives around \d\d:\d\d$/);
    const html = renderPreviewTags({ ...p, title: 'A "quoted" <title>' }, 'https://mercon.tech');
    assert.ok(html.includes('content="A &quot;quoted&quot; &lt;title&gt;"'));
    assert.ok(html.includes('content="https://mercon.tech/uploads/logo.png"'));
  });

  await t.test('customer page: trucks on the road first, then loading soon, then delivered', () => {
    const active = toFleetTruck('tok-a', build(overview(), route(300_000, 9_000)));
    assert.equal(active.next_stop_name, 'Al Baha');
    assert.equal(active.stops_done, 1);
    assert.equal(active.progress_pct, 67);
    const done = toFleetTruck('tok-d', build(overview({ phase: 'done', status: 'Completed', unit: null }), null));
    const plannedOv = overview({ phase: 'planned', status: 'Scheduled', next_stop_index: 0, path: [] });
    plannedOv.stops = plannedOv.stops.map((s) => ({ ...s, actual_arrival: null, actual_departure: null }));
    const planned = toFleetTruck('tok-p', build(plannedOv, route(20_000, 1_800)));
    assert.deepEqual(sortFleet([done, planned, active]).map((x) => x.token), ['tok-a', 'tok-p', 'tok-d']);
  });

  await t.test('place names read properly; names typed in mixed case are left alone', () => {
    assert.equal(placeName('khamis mushayt'), 'Khamis Mushayt');
    assert.equal(placeName('RIYADH'), 'Riyadh');
    assert.equal(placeName('  al-baha  '), 'Al-Baha');
    assert.equal(placeName('iMile CDC Riyadh'), 'iMile CDC Riyadh');
  });

  await t.test('route label: one way, multi-drop, and round trips', () => {
    assert.equal(routeLabel(['Riyadh', 'Dawadmi']), 'Riyadh → Dawadmi');
    assert.equal(routeLabel(['Riyadh', 'Hail', 'Qurayyat']), 'Riyadh → Hail → Qurayyat');
    assert.equal(routeLabel(['Khamis Mushayt', 'Muhayil', 'Muhayil', 'Khamis Mushayt']), 'Khamis Mushayt ⇄ Muhayil');
    assert.equal(routeLabel(['Riyadh', 'Riyadh']), 'Riyadh');
    assert.equal(routeLabel([]), null);
  });

  await t.test('trip page and cards carry the route label', () => {
    const out = build(overview(), route(300_000, 9_000));
    assert.equal(out.trip.route_label, 'iMile CDC Riyadh → Al Baha');
    assert.equal(toFleetTruck('tok', out).route_label, 'iMile CDC Riyadh → Al Baha');
  });

  await t.test('a delivered trip: route, truck and times only', () => {
    const d = toDeliveredTrip('tok', {
      ...meta, status: 'Completed', actual_end: new Date('2026-10-01T20:00:00Z'),
      stops: [{ location_name: 'riyadh', location_address: null }, { location_name: null, location_address: 'Dawadmi, Saudi Arabia' }],
    });
    assert.deepEqual(d, {
      token: 'tok', ref: 'TRP-0412', plate: 'VRA-3358', type: '10 TON', route_label: 'Riyadh → Dawadmi',
      started_at: '2026-10-02T06:40:00.000Z', finished_at: '2026-10-01T20:00:00.000Z',
    });
  });

  await t.test('delivered list covers the last 30 days', () => {
    const f = deliveredTripFilter('c1', NOW);
    assert.equal(f.actual_end.gte.toISOString(), '2026-09-02T12:00:00.000Z');
  });

  await t.test('customer page shows running and soon-to-load trips', () => {
    const f = fleetTripFilter('c1', NOW);
    assert.equal(f.customerId, 'c1');
    assert.equal(f.OR.length, 2);
    const soon = (f.OR[1] as unknown as { OR: Array<{ planned_start?: { lte: Date } | null }> }).OR[1].planned_start as { lte: Date };
    assert.equal(soon.lte.toISOString(), '2026-10-03T12:00:00.000Z');
  });

  await t.test('photos: driver and truck for our own trucks, none for subcontracted ones; customer logo passed through', () => {
    const own = buildPublicTracking({
      overview: overview(), brand: BRAND, timezone: 'Asia/Riyadh', options: DEFAULTS, ahead: null, all: null, now: NOW,
      meta: { ...meta, vehicle: { ...meta.vehicle!, image_url: '/uploads/truck.jpg' }, driver: { first_name: 'Umar', avatar_url: '/uploads/umar.jpg' } },
      customer: { name: 'iMile', logo_url: '/uploads/imile.png' },
    });
    assert.equal(own.driver_photo_url, '/uploads/umar.jpg');
    assert.equal(own.vehicle.photo_url, '/uploads/truck.jpg');
    assert.deepEqual(own.customer, { name: 'iMile', logo_url: '/uploads/imile.png' });
    assert.equal(toFleetTruck('tok', own).driver_photo_url, '/uploads/umar.jpg');

    const third = build(overview(), null, null, {
      ...meta, is_third_party: true, vehicle: { ...meta.vehicle!, image_url: '/uploads/truck.jpg' }, driver: { first_name: 'Umar', avatar_url: '/uploads/umar.jpg' },
      subcontract: { vehiclePlate: 'ABC-1234', vehicleType: '5 TON', driverName: 'ali' },
    });
    assert.equal(third.driver_photo_url, null);
    assert.equal(third.vehicle.photo_url, null);
  });

  await t.test('link lifetime', () => {
    const live = { expiresAt: new Date(NOW.getTime() + 86_400_000) };
    const trip = (status: string, actual_end: Date | null = null) => ({ status, actual_end, updatedAt: NOW });
    assert.equal(trackingLinkState(live, trip('InTransit'), NOW), 'ok');
    assert.equal(trackingLinkState(live, null, NOW), 'not_found');
    assert.equal(trackingLinkState({ expiresAt: NOW }, trip('InTransit'), NOW), 'expired');
    assert.equal(trackingLinkState(live, trip('Cancelled'), NOW), 'cancelled');
    assert.equal(trackingLinkState(live, { ...trip('InTransit'), customer: { tracking_enabled: false } }, NOW), 'disabled');
    const ended = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
    assert.equal(trackingLinkState(live, trip('Completed', ended(TRACKING_AFTER_END_DAYS - 1)), NOW), 'ok');
    assert.equal(trackingLinkState(live, trip('Completed', ended(TRACKING_AFTER_END_DAYS + 1)), NOW), 'expired');
  });
});
