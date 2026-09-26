import ExcelJS from 'exceljs';

/**
 * Reads the fleet import workbooks in the browser, so the operator sees exactly
 * which rows are wrong *before* anything is written. The parsed rows are posted
 * as JSON, matching the contract the trips bulk-import already uses — no file
 * upload handling or spreadsheet library on the server.
 *
 * Column headers come from the templates in `docs/templates/`, but the owner's
 * filled-in file often has them lightly edited ("Primary Phone" vs "Primary
 * Phone *"), so matching is done on a normalised header and accepts several
 * spellings per field rather than one exact string.
 */

export interface ColumnMap {
  [fieldName: string]: string[];
}

export interface ParsedSheet {
  rows: Record<string, string | number>[];
  missingColumns: string[];
  unmappedHeaders: string[];
  sheetName: string;
}

export const DRIVER_COLUMNS: ColumnMap = {
  first_name: ['first_name', 'firstname', 'first', 'given_name'],
  last_name: ['last_name', 'lastname', 'last', 'family_name', 'surname'],
  phone_primary: ['phone_primary', 'phone', 'mobile', 'primary_phone', 'phone_number', 'contact_phone'],
  phone_secondary: ['phone_secondary', 'alt_phone', 'secondary_phone', 'emergency_phone'],
  national_id: ['national_id', 'iqama', 'iqama_id', 'id_number', 'national_id_number'],
  license_number: ['license_number', 'license', 'driving_license', 'license_no'],
  license_type: ['license_type', 'class', 'license_class'],
  license_expiry: ['license_expiry', 'expiry_date', 'license_expiration'],
  date_of_birth: ['date_of_birth', 'dob', 'birth_date'],
  status: ['status', 'state', 'active_status'],
  notes: ['notes', 'remarks', 'comments'],
};

export const VEHICLE_COLUMNS: ColumnMap = {
  plate_number: ['plate_number', 'plate', 'registration', 'reg_number', 'plate_no'],
  vehicle_class: ['vehicle_class', 'class', 'type', 'vehicle_type', 'category'],
  make: ['make', 'brand', 'manufacturer'],
  model: ['model', 'vehicle_model'],
  year: ['year', 'model_year'],
  status: ['status', 'state'],
  notes: ['notes', 'remarks', 'comments'],
};

export const TRIP_COLUMNS: ColumnMap = {
  customer_name: ['customer_name', 'customer', 'client', 'client_name'],
  origin_name: ['origin_name', 'origin', 'pickup_location', 'pickup', 'from'],
  destination_name: ['destination_name', 'destination', 'dropoff_location', 'dropoff', 'to'],
  pickup_time: ['pickup_time', 'scheduled_time', 'pickup_date', 'date', 'time'],
  vehicle_plate: ['vehicle_plate', 'plate_number', 'plate', 'vehicle'],
  driver_id: ['driver_id', 'driver_ref', 'driver'],
  status: ['status', 'trip_status', 'state'],
  billing_amount: ['billing_amount', 'rate', 'price', 'amount'],
  driver_payout: ['driver_payout', 'payout', 'trip_charge'],
  additional_charge: ['additional_charge', 'extra_charge', 'surcharge', 'additional_charges'],
  stops: ['stops', 'waypoints', 'route_stops', 'intermediate_stops'],
};

export const CUSTOMER_COLUMNS: ColumnMap = {
  name: ['name', 'company_name', 'customer_name', 'client'],
  contact_phone: ['contact_phone', 'phone', 'mobile', 'primary_phone'],
  payment_terms: ['payment_terms', 'terms'],
  notes: ['notes', 'remarks'],
};

export const LOCATION_COLUMNS: ColumnMap = {
  name: ['name', 'location_name', 'site_name', 'facility'],
  address: ['address', 'street_address', 'location_address'],
  city: ['city', 'town'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'long'],
};

export const RATE_CARD_COLUMNS: ColumnMap = {
  customer_name: ['customer_name', 'customer'],
  origin_name: ['origin_name', 'origin'],
  destination_name: ['destination_name', 'destination'],
  rate: ['rate', 'billing_rate', 'price', 'amount'],
};

