import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tripService, BulkImportTripRow, BulkImportResult, TripStatus } from '@/services/tripService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { parseCSVFile } from '@/utils/exportUtils';
import { parseSheet, TRIP_COLUMNS } from '@/utils/importUtils';
import { analyzePastDateRows, applyPastStatusToRows, PastDateAnalysis } from '@/utils/pastDateTripUtils';

const IMPORT_FIELD_ALIASES: Partial<Record<keyof BulkImportTripRow, string[]>> = {
  customer_name: ['customer_name', 'customer', 'client', 'client_name'],
  driver_name: ['driver_name', 'driver'],
  vehicle_plate: ['vehicle_plate', 'vehicle', 'plate_number', 'plate'],
  planned_start: ['planned_start', 'planned_start_date', 'start_date', 'planned_date'],
  rate_category: ['rate_category', 'category', 'rate_type', 'trip_type'],
  vehicle_type: ['vehicle_type', 'truck_type', 'body_type', 'asset_type'],
  billing_type: ['billing_type', 'billing', 'billing_frequency'],
  origin: ['origin', 'from', 'pickup', 'starting_point'],
  destination: ['destination', 'to', 'dropoff', 'drop_off'],
  billing_amount: ['billing_amount', 'amount', 'price', 'rate', 'charges'],
  trip_charges: ['trip_charges', 'driver_payout', 'driver_charge', 'payout'],
  status: ['status', 'trip_status'],
};

function pickImportField(row: Record<string, string>, field: keyof BulkImportTripRow): string {
  const aliases = IMPORT_FIELD_ALIASES[field] || [];
  for (const alias of aliases) {
    if (row[alias]) return row[alias];
  }
  return '';
}

export function normDriverString(s: string): string {
  if (!s) return '';
  let clean = s.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  return clean.split(' ').map(t => {
    if (['mohd', 'mhd', 'md', 'mohammed', 'mohammad', 'muhammed', 'muhammad'].includes(t)) return 'muhammad';
    return t;
  }).join(' ').trim();
}

export function findDriverCandidates(rawName: string, drivers: any[]): any[] {
  if (!rawName || !rawName.trim() || !drivers.length) return [];
  const rawClean = rawName.trim();
  const normalizedInput = normDriverString(rawClean);
  const inputTokens = normalizedInput.split(' ').filter(Boolean);

  const exact = drivers.filter(d => {
    const full = `${d.first_name || ''} ${d.last_name || ''}`.trim();
    return full.toLowerCase() === rawClean.toLowerCase() || (d.first_name || '').toLowerCase() === rawClean.toLowerCase();
  });
  if (exact.length > 0) return exact;

  const normMatch = drivers.filter(d => {
    const full = normDriverString(`${d.first_name || ''} ${d.last_name || ''}`);
    const fn = normDriverString(d.first_name || '');
    return full === normalizedInput || fn === normalizedInput;
  });
  if (normMatch.length > 0) return normMatch;

  const matches = drivers.filter(d => {
    const full = normDriverString(`${d.first_name || ''} ${d.last_name || ''}`);
    const tokens = full.split(' ').filter(Boolean);
    const matchedCount = inputTokens.filter(it => tokens.some(dt => dt === it || dt.includes(it) || it.includes(dt))).length;
    return matchedCount > 0 && matchedCount === inputTokens.length;
  });

  if (matches.length > 0) return matches;

  return drivers.filter(d => {
    const full = normDriverString(`${d.first_name || ''} ${d.last_name || ''}`);
    return full.includes(normalizedInput) || normalizedInput.includes(full);
  });
}

/** Builds a BulkImportTripRow from a raw parsed row, whichever key style it came in under
 *  (parseCSVFile's snake_case header row, or parseSheet's TRIP_COLUMNS field names). */
function toImportRow(row: Record<string, string | number>): BulkImportTripRow {
  const asStrRow = row as Record<string, string>;
  const get = (field: keyof BulkImportTripRow) => {
    const direct = row[field];
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim();
    return pickImportField(asStrRow, field);
  };
  const amount = get('billing_amount');
  const payout = get('trip_charges');
  const statusRaw = get('status').trim().toLowerCase();
  const status = statusRaw === 'draft' ? 'Draft' : statusRaw === 'dispatched' ? 'Dispatched'
    : statusRaw === 'completed' ? 'Completed' : undefined;
  return {
    customer_name: get('customer_name'),
    driver_name: get('driver_name') || undefined,
    vehicle_plate: get('vehicle_plate') || undefined,
    planned_start: get('planned_start') || undefined,
    rate_category: get('rate_category') || undefined,
    vehicle_type: get('vehicle_type') || undefined,
    billing_type: get('billing_type') || undefined,
    origin: get('origin') || undefined,
    destination: get('destination') || undefined,
    billing_amount: amount ? Number(amount) : undefined,
    trip_charges: payout ? Number(payout) : undefined,
    status,
  };
}

