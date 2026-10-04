import { describe, expect, it } from 'vitest';
import { buildQuotationWorkbook } from '../quotationWorkbook';

const stop = (sequence: number, name: string, id = name) => ({ sequence, locationId: id, source_label: name, location: { name } });
const q = (n: number, stops: string[], vc: string, rate: number, extra: Record<string, unknown> = {}) => ({
  id: `q${n}`, quotation_number: n, name: stops.join(' → '), vehicle_class: vc, rate, line_type: 'Single Trip',
  pricing_basis: 'Per Trip', operation_type: 'Extra', is_active: true, driver_payout: null,
  stops: stops.map((s, i) => stop(i + 1, s)), ...extra,
}) as any;

describe('quotation workbook', () => {
  const customers = [
    {
      name: 'AKS GLOBAL LOGISTICS',
      quotations: [
        q(688, ['Riyadh', 'Hofuf'], '10 TON', 1200, { driver_payout: 59 }),
        q(668, ['Riyadh', 'Buraidah', 'Hail', 'Tabuk'], '40 FEET', 5300),
        q(15, ['Hail', 'Qurayyat'], '5 TON', 14500, { pricing_basis: 'Per Month', operation_type: 'Monthly', line_type: 'Round Trip' }),
      ],
      charges: [{ id: 's1', customerId: 'c1', quotationId: null, charge_type: 'Labour charges for offloading', unit: 'per vehicle', vehicle_type: 'Lorry', rate: 150, currency: 'SAR', is_active: true } as any],
    },
    { name: 'JDL: Saudi/KSA [main]', quotations: [q(1, ['Riyadh', 'Riyadh'], '3-4 TON', 310)], charges: [] },
    { name: 'GFS LOGISTICS', quotations: [], charges: [] },
  ];

  it('has an "All customers" summary, then one sheet per customer with quotations', () => {
    const wb = buildQuotationWorkbook(customers, new Date('2026-10-04'));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['All customers', 'AKS GLOBAL LOGISTICS', 'JDL Saudi KSA main']);
    const link = wb.getWorksheet('All customers')!.getCell('A5').value as any;
    expect(link.hyperlink).toBe("#'AKS GLOBAL LOGISTICS'!A1");
  });

  it('writes routes, numbers and prices as real cells', () => {
    const ws = buildQuotationWorkbook(customers).getWorksheet('AKS GLOBAL LOGISTICS')!;
    // Per-trip rows first (sorted by route), monthly last.
    expect(ws.getCell('A5').value).toBe('QT-0668');
    expect([ws.getCell('B5').value, ws.getCell('C5').value, ws.getCell('D5').value, ws.getCell('E5').value]).toEqual(['Riyadh', 'Buraidah → Hail', 'Tabuk', 4]);
    expect(ws.getCell('I6').value).toBe(1200);
    expect(ws.getCell('K6').value).toBe(59);
    expect(ws.getCell('K5').value).toBe('at booking');
    expect(ws.getCell('H7').value).toBe('Monthly');
    expect(ws.getCell('J7').value).toBe('month');
  });

  it('writes a sample file for a visual check when asked', async () => {
    const out = process.env.QUOTATION_WORKBOOK_SAMPLE;
    if (!out) return;
    const fs = await import('node:fs');
    fs.writeFileSync(out, Buffer.from(await buildQuotationWorkbook(customers).xlsx.writeBuffer()));
  });
});
