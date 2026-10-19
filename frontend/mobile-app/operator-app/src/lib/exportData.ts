/**
 * Export the drivers or the trucks as a spreadsheet (CSV) from the phone
 * (TestFlight: "from phone I should be able to export drivers and truck
 * details"). The file goes through the share sheet — WhatsApp, mail, Files.
 * On the web build it downloads instead.
 */
import { Platform } from 'react-native';
import { api } from '@mercon/mobile-shared/lib/api';
import { placeText } from '@/features/vehicles/services/place';

type Cell = string | number | null | undefined;

const csvCell = (v: Cell) => {
  const t = v == null ? '' : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).trim();

/** Writes the CSV and opens the share sheet. A BOM first, so Excel reads Arabic names right. */
async function shareCsv(name: string, headers: string[], rows: Cell[][]): Promise<void> {
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const filename = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: filename });
}

export async function exportDrivers(): Promise<number> {
  const { data } = await api.get('/drivers', { params: { page: 1, per_page: 2000 } });
  const list = (data?.data ?? []) as any[];
  await shareCsv(
    'mercon_drivers',
    ['Driver no.', 'Name', 'Phone', 'Licence no.', 'Licence expiry', 'Status', 'Truck', 'Added'],
    list.map((d) => [
      d.ref_id,
      titleCase(`${d.first_name ?? ''} ${d.last_name ?? ''}`),
      d.phone_primary,
      d.license_number,
      day(d.license_expiry),
      d.trips?.length ? 'On trip' : d.status,
      d.assignedVehicle?.plate_number ?? d.trips?.[0]?.vehicle?.plate_number ?? '',
      day(d.createdAt),
    ]),
  );
  return list.length;
}

export async function exportVehicles(): Promise<number> {
  const { data } = await api.get('/vehicles', { params: { page: 1, per_page: 1000 } });
  const list = (data?.data ?? []) as any[];
  await shareCsv(
    'mercon_trucks',
    ['Truck no.', 'Plate', 'Type', 'Capacity (kg)', 'Odometer (km)', 'Trailer', 'Status', 'Driver', 'Driver phone', 'Location', 'Last seen', 'On trip for'],
    list.map((v) => {
      const loc = v.resolved_location;
      const hasPos = loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && (loc.latitude || loc.longitude);
      const trip = v.trips?.[0];
      return [
        v.ref_id,
        v.plate_number,
        v.asset_type,
        v.capacity_kg,
        v.current_odometer,
        v.trailer_number,
        trip ? 'On trip' : v.status,
        v.assignedDriver ? titleCase(`${v.assignedDriver.first_name ?? ''} ${v.assignedDriver.last_name ?? ''}`) : '',
        v.assignedDriver?.phone_primary,
        hasPos ? placeText(loc.latitude, loc.longitude) : '',
        hasPos && loc.formatted_time_ago !== 'Never' ? loc.formatted_time_ago : '',
        trip?.customer?.name ?? '',
      ];
    }),
  );
  return list.length;
}