export function downloadImportTemplate() {
  const headers = [
    'Customer Name', 'Driver Name', 'Vehicle Plate', 'Planned Start',
    'Rate Category', 'Vehicle Type', 'Billing Type', 'Origin', 'Destination',
    'Billing Amount', 'Trip Charges',
  ];
  const example = [
    'Acme Trading Co.', 'John Doe', 'ABC-1234', '2026-08-15',
    'Single Trip', '10 TON', 'Extra', 'Riyadh', 'Jeddah', '1600', '450',
  ];
  const csv = '﻿' + [headers.join(','), example.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'trips_import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * The bulk Excel/CSV trip import flow: pick a file, map ambiguous driver
 * names to real driver records, warn on past-dated rows before submitting,
 * and report per-row results. Extracted out of TripListPage as-is — same
 * state, same parsing/matching rules, same submit flow.
 */
export function useTripBulkImport() {
  const queryClient = useQueryClient();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<BulkImportTripRow[]>([]);
  const [importParseError, setImportParseError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [driverMappings, setDriverMappings] = useState<Record<string, string>>({});

  const [pastDateModalOpen, setPastDateModalOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<BulkImportTripRow[] | null>(null);
  const [pastDateAnalysis, setPastDateAnalysis] = useState<PastDateAnalysis | null>(null);

  const { data: importDriversRes } = useQuery({
    queryKey: ['import-drivers-list'],
    queryFn: () => driverService.getAll({ per_page: 200, mode: 'lookup' }),
    enabled: importDialogOpen,
  });
  const activeImportDrivers = importDriversRes?.data || [];

  const { data: importVehiclesRes } = useQuery({
    queryKey: ['import-vehicles-list'],
    queryFn: () => vehicleService.getAll({ per_page: 200, mode: 'lookup' }),
    enabled: importDialogOpen,
  });
  const activeImportVehicles = importVehiclesRes?.data || [];

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportResult(null);
    setImportParseError('');
    setImportRows([]);
    setImportFileName(file.name);

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const rawRows: Record<string, string | number>[] = isCsv
        ? await parseCSVFile(file)
        : (await parseSheet(file, TRIP_COLUMNS, 'trip')).rows;

      const normalized = rawRows.map(toImportRow).filter(row => row.customer_name);

      if (!normalized.length) {
        setImportParseError('No valid rows found. Make sure the file has a "Customer Name" column and at least one data row.');
        return;
      }
      setImportRows(normalized);
    } catch (err: any) {
      setImportParseError(err?.message || 'Could not read that file. Make sure it\'s a valid .xlsx or .csv.');
    }
  };

  const doSubmitImport = async (rowsToSubmit: BulkImportTripRow[]) => {
    try {
      setIsImporting(true);
      const result = await tripService.bulkImport(rowsToSubmit);
      setImportResult(result);
      if (result.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['trips'] });
        queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
      }
    } catch (e) {
      toast.error('Failed to import trips.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importRows.length) return;
    const rowsToSubmit: BulkImportTripRow[] = importRows.map((row) => {
      let driver_id = row.driver_id;
      if (row.driver_name && driverMappings[row.driver_name] && driverMappings[row.driver_name] !== 'none') {
        driver_id = driverMappings[row.driver_name];
      }
      return {
        ...row,
        ...(driver_id ? { driver_id } : {}),
      };
    });

    const analysis = analyzePastDateRows(rowsToSubmit);
    if (analysis.hasPastTrips) {
      setPendingImportRows(rowsToSubmit);
      setPastDateAnalysis(analysis);
      setPastDateModalOpen(true);
    } else {
      await doSubmitImport(rowsToSubmit);
    }
  };

  const handlePastDateImportConfirm = async (selectedStatus: TripStatus) => {
    if (!pendingImportRows) return;
    const finalRows = applyPastStatusToRows(pendingImportRows, selectedStatus);
    setPastDateModalOpen(false);
    setPendingImportRows(null);
    await doSubmitImport(finalRows);
  };

  const resetImportDialog = () => {
    setImportDialogOpen(false);
    setImportFileName('');
    setImportRows([]);
    setImportParseError('');
    setImportResult(null);
    setDriverMappings({});
  };

  return {
    importDialogOpen,
    setImportDialogOpen,
    importFileName,
    importRows,
    importParseError,
    isImporting,
    importResult,
    driverMappings,
    setDriverMappings,
    activeImportDrivers,
    activeImportVehicles,
    pastDateModalOpen,
    setPastDateModalOpen,
    pastDateAnalysis,
    handleImportFileChange,
    handleConfirmImport,
    handlePastDateImportConfirm,
    resetImportDialog,
  };
}
