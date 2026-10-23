import { describe, expect, it } from 'vitest';
import { formatFleetStatusMessage, formatTripStatusMessage, formatWhatsAppPhone, type StatusTrip } from '@mercon/shared-types';

const base: StatusTrip = {
  from: 'KHA',
  to: 'NAJ',
  vehicleClass: '5 Ton',
  lineType: 'Round trip',
  driverName: 'Shahbaz',
  driverPhone: '0510785259',
  plate: 'DRA-6487',
  status: 'Scheduled',
  startsAt: '09:00',
  trackingUrl: 'https://track.mercon.tech/t/abc',
};

const running: StatusTrip = {
  ...base,
  from: 'RUH',
  to: 'BAH',
  driverName: 'Wisal Zar',
  plate: 'VTA-3241',
  status: 'InTransit',
  eta: { time: '14:20', inText: '1 h 24 min', minutes: 84, kmLeft: 95.6, to: 'Bah' },
};

describe('shared WhatsApp status message', () => {
  it('a trip that has not started gets the dispatch format', () => {
    expect(formatTripStatusMessage({ ...base, notes: ['With tailgate'] }, { tag: '~Taha', billing: 'MONTHLY' })).toBe(
      [
        '@~Taha',
        '*(MONTHLY VEHICLE)*',
        '1. KHA>>>NAJ 05 TON (ROUND TRIP)',
        'Driver Name # SHAHBAZ',
        'Number # +966 51 078 5259',
        'Truck no # DRA-6487',
        'WITH TAILGATE',
        '',
        'Track live: https://track.mercon.tech/t/abc',
      ].join('\n'),
    );
  });

  it('a running trip gets the vehicle status update', () => {
    expect(formatTripStatusMessage(running, { tag: '~Mazher (ibaad)', billing: 'MONTHLY' })).toBe(
      [
        '@~Mazher (ibaad)',
        '🚛 Vehicle Status Update',
        'Truck: *VTA-3241*',
        'Driver: WISAL ZAR',
        'Route: RUH>>>BAH',
        'Distance left: 96 KM TO BAH',
        'ETA: 1.4HRS',
        'Status: In Transit',
        '',
        'Track live: https://track.mercon.tech/t/abc',
      ].join('\n'),
    );
  });

  it('adds the delay to the ETA, and falls back to the clock time without minutes', () => {
    expect(formatTripStatusMessage({ ...running, status: 'Delayed', eta: { ...running.eta!, late: '40 min late' } })).toContain('ETA: 1.4HRS (40 min late)\nStatus: Delayed');
    expect(formatTripStatusMessage({ ...running, eta: { time: '14:20' } })).toContain('ETA: 14:20');
  });

  it('falls back to the planned arrival, never both', () => {
    const text = formatTripStatusMessage({ ...running, eta: null, plannedArrival: '18:00' });
    expect(text).toContain('ETA: 18:00 (planned)');
    expect(text).not.toContain('Distance left');
  });

  it('says delivered, without an ETA, once finished', () => {
    const text = formatTripStatusMessage({ ...running, status: 'Completed', deliveredAt: '13:52' });
    expect(text).toContain('Status: Delivered · 13:52');
    expect(text).not.toContain('ETA:');
    expect(text).not.toContain('Distance left');
  });

  it('marks what is missing instead of inventing it', () => {
    const text = formatTripStatusMessage({ ...base, driverName: null, driverPhone: null, plate: null, trackingUrl: null });
    expect(text).toContain('Driver Name # NOT ASSIGNED YET');
    expect(text).toContain('Truck no # NOT ASSIGNED YET');
    expect(text).not.toContain('Number #');
    expect(text).not.toContain('Track live');
  });

  it('numbers several trips, each with its own link, the fleet link first', () => {
    const text = formatFleetStatusMessage(
      [base, { ...base, plate: 'ABC-1234', trackingUrl: 'https://track.mercon.tech/t/def' }],
      { tag: 'iMile', fleetUrl: 'https://track.mercon.tech/c/all' },
    );
    const parts = text.split('\n\n');
    expect(parts[0]).toBe('@iMile\nAll your trucks: https://track.mercon.tech/c/all');
    expect(parts[1].startsWith('1. KHA>>>NAJ')).toBe(true);
    expect(parts[1]).toContain('Track live: https://track.mercon.tech/t/abc');
    expect(parts[2].startsWith('2. KHA>>>NAJ')).toBe(true);
    expect(parts[2]).toContain('Truck no # ABC-1234');
  });

  it('several running trips share one status update title', () => {
    const text = formatFleetStatusMessage([running, { ...running, plate: 'ABC-1234' }], { tag: 'iMile' });
    const parts = text.split('\n\n');
    expect(parts[0]).toBe('@iMile\n🚛 Vehicle Status Update');
    expect(parts[1].startsWith('1. Truck: *VTA-3241*')).toBe(true);
    expect(parts[2].startsWith('2. Truck: *ABC-1234*')).toBe(true);
  });

  it('writes local trips, truck classes and trip types the way the groups do', () => {
    const text = formatTripStatusMessage({ ...base, from: 'RUH', to: 'RUH', local: true, vehicleClass: '5 ton', lineType: 'SINGLE_TRIP' });
    expect(text).toContain('1. RUH>>>RUH(LOCAL) 05 TON (SINGLE TRIP)');
  });

  it('the assignment message keeps the dispatch format even once the trip runs', () => {
    const text = formatTripStatusMessage({ ...running, notes: ['With tailgate'] }, { tag: 'Rashed Ahmed', brief: true });
    expect(text).toContain('1. RUH>>>BAH 05 TON (ROUND TRIP)\nDriver Name # WISAL ZAR');
    expect(text).not.toContain('Status');
    expect(text).not.toContain('ETA');
  });

  it('dates each trip when a message spans several days', () => {
    expect(formatTripStatusMessage({ ...base, date: 'Tue 6 Oct 09:00' }).split('\n')[1]).toBe('Date # Tue 6 Oct 09:00');
  });

  it('writes Saudi numbers in groups', () => {
    expect(formatWhatsAppPhone('0510785259')).toBe('+966 51 078 5259');
    expect(formatWhatsAppPhone('+966 51 078 5259')).toBe('+966 51 078 5259');
    expect(formatWhatsAppPhone('966510785259')).toBe('+966 51 078 5259');
    expect(formatWhatsAppPhone('510785259')).toBe('+966 51 078 5259');
    expect(formatWhatsAppPhone('+971501234567')).toBe('+971501234567');
    expect(formatWhatsAppPhone('')).toBeNull();
  });
});
