import React from 'react';
import { Plus, Copy, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import RateCategorySelect from '@/components/quotations/RateCategorySelect';

export interface GridRow {
  id: string;
  customerId: string;
  date: string;
  driverId: string;
  vehicleId: string;
  rateCategory: string;
  vehicleType: string;
  origin: string;
  destination: string;
  amount: string;
}

interface TripBatchGeneratorTabProps {
  gridRows: GridRow[];
  setGridRows: React.Dispatch<React.SetStateAction<GridRow[]>>;
  generateEmptyRow: () => GridRow;
  updateGridRow: (id: string, patch: Partial<GridRow>) => void;
  duplicateGridRow: (row: GridRow) => void;
  deleteGridRow: (id: string) => void;
  handleGridSubmit: () => void;
  customers: any[];
  drivers: any[];
  vehicles: any[];
  getVehicleTypeFromCapacity: (cap?: number | null) => string;
  isPending: boolean;
}

export const TripBatchGeneratorTab: React.FC<TripBatchGeneratorTabProps> = ({
  gridRows,
  setGridRows,
  generateEmptyRow,
  updateGridRow,
  duplicateGridRow,
  deleteGridRow,
  handleGridSubmit,
  customers,
  drivers,
  vehicles,
  getVehicleTypeFromCapacity,
  isPending,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-bold text-[#111111]">Interactive Grid Entry</h4>
          <p className="text-xs text-[#6E6E80]">
            Enter multiple trip records directly. You can set individual dates, drivers, and trucks per row.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGridRows((prev) => [...prev, generateEmptyRow()])}
            className="h-8 rounded-lg border-black/10 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setGridRows((prev) => [
                ...prev,
                generateEmptyRow(),
                generateEmptyRow(),
                generateEmptyRow(),
              ])
            }
            className="h-8 rounded-lg border-black/10 text-xs font-semibold"
          >
            + Add 3 Rows
          </Button>
        </div>
      </div>

      {/* Grid Table */}
      <div className="rounded-xl border border-black/[0.08] overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-xs min-w-[760px]">
          <thead className="bg-slate-50 text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider border-b border-black/[0.06] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2">Customer *</th>
              <th className="px-3 py-2">Date *</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Vehicle</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {gridRows.map((row, idx) => (
              <tr key={row.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-1.5 text-[#9898A4] font-medium">{idx + 1}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={row.customerId}
                    onChange={(e) => updateGridRow(row.id, { customerId: e.target.value })}
                    className="w-36 h-7.5 px-2 rounded-lg border border-black/10 text-xs font-medium bg-white focus:outline-none focus:border-brand"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <DatePicker
                    value={row.date}
                    onChange={(_, dateStr) => updateGridRow(row.id, { date: dateStr })}
                    placeholder="Select date..."
                    buttonClassName="h-7.5 w-32 px-2 text-xs font-medium border-black/10 bg-white"
                    clearable={false}
                    showPresets={false}
                    minDate={new Date()}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={row.driverId}
                    onChange={(e) => updateGridRow(row.id, { driverId: e.target.value })}
                    className="w-36 h-7.5 px-2 rounded-lg border border-black/10 text-xs font-medium bg-white focus:outline-none focus:border-brand"
                  >
                    <option value="">-- Unassigned --</option>
                    {drivers.map((d) => {
                      const embeddedVeh = d.assignedVehicle && typeof d.assignedVehicle === 'object' ? (d.assignedVehicle as any) : null;
                      const vId = d.assignedVehicleId || (d as any).assigned_vehicle_id || embeddedVeh?.id;
                      const matchedVeh = vId ? vehicles.find((v) => v.id === vId) : null;
                      const capKg = embeddedVeh?.capacity_kg ?? embeddedVeh?.capacityKg ?? matchedVeh?.capacity_kg ?? (matchedVeh as any)?.capacityKg;
                      const capLabel = capKg != null ? getVehicleTypeFromCapacity(capKg) : '';
                      return (
                        <option key={d.id} value={d.id}>
                          {d.first_name} {d.last_name}{capLabel ? ` (${capLabel})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={row.vehicleId}
                    onChange={(e) => updateGridRow(row.id, { vehicleId: e.target.value })}
                    className="w-36 h-7.5 px-2 rounded-lg border border-black/10 text-xs font-medium bg-white focus:outline-none focus:border-brand"
                  >
                    <option value="">-- Unassigned --</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate_number}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <RateCategorySelect
                    value={row.rateCategory}
                    onValueChange={(val) => updateGridRow(row.id, { rateCategory: val })}
                    size="sm"
                    allowClear={false}
                    showBadgesInOptions={false}
                    className="w-32 h-7.5 bg-white text-xs font-medium"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateGridRow(row.id, { amount: e.target.value })}
                    placeholder="SAR"
                    className="w-20 h-7.5 px-2 rounded-lg border border-black/10 text-xs font-medium bg-white focus:outline-none focus:border-brand"
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => duplicateGridRow(row)}
                      className="p-1 rounded-md text-[#9898A4] hover:text-[#111111] hover:bg-charcoal-strong/[0.05]"
                      title="Duplicate Row"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGridRow(row.id)}
                      className="p-1 rounded-md text-[#9898A4] hover:text-red-600 hover:bg-red-50"
                      title="Delete Row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grid Footer */}
      <div className="flex items-center justify-between pt-2.5 border-t border-black/[0.06]">
        <p className="text-xs text-[#6E6E80]">
          Total rows: <span className="font-bold text-[#111111]">{gridRows.length}</span>
        </p>
        <Button
          disabled={isPending || gridRows.length === 0}
          onClick={handleGridSubmit}
          className="h-9 rounded-xl px-5 text-xs font-bold bg-brand hover:bg-[#d13d0d] text-white shadow-none disabled:opacity-50 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating Trips...
            </>
          ) : (
            `Create ${gridRows.length} Trips`
          )}
        </Button>
      </div>
    </div>
  );
};

export default TripBatchGeneratorTab;
