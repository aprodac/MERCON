import { describe, expect, it } from 'vitest';
import { formatFleetStatusMessage, formatTripStatusMessage, formatWhatsAppPhone, type StatusTrip } from '@mercon/shared-types';

const base: StatusTrip = {
  from: 'KHA',
  to: 'KHA(LOCAL)',
  vehicleClass: '10 Ton',
  lineType: 'Round trip',
  driverName: 'Mohammed Faizan Faiz Ahmed',
  driverPhone: '0550975991',
  plate: 'VSA-3071',
  status: 'Scheduled',
  startsAt: '09:00',
  trackingUrl: 'https://track.mercon.tech/t/abc',
};

describe('shared WhatsApp status message', () => {
  it('formats a scheduled trip in the dispatch format', () => {
    expect(formatTripStatusMessage(base, { customerName: 'iMile Delivery Saudi Logistics' })).toBe(
      [
        '@IMILE DELIVERY SAUDI LOGISTICS',
        '1. KHA >>> KHA(LOCAL) 10 TON (ROUND TRIP)',
        'Driver Name # MOHAMMED FAIZAN FAIZ AHMED',
        'Number # +966 550975991',
        'Truck no # VSA-3071',
        'Status # Scheduled · starts 09:00',
        '',
        'Track live: https://track.mercon.tech/t/abc',
      ].join('\n'),
    );
  });

  it('adds the live ETA on a running trip, and the delay', () => {
    const text = formatTripStatusMessage({
      ...base,
      status: 'Delayed',
      eta: { time: '14:20', inText: '1 h 40 min', kmLeft: 85.4, to: 'Al Abha', late: '40 min late' },
    });
    expect(text).toContain('Status # Delayed');
    expect(text).toContain('ETA # 14:20 (in 1 h 40 min · 85 KM to AL ABHA) · 40 min late');
  });

  it('falls back to the planned arrival, never both', () => {
    const text = formatTripStatusMessage({ ...base, status: 'InTransit', plannedArrival: '18:00' });
    expect(text).toContain('Planned arrival # 18:00');
    expect(text).not.toContain('ETA #');
  });

  it('says delivered, without an ETA, once finished', () => {
    const text = formatTripStatusMessage({ ...base, status: 'Completed', deliveredAt: '13:52', eta: { time: '14:20' } });
    expect(text).toContain('Status # Delivered · 13:52');
    expect(text).not.toContain('ETA #');
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
      { customerName: 'iMile', fleetUrl: 'https://track.mercon.tech/c/all' },
    );
    const parts = text.split('\n\n');
    expect(parts[0]).toBe('@IMILE\nTrack all 2 trucks live: https://track.mercon.tech/c/all');
    expect(parts[1].startsWith('1. KHA >>> KHA(LOCAL)')).toBe(true);
    expect(parts[1]).toContain('Track live: https://track.mercon.tech/t/abc');
    expect(parts[2].startsWith('2. KHA >>> KHA(LOCAL)')).toBe(true);
    expect(parts[2]).toContain('Truck no # ABC-1234');
  });

  it('normalises Saudi numbers', () => {
    expect(formatWhatsAppPhone('0550975991')).toBe('+966 550975991');
    expect(formatWhatsAppPhone('+966 55 097 5991')).toBe('+966 550975991');
    expect(formatWhatsAppPhone('550975991')).toBe('+966 550975991');
    expect(formatWhatsAppPhone('+971501234567')).toBe('+971501234567');
    expect(formatWhatsAppPhone('')).toBeNull();
  });
});
