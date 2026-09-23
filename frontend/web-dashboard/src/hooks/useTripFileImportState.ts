import { useState, useRef } from 'react';
import { parseSheet, TRIP_COLUMNS } from '@/utils/importUtils';
import { BulkImportTripRow } from '@/services/tripService';
import { buildTripStops, isRoundTripCategory } from '@mercon/shared-types';

/**
 * Stops for an imported row. A "stops" column lists only the intermediate
 * stops; sending them alone made the backend treat them as the whole route
 * and silently drop the row's origin and destination. When both are present,
 * build the full route (origin → stops → destination, plus the default
 * return leg for a round-trip category). Rows using the legacy
 * "[RETURN: …]" destination text, or missing origin/destination, keep the
 * old shape and are resolved by the backend's legacy string parser.
 */
function importRowStops(stopsRaw: unknown, origin?: string, destination?: string, rateCategory?: string) {
  const parts = String(stopsRaw ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  const o = (origin ?? '').trim();
  const d = (destination ?? '').trim();
  if (o && d && !d.includes('[RETURN')) {
    return buildTripStops({
      origin: { name: o },
      intermediates: parts.map((name) => ({ name })),
      destination: { name: d },
      isRound: isRoundTripCategory(rateCategory ?? ''),
    });
  }
  return parts.map((name, idx) => ({ stop_sequence: idx + 1, stop_type: 'Rest', location_name: name }));
}

export function useTripFileImportState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Array<BulkImportTripRow>>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFileUpload = async (file: File) => {
    setImportedFile(file);
    setParseError(null);
    setIsParsing(true);
    try {
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          throw new Error('The CSV file does not contain any data rows.');
        }
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
        const rows: BulkImportTripRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map((c) => c.trim().replace(/"/g, ''));
          if (cells.length === 0 || !cells[0]) continue;

          const rowObj: any = {};
          headers.forEach((h, idx) => {
            const val = cells[idx] || '';
            if (h.includes('customer') || h.includes('company')) rowObj.customer_name = val;
            else if (h.includes('date') || h.includes('start')) rowObj.planned_start = val;
            else if (h.includes('driver') && !h.includes('payout')) rowObj.driver_name = val;
            else if (h.includes('vehicle') || h.includes('plate')) rowObj.vehicle_plate = val;
            else if (h.includes('origin') || h.includes('from')) rowObj.origin = val;
            else if (h.includes('dest') || h.includes('to')) rowObj.destination = val;
            else if (h.includes('category')) rowObj.rate_category = val;
            else if (h.includes('type')) rowObj.vehicle_type = val;
            else if (h.includes('additional') || h.includes('extra') || h.includes('surcharge')) rowObj.additional_charge = Number(val) || undefined;
            else if (h.includes('payout') || (h.includes('trip') && h.includes('charge'))) rowObj.driver_payout = Number(val) || undefined;
            else if (h.includes('amount') || h.includes('price') || h.includes('rate')) rowObj.billing_amount = Number(val) || undefined;
            else if (h.includes('stop') || h.includes('waypoint')) rowObj.stops_raw = val;
          });

          if (rowObj.stops_raw) {
            rowObj.stops = importRowStops(rowObj.stops_raw, rowObj.origin, rowObj.destination, rowObj.rate_category);
          }

          if (rowObj.customer_name) {
            rows.push(rowObj);
          }
        }
        setParsedRows(rows);
      } else {
        const result = await parseSheet(file, TRIP_COLUMNS, 'trip');
        const rows: BulkImportTripRow[] = result.rows.map((r) => {
          const parsedStops = r.stops
            ? importRowStops(
                r.stops,
                r.origin ? String(r.origin) : undefined,
                r.destination ? String(r.destination) : undefined,
                r.rate_category ? String(r.rate_category) : undefined,
              )
            : undefined;

          return {
            customer_name: String(r.customer_name || ''),
            planned_start: r.planned_start ? String(r.planned_start) : undefined,
            driver_name: r.driver_name ? String(r.driver_name) : undefined,
            vehicle_plate: r.vehicle_plate ? String(r.vehicle_plate) : undefined,
            rate_category: r.rate_category ? String(r.rate_category) : undefined,
            vehicle_type: r.vehicle_type ? String(r.vehicle_type) : undefined,
            origin: r.origin ? String(r.origin) : undefined,
            destination: r.destination ? String(r.destination) : undefined,
            billing_amount: r.billing_amount ? Number(r.billing_amount) : undefined,
            driver_payout: r.driver_payout ? Number(r.driver_payout) : undefined,
            additional_charge: r.additional_charge ? Number(r.additional_charge) : undefined,
            stops: parsedStops,
          };
        }).filter((r) => Boolean(r.customer_name));
        setParsedRows(rows);
      }
    } catch (e: any) {
      setParseError(e.message || 'Failed to read spreadsheet file');
    } finally {
      setIsParsing(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent =
      'Company Name,Trip Date,Driver Name,Vehicle Plate,Rate Category,Vehicle Type,Origin,Destination,Amount\n' +
      'ARKAN Logistics,2026-08-14,Ahmed Al-Ghamdi,KSA-1029,Standard,Flatbed,Riyadh Yard 1,Jeddah Port,3500\n' +
      'Saudi Aramco,2026-08-15,Mohammed Ali,KSA-8842,Express,Reefer,Dammam Hub,Riyadh Distribution,4200\n' +
      'SABIC Logistics,2026-08-16,,,Standard,Flatbed,Jubail Industrial,Yanbu Depot,2800\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'MERCON_Bulk_Trips_Template.csv';
    link.click();
  };

  return {
    fileInputRef,
    importedFile,
    setImportedFile,
    parsedRows,
    setParsedRows,
    parseError,
    setParseError,
    isParsing,
    handleFileUpload,
    downloadSampleCsv,
  };
}
