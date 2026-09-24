import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTripBulkImport } from './useTripBulkImport';
import { tripService } from '@/services/tripService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { parseCSVFile } from '@/utils/exportUtils';

vi.mock('@/services/tripService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/tripService')>();
  return {
    ...actual,
    tripService: { ...actual.tripService, bulkImport: vi.fn() },
  };
});

vi.mock('@/services/driverService', () => ({
  driverService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('@/services/vehicleService', () => ({
  vehicleService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('@/utils/exportUtils', () => ({
  parseCSVFile: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makeFile(name = 'trips.csv') {
  return new File(['irrelevant, since parseCSVFile is mocked'], name, { type: 'text/csv' });
}

function makeChangeEvent(file: File | undefined) {
  return {
    target: { files: file ? [file] : [], value: '' },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

describe('useTripBulkImport', () => {
  beforeEach(() => {
    vi.mocked(parseCSVFile).mockReset();
    vi.mocked(tripService.bulkImport).mockReset();
  });

  it('starts with no rows, no error, and the import dialog closed', () => {
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });
    expect(result.current.importDialogOpen).toBe(false);
    expect(result.current.importRows).toEqual([]);
    expect(result.current.importParseError).toBe('');
  });

  it('handleImportFileChange populates importRows from a valid CSV', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([
      { customer_name: 'Acme Co', driver_name: 'Sami', planned_start: '2026-01-01' },
    ]);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });

    expect(result.current.importRows).toHaveLength(1);
    expect(result.current.importRows[0].customer_name).toBe('Acme Co');
    expect(result.current.importParseError).toBe('');
  });

  it('sets importParseError when no row has a customer name', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([{ driver_name: 'Sami' }]);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });

    expect(result.current.importRows).toEqual([]);
    expect(result.current.importParseError).toContain('No valid rows found');
  });

  it('sets importParseError when the file fails to parse', async () => {
    vi.mocked(parseCSVFile).mockRejectedValue(new Error('bad file'));
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });

    expect(result.current.importParseError).toBe('bad file');
  });

  it('handleConfirmImport submits immediately when no rows are past-dated', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([
      { customer_name: 'Acme Co', planned_start: '2099-01-01' },
    ]);
    vi.mocked(tripService.bulkImport).mockResolvedValue({ imported: 1, failed: 0, results: [] } as any);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });
    await act(async () => {
      await result.current.handleConfirmImport();
    });

    expect(tripService.bulkImport).toHaveBeenCalledTimes(1);
    expect(result.current.pastDateModalOpen).toBe(false);
    await waitFor(() => expect(result.current.importResult?.imported).toBe(1));
  });

  it('handleConfirmImport opens the past-date modal instead of submitting when a row is past-dated', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([
      { customer_name: 'Acme Co', planned_start: '2020-01-01' },
    ]);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });
    await act(async () => {
      await result.current.handleConfirmImport();
    });

    expect(tripService.bulkImport).not.toHaveBeenCalled();
    expect(result.current.pastDateModalOpen).toBe(true);
    expect(result.current.pastDateAnalysis?.hasPastTrips).toBe(true);
  });

  it('handlePastDateImportConfirm applies the chosen status and submits', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([
      { customer_name: 'Acme Co', planned_start: '2020-01-01' },
    ]);
    vi.mocked(tripService.bulkImport).mockResolvedValue({ imported: 1, failed: 0, results: [] } as any);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });
    await act(async () => {
      await result.current.handleConfirmImport();
    });
    await act(async () => {
      await result.current.handlePastDateImportConfirm('Delayed' as any);
    });

    expect(tripService.bulkImport).toHaveBeenCalledTimes(1);
    const submittedRows = vi.mocked(tripService.bulkImport).mock.calls[0][0];
    expect(submittedRows[0].status).toBe('Delayed');
    expect(result.current.pastDateModalOpen).toBe(false);
  });

  it('resetImportDialog clears all import state', async () => {
    vi.mocked(parseCSVFile).mockResolvedValue([{ customer_name: 'Acme Co' }]);
    const { result } = renderHook(() => useTripBulkImport(), { wrapper });

    await act(async () => {
      result.current.setImportDialogOpen(true);
      await result.current.handleImportFileChange(makeChangeEvent(makeFile()));
    });
    expect(result.current.importRows).toHaveLength(1);

    act(() => {
      result.current.resetImportDialog();
    });

    expect(result.current.importDialogOpen).toBe(false);
    expect(result.current.importFileName).toBe('');
    expect(result.current.importRows).toEqual([]);
    expect(result.current.importParseError).toBe('');
    expect(result.current.importResult).toBeNull();
    expect(result.current.driverMappings).toEqual({});
  });
});
