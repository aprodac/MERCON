import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTripWhatsAppShare } from './useTripWhatsAppShare';
import type { Trip } from '@/services/tripService';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    ref_id: 'TRP-1',
    status: 'Scheduled',
    is_third_party: false,
    driver: { first_name: 'Sami', last_name: 'Alotaibi', phone_primary: '966500000001' },
    customer: { name: 'Acme Co', contact_phone: '966500000002' },
    vehicle: { plate_number: 'ABC-123', asset_type: 'Flatbed' },
    stops: [
      { stop_type: 'Pickup', location_name: 'Riyadh' },
      { stop_type: 'Dropoff', location_name: 'Jeddah' },
    ],
    ...overrides,
  } as unknown as Trip;
}

describe('useTripWhatsAppShare', () => {
  let openSpy: any;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('starts closed with no trips selected and an empty custom phone', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    expect(result.current.whatsappDialogOpen).toBe(false);
    expect(result.current.whatsappSelectedTrips).toEqual([]);
    expect(result.current.whatsappCustomPhone).toBe('');
  });

  it('opening for a single trip with a driver phone selects the driver as recipient and opens the dialog', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    const trip = makeTrip();

    act(() => {
      result.current.openWhatsappShare([trip]);
    });

    expect(result.current.whatsappDialogOpen).toBe(true);
    expect(result.current.whatsappSelectedTrips).toEqual([trip]);
    expect(result.current.whatsappRecipientType).toBe('driver');
  });

  it('opening for a single unassigned trip with only a customer phone selects the customer as recipient', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    const trip = makeTrip({ driver: undefined } as Partial<Trip>);

    act(() => {
      result.current.openWhatsappShare([trip]);
    });

    expect(result.current.whatsappRecipientType).toBe('customer');
  });

  it('setWhatsappDialogOpen(false) closes the dialog', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());

    act(() => {
      result.current.openWhatsappShare([makeTrip()]);
    });
    expect(result.current.whatsappDialogOpen).toBe(true);

    act(() => {
      result.current.setWhatsappDialogOpen(false);
    });
    expect(result.current.whatsappDialogOpen).toBe(false);
  });

  it('composes a single-trip manifest message for a scheduled trip', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    const trip = makeTrip();

    act(() => {
      result.current.openWhatsappShare([trip]);
    });

    expect(result.current.whatsappMessageText).toContain('Acme Co');
    expect(result.current.whatsappMessageText).toContain('Riyadh');
    expect(result.current.whatsappMessageText).toContain('Jeddah');
  });

  it('composes a multi-trip manifest summary when more than one trip is selected', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    const trips = [makeTrip({ id: 't1', ref_id: 'TRP-1' }), makeTrip({ id: 't2', ref_id: 'TRP-2' })];

    act(() => {
      result.current.openWhatsappShare(trips);
    });

    expect(result.current.whatsappMessageText).toContain('Manifest Summary');
    expect(result.current.whatsappMessageText).toContain('TRP-1');
    expect(result.current.whatsappMessageText).toContain('TRP-2');
  });

  it('handleWhatsappSend opens a WhatsApp URL with the driver phone and closes the dialog', () => {
    const { result } = renderHook(() => useTripWhatsAppShare());
    const trip = makeTrip();

    act(() => {
      result.current.openWhatsappShare([trip]);
    });
    act(() => {
      result.current.handleWhatsappSend();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0];
    expect(String(url)).toContain('api.whatsapp.com/send?phone=966500000001');
    expect(result.current.whatsappDialogOpen).toBe(false);
  });
});
