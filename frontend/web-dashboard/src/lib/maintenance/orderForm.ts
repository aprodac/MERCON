/**
 * The service order form: its lines, totals and checks. Mirrors the API
 * (services/maintenance/engine.ts): lines are before VAT, total = lines + VAT.
 */
import type { MaintenanceItemKind, MaintenanceRecord, MaintenanceStatus, MaintenanceType } from '@/services/maintenanceService';

const r2 = (n: number) => Math.round(n * 100) / 100;
export const VAT_RATE = 15;

export interface LineDraft {
  key: string;
  kind: MaintenanceItemKind;
  description: string;
  quantity: string;
  unit_price: string;
  planId: string | null;
  planTask: string | null;
}

export interface OrderDraft {
  vehicle_id: string;
  odometer: string;
  maintenance_type: MaintenanceType;
  system: string;
  workshop_name: string;
  workshop_contact: string;
  status: MaintenanceStatus;
  start_date: string;
  expected_end_date: string;
  end_date: string;
  lines: LineDraft[];
  vat_on: boolean;
  vat_amount: string;
  /** VAT follows 15% of the lines until typed over. */
  vat_auto: boolean;
  payment_status: 'Paid' | 'Pending';
  payment_account_id: string;
  invoice_number: string;
  notes: string;
}

let seq = 0;
export const newLine = (kind: MaintenanceItemKind, patch: Partial<LineDraft> = {}): LineDraft => ({
  key: `l${++seq}`,
  kind,
  description: '',
  quantity: '1',
  unit_price: '',
  planId: null,
  planTask: null,
  ...patch,
});

export const lineAmount = (l: Pick<LineDraft, 'quantity' | 'unit_price'>) => r2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0));

export function draftTotals(d: Pick<OrderDraft, 'lines' | 'vat_on' | 'vat_amount' | 'vat_auto'>) {
  const net = r2(d.lines.reduce((t, l) => t + lineAmount(l), 0));
  const parts = r2(d.lines.filter((l) => l.kind === 'part').reduce((t, l) => t + lineAmount(l), 0));
  const labour = r2(d.lines.filter((l) => l.kind === 'labour').reduce((t, l) => t + lineAmount(l), 0));
  const vat = !d.vat_on ? 0 : d.vat_auto ? r2((net * VAT_RATE) / 100) : r2(Number(d.vat_amount) || 0);
  return { net, parts, labour, other: r2(net - parts - labour), vat, total: r2(net + vat) };
}

/** What stops saving, in the order to fix it. `today` is YYYY-MM-DD. */
export function orderProblems(d: OrderDraft, today: string): string[] {
  const out: string[] = [];
  if (!d.vehicle_id) out.push('Choose the truck.');
  if (!d.workshop_name.trim()) out.push('Enter the workshop.');
  if (d.odometer !== '' && !(Number(d.odometer) >= 0)) out.push('The odometer must be a number.');
  if (d.status === 'Completed' && d.lines.some((l) => l.planId) && !(Number(d.odometer) > 0)) out.push('Enter the odometer: planned services are tracked by km.');
  if (d.status !== 'Completed' && d.start_date && d.start_date < today) out.push('An open or booked order can’t start in the past. Mark it done to log an older service.');
  if (d.expected_end_date && d.start_date && d.expected_end_date < d.start_date) out.push('Back-by date is before the in date.');
  if (d.end_date && d.start_date && d.end_date < d.start_date) out.push('Out date is before the in date.');
  if (d.lines.some((l) => !l.description.trim())) out.push('Every cost line needs a description.');
  if (d.lines.some((l) => !(Number(l.quantity) > 0))) out.push('Quantities must be above zero.');
  if (d.lines.some((l) => Number(l.unit_price) < 0)) out.push('Prices can’t be negative.');
  const t = draftTotals(d);
  if (t.vat > 0 && t.net <= 0) out.push('Add the cost lines before the VAT.');
  return out;
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

/** A saved order as a draft for editing. */
export function draftFrom(r: MaintenanceRecord): Partial<OrderDraft> {
  const vat = Number(r.vat_amount ?? 0);
  return {
    vehicle_id: r.vehicleId,
    odometer: r.odometer_reading ? String(r.odometer_reading) : '',
    maintenance_type: r.maintenance_type,
    system: r.system || 'others',
    workshop_name: r.workshop_name,
    workshop_contact: r.workshop_contact ?? '',
    status: r.status === ('In Progress' as MaintenanceStatus) ? 'In_Progress' : r.status,
    start_date: day(r.start_date),
    expected_end_date: day(r.expected_end_date),
    end_date: day(r.end_date),
    lines: (r.items ?? []).map((i) =>
      newLine(i.kind, { description: i.description, quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_price)), planId: i.servicePlanId ?? null, planTask: i.servicePlan?.task ?? null }),
    ),
    vat_on: vat > 0,
    vat_amount: vat > 0 ? String(vat) : '',
    vat_auto: false,
    payment_status: r.payment_status ?? 'Paid',
    payment_account_id: r.paymentAccountId ?? '',
    invoice_number: r.invoice_number ?? '',
    notes: r.work_done ?? r.remarks ?? '',
  };
}
