import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wrench, AlertTriangle, AlertCircle, ClipboardList, CheckCircle2, XCircle, CalendarDays, DollarSign, Phone, Truck, Gauge, Receipt } from 'lucide-react';

import WorkshopField from '@/components/fleet/WorkshopField';
import WorkDoneSelect from '@/components/maintenance/WorkDoneSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { maintenanceService, MaintenanceRecord, CreateMaintenancePayload, MaintenanceType, MaintenanceStatus, VehicleSystemCategory } from '@/services/maintenanceService';
import { vehicleService } from '@/services/vehicleService';

const TODAY_ISO = new Date().toISOString().split('T')[0];

export interface MaintenanceRecordModalVehicle {
  id: string;
  plate_number: string;
  ref_id?: string | null;
  current_odometer?: number;
}

export interface MaintenanceRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRecord?: MaintenanceRecord | null;
  /** Vehicle to pre-select when opening modal to log new maintenance */
  vehicleId?: string;
  initialVehicleId?: string;
  /** Single vehicle OR list of selected vehicles for bulk action */
  vehicles?: MaintenanceRecordModalVehicle[];
  bulkVehicles?: MaintenanceRecordModalVehicle[];
  onSuccess?: () => void;
}

export default function MaintenanceRecordModal({
  open,
  onOpenChange,
  editingRecord,
  vehicleId,
  initialVehicleId: legacyVehicleId,
  vehicles: vehiclesProp = [],
  bulkVehicles: legacyBulkVehicles = [],
  onSuccess,
}: MaintenanceRecordModalProps) {
  const initialVehicleId = vehicleId || legacyVehicleId;
  const bulkVehicles = vehiclesProp.length > 0 ? vehiclesProp : legacyBulkVehicles;
  const queryClient = useQueryClient();

  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.getAll({ per_page: 200, mode: 'lookup' }),
    enabled: open,
  });

  const vehicles = vehiclesRes?.data || [];

  const [formData, setFormData] = useState<CreateMaintenancePayload>({
    vehicle_id: '',
    workshop_name: '',
    workshop_contact: '',
    maintenance_type: 'Routine',
    system: 'others',
    status: 'Completed',
    start_date: TODAY_ISO,
    end_date: TODAY_ISO,
    work_done: '',
    odometer_reading: 0,
    cost: 0,
    invoice_number: '',
    remarks: '',
  });

  const [costInput, setCostInput] = useState<string>('');
  const [odometerInput, setOdometerInput] = useState<string>('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form state when modal opens or editing record changes
  useEffect(() => {
    if (!open) return;

    setFormError('');

    if (editingRecord) {
      setFormData({
        vehicle_id: editingRecord.vehicleId,
        workshop_name: editingRecord.workshop_name || '',
        workshop_contact: editingRecord.workshop_contact || '',
        maintenance_type: editingRecord.maintenance_type,
        system: (editingRecord.system as VehicleSystemCategory) || 'others',
        status: editingRecord.status,
        start_date: editingRecord.start_date ? editingRecord.start_date.split('T')[0] : TODAY_ISO,
        end_date: editingRecord.end_date ? editingRecord.end_date.split('T')[0] : TODAY_ISO,
        work_done: editingRecord.work_done || '',
        odometer_reading: editingRecord.odometer_reading || 0,
        cost: editingRecord.cost || 0,
        invoice_number: editingRecord.invoice_number || '',
        remarks: editingRecord.remarks || '',
      });
      setCostInput(editingRecord.cost !== undefined && editingRecord.cost !== null ? String(editingRecord.cost) : '');
      setOdometerInput(editingRecord.odometer_reading ? String(editingRecord.odometer_reading) : '');
    } else {
      const targetVehicleId = initialVehicleId || (bulkVehicles.length > 0 ? bulkVehicles[0].id : (vehicles[0]?.id || ''));
      const foundVehicle = vehicles.find((v) => v.id === targetVehicleId) || bulkVehicles.find((v) => v.id === targetVehicleId);
      const odo = foundVehicle?.current_odometer || 0;

      setFormData({
        vehicle_id: targetVehicleId,
        workshop_name: '',
        workshop_contact: '',
        maintenance_type: 'Routine',
        system: 'others',
        status: 'Completed',
        start_date: TODAY_ISO,
        end_date: TODAY_ISO,
        work_done: '',
        odometer_reading: odo,
        cost: 0,
        invoice_number: '',
        remarks: '',
      });
      setCostInput('');
      setOdometerInput(odo ? String(odo) : '');
    }
  }, [open, editingRecord?.id]);

  // Background fallback if vehicles fetch completes after open
  useEffect(() => {
    if (open && !editingRecord && !formData.vehicle_id && vehicles.length > 0) {
      const targetVehicleId = initialVehicleId || (bulkVehicles.length > 0 ? bulkVehicles[0].id : vehicles[0].id);
      const foundVehicle = vehicles.find((v) => v.id === targetVehicleId);
      const odo = foundVehicle?.current_odometer || 0;
      setFormData((prev) => ({
        ...prev,
        vehicle_id: targetVehicleId,
        odometer_reading: prev.odometer_reading || odo,
      }));
      setOdometerInput((prev) => prev || (odo ? String(odo) : ''));
    }
  }, [open, vehicles, editingRecord]);

  const handleVehicleChange = (val: string) => {
    const v = vehicles.find((item) => item.id === val);
    const newOdo = v?.current_odometer ?? formData.odometer_reading;
    setFormData((prev) => ({
      ...prev,
      vehicle_id: val,
      odometer_reading: newOdo,
    }));
    setOdometerInput(newOdo ? String(newOdo) : '');
  };

  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    queryClient.invalidateQueries({ queryKey: ['vehicle'] });
    queryClient.invalidateQueries({ queryKey: ['workshops'] });
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const isBulk = !editingRecord && bulkVehicles.length > 1;

    if (!isBulk && !formData.vehicle_id) {
      setFormError('Please select a vehicle asset.');
      return;
    }
    if (!formData.workshop_name.trim()) {
      setFormError('Workshop / service center name is required.');
      return;
    }
    if (formData.end_date && formData.start_date && formData.end_date < formData.start_date) {
      setFormError('End date cannot be before the start date.');
      return;
    }

    setIsSaving(true);

    try {
      if (editingRecord) {
        await maintenanceService.update(editingRecord.id, formData);
      } else if (isBulk) {
        for (const v of bulkVehicles) {
          await maintenanceService.create({
            ...formData,
            vehicle_id: v.id,
            odometer_reading: v.current_odometer ?? formData.odometer_reading ?? 0,
          });
        }
      } else {
        await maintenanceService.create(formData);
      }

      invalidateCache();
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || 'Failed to save maintenance record.');
    } finally {
      setIsSaving(false);
    }
  };

  const isBulk = !editingRecord && bulkVehicles.length > 1;

  const modalTitle = editingRecord
    ? 'Edit Maintenance Record'
    : isBulk
    ? `Add Maintenance (${bulkVehicles.length} Vehicles)`
    : 'Add Maintenance Record';

  return (
    <Dialog open={open} onOpenChange={(val) => !isSaving && onOpenChange(val)}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 max-h-[92vh] flex flex-col shadow-2xl">
        
        {/* Crisp Header Bar */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-3 pr-6">
            <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-brand border border-orange-200/60 dark:border-orange-900/40 shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {modalTitle}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Fill out vehicle maintenance details below.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Clean Form Body */}
        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs bg-white dark:bg-slate-950">
          
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {isBulk && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Applying maintenance to {bulkVehicles.length} vehicles:{' '}
                {bulkVehicles.map((v) => v.plate_number).join(', ')}
              </span>
            </div>
          )}

          {/* Section 1: Vehicle & Classification */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Asset &amp; Classification
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {!isBulk && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Vehicle Asset *</Label>
                  <Select
                    value={formData.vehicle_id || undefined}
                    onValueChange={handleVehicleChange}
                    disabled={!!editingRecord}
                  >
                    <SelectTrigger className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-semibold rounded-xl">
                      <SelectValue placeholder="Select Vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate_number} ({v.ref_id || 'Ref N/A'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Sectioned Two-Level Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Vehicle System *</Label>
                  <Select
                    value={formData.system || 'others'}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, system: val as VehicleSystemCategory }))}
                  >
                    <SelectTrigger className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl font-semibold">
                      <SelectValue placeholder="Select Vehicle System" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="engine">⚙️ Engine & Transmission</SelectItem>
                      <SelectItem value="axles">🔩 Axles & Suspension</SelectItem>
                      <SelectItem value="air_system">💨 Air Intake & Filtration</SelectItem>
                      <SelectItem value="brakes">🛑 Brakes & Pneumatics</SelectItem>
                      <SelectItem value="tires">🛞 Tires & Wheels</SelectItem>
                      <SelectItem value="electrical">⚡ Electrical & Battery</SelectItem>
                      <SelectItem value="others">🔧 Others / General Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Maintenance Type *</Label>
                  <Select
                    value={formData.maintenance_type}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, maintenance_type: val as MaintenanceType }))}
                  >
                    <SelectTrigger className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl font-semibold">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine">Routine Service</SelectItem>
                      <SelectItem value="Repair">Repair</SelectItem>
                      <SelectItem value="Inspection">Inspection</SelectItem>
                      <SelectItem value="Renewal">Renewal / Istimara</SelectItem>
                      <SelectItem value="Emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, status: val as MaintenanceStatus }))}
                >
                  <SelectTrigger className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Completed">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Completed</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="In_Progress">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span>In Progress</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Scheduled">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span>Scheduled</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Cancelled">
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>Cancelled</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800/80" />

          {/* Section 2: Dates, Odometer, Workshop & Cost */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Dates, Odometer &amp; Workshop
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {formData.status === 'Scheduled' ? 'Scheduled Date *' : 'Service Date *'}
                </Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => {
                    const start_date = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      start_date,
                      end_date: prev.end_date && prev.end_date < start_date ? start_date : prev.end_date,
                    }));
                  }}
                  className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {formData.status === 'Scheduled' ? 'Expected Completion' : 'Completion Date'}
                </Label>
                <Input
                  type="date"
                  value={formData.end_date || ''}
                  min={formData.start_date || undefined}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  className="h-9.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Odometer Reading (km)</Label>
                <div className="relative">
                  <Gauge className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={odometerInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOdometerInput(val);
                      const parsed = parseInt(val, 10);
                      setFormData(prev => ({ ...prev, odometer_reading: isNaN(parsed) ? 0 : parsed }));
                    }}
                    placeholder="0"
                    className="h-9.5 text-xs pl-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-mono font-semibold rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Workshop / Service Center *</Label>
                <WorkshopField
                  value={formData.workshop_name}
                  onChange={(name) => setFormData(prev => ({ ...prev, workshop_name: name }))}
                  onPick={(w) => setFormData(prev => ({
                    ...prev,
                    workshop_name: w.name,
                    workshop_contact: (w.contact !== undefined && w.contact !== null) ? w.contact : prev.workshop_contact,
                  }))}
                  placeholder="Select or enter workshop name"
                  className="h-9.5"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Workshop Contact Phone</Label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={formData.workshop_contact || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, workshop_contact: e.target.value }))}
                    placeholder="+966 5x xxx xxxx"
                    className="h-9.5 text-xs pl-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Cost / Expense (SAR)</Label>
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCostInput(val);
                      const parsed = parseFloat(val);
                      setFormData(prev => ({ ...prev, cost: isNaN(parsed) ? 0 : parsed }));
                    }}
                    placeholder="0.00"
                    className="h-9.5 text-xs pl-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-semibold rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Invoice / Bill Number</Label>
                <div className="relative">
                  <Receipt className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={formData.invoice_number || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="e.g. INV-884920"
                    className="h-9.5 text-xs pl-8 font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800/80" />

          {/* Section 3: Work Done & Notes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-brand" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Service Details &amp; Notes
              </h3>
            </div>

            {/* Selectable Service Details Field */}
            <WorkDoneSelect
              value={formData.work_done || ''}
              onChange={(text) => setFormData(prev => ({ ...prev, work_done: text }))}
            />

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Additional Remarks / Notes</Label>
              <textarea
                value={formData.remarks || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Internal notes, next service recommendations, spare parts installed..."
                rows={2.5}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-brand resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-2 shrink-0 bg-white dark:bg-slate-950">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="text-xs h-9 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="text-xs h-9 bg-brand hover:bg-[#d03c0b] text-white font-extrabold px-6 rounded-xl shadow-sm cursor-pointer"
            >
              {isSaving ? 'Saving...' : editingRecord ? 'Update Record' : 'Save Maintenance Record'}
            </Button>
          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}

export { MaintenanceRecordModal as ScheduleMaintenanceModal };
export type { MaintenanceRecordModalProps as ScheduleMaintenanceModalProps };
export type { MaintenanceRecordModalVehicle as ScheduleMaintenanceModalVehicle };