export const THIRD_PARTY_COLUMNS: ColumnMap = {
  name: ['name', 'vendor_name', 'carrier_name', 'supplier_name'],
  contact_person: ['contact_person', 'contact', 'primary_contact'],
  phone: ['phone', 'contact_phone', 'mobile'],
};

export const SURCHARGE_COLUMNS: ColumnMap = {
  name: ['name', 'fee_name', 'surcharge_name'],
  code: ['code', 'fee_code'],
  amount: ['amount', 'fee_amount', 'rate'],
};

/**
 * Clean up a string so "Primary Phone *" matches "primaryphone".
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Handle Excel cell values (dates, numbers, strings).
 */
export function cellToValue(val: any): string | number | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    if ('result' in val) return cellToValue((val as any).result);
    if ('text' in val) return cellToValue((val as any).text);
    if ('richText' in val && Array.isArray((val as any).richText)) {
      return (val as any).richText.map((rt: any) => rt.text).join('');
    }
  }
  const s = String(val).trim();
  return s === '' ? null : s;
}

export function findHeaderRowInMatrix(matrix: any[][], columns: ColumnMap): number | null {
  const fieldAliases = new Set(Object.values(columns).flat());
  let best: { row: number; hits: number } | null = null;

  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r] || [];
    let hits = 0;
    row.forEach((cell) => {
      const norm = normalise(String(cellToValue(cell) ?? ''));
      if (norm && fieldAliases.has(norm)) hits++;
    });

    if (hits >= 2 && (!best || hits > best.hits)) best = { row: r, hits };
  }

  return best?.row ?? null;
}

export async function parseSheet(
  file: File,
  columns: ColumnMap,
  preferSheet?: string
): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames = workbook.worksheets.map((w) => w.name);
  if (!sheetNames.length) {
    throw new Error('That file has no readable sheets.');
  }

  let targetSheetName = sheetNames[0];
  if (preferSheet) {
    const matched = sheetNames.find((s: string) => s.toLowerCase().includes(preferSheet.toLowerCase()));
    if (matched) targetSheetName = matched;
  }

  const getSheetMatrix = (sheetName: string): any[][] => {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) return [];
    const mat: any[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      mat[rowNumber - 1] = vals.map((v: any) => cellToValue(v));
    });
    return mat;
  };

  let matrix = getSheetMatrix(targetSheetName);
  let headerRowIdx = findHeaderRowInMatrix(matrix, columns);

  if (headerRowIdx === null && !preferSheet) {
    for (const sName of sheetNames) {
      const mat = getSheetMatrix(sName);
      if (findHeaderRowInMatrix(mat, columns) !== null) {
        targetSheetName = sName;
        matrix = mat;
        headerRowIdx = findHeaderRowInMatrix(mat, columns);
        break;
      }
    }
  }

  if (headerRowIdx === null) {
    throw new Error(
      `Couldn't find the column headers on sheet "${targetSheetName}". Use the MERCON template, or check the header row wasn't deleted.`
    );
  }

  const headerRow = matrix[headerRowIdx] || [];
  const indexToField = new Map<number, string>();
  const unmappedHeaders: string[] = [];

  headerRow.forEach((cellVal, colIdx) => {
    const header = normalise(String(cellToValue(cellVal) ?? ''));
    if (!header) return;
    const field = Object.entries(columns).find(([, aliases]) => aliases.includes(header))?.[0];
    if (field && !Array.from(indexToField.values()).includes(field)) {
      indexToField.set(colIdx, field);
    } else if (!field) {
      unmappedHeaders.push(String(cellToValue(cellVal) ?? ''));
    }
  });

  const foundFields = new Set(indexToField.values());
  const missingColumns = Object.keys(columns).filter((f) => !foundFields.has(f));

  const rows: Record<string, string | number>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowCells = matrix[r] || [];
    const parsed: Record<string, string | number> = {};

    indexToField.forEach((field, colIdx) => {
      const val = cellToValue(rowCells[colIdx]);
      if (val === null || String(val).trim() === '') return;
      parsed[field] = typeof val === 'number' ? val : String(val).trim();
    });

    if (Object.keys(parsed).length > 0) rows.push(parsed);
  }

  return { rows, missingColumns, unmappedHeaders, sheetName: targetSheetName };
}
