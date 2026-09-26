import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  RotateCcw,
  Plus,
  CheckCircle2,
  Package,
  Radio,
  Layers,
  Container,
  Flame,
  ThermometerSnowflake,
  Box,
  AlertCircle,
  UserRound,
  UploadCloud,
  FileText,
  X,
  ShieldCheck
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import QuickCreateDriverModal from '@/components/trips/QuickCreateDriverModal';
import { vehicleService, AssetType, CreateVehiclePayload } from '@/services/vehicleService';
import { driverService, Driver } from '@/services/driverService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useFormKeyboardShortcuts } from '@/hooks/useFormKeyboardShortcuts';
import { KbdBadge } from '@/components/ui/KbdBadge';
import VehicleImageUploader from '@/components/ui/VehicleImageUploader';

const EMPTY_FORM = {
  plate_number: '',
  asset_type: 'Flatbed' as AssetType,
  capacity_kg: '20000',
  trailer_number: '',
  trailer_type: 'Flatbed' as AssetType,
  trailer_capacity_kg: '',
  icces_device_id: '',
  assigned_driver_id: '',
  image_url: null as string | null,
};

export interface VehicleDocumentFile {
  id: string;
  name: string;
  size: string;
  type: string;
}

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [hasTrailer, setHasTrailer] = useState(false);
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [files, setFiles] = useState<VehicleDocumentFile[]>([]);

  const { data: driversRes, refetch: refetchDrivers } = useQuery({
    queryKey: ['drivers-select'],
    queryFn: () => driverService.getAll({ per_page: 200, mode: 'lookup' }),
  });

  const unassignedDrivers = (driversRes?.data || []).filter((d) => !d.assignedVehicleId);
  const driverOptions = unassignedDrivers.map((d) => ({
    value: d.id,
    label: `${d.first_name} ${d.last_name} (${d.license_number})`,
    keywords: `${d.first_name} ${d.last_name} ${d.license_number} ${d.phone_primary}`,
  }));

  const assignedDriver = (driversRes?.data || []).find((d) => d.id === formData.assigned_driver_id);

  const handleDriverCreated = (newDriver: Driver) => {
    refetchDrivers();
    setFormData((prev) => ({ ...prev, assigned_driver_id: newDriver.id }));
  };

  const assignDriverMutation = useMutation({
    mutationFn: ({ driverId, vehicleId }: { driverId: string; vehicleId: string }) =>
      driverService.update(driverId, { assigned_vehicle_id: vehicleId }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateVehiclePayload) => vehicleService.create(payload),
    onSuccess: async (newVehicle) => {
      if (formData.assigned_driver_id) {
        try {
          await assignDriverMutation.mutateAsync({ driverId: formData.assigned_driver_id, vehicleId: newVehicle.id });
          queryClient.invalidateQueries({ queryKey: ['drivers'] });
        } catch {
          setError('Vehicle registered, but driver could not be assigned. Assign them from Drivers page.');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-performance'] });
      navigate('/vehicles');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to add vehicle');
    },
  });

  const handleChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const uploadedFiles = Array.from(e.target.files).map((f, i) => ({
        id: String(Date.now() + i),
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type || 'Document',
      }));
      setFiles((prev) => [...prev, ...uploadedFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleReset = () => {
    setFormData(EMPTY_FORM);
    setHasTrailer(false);
    setFiles([]);
    setError(null);
  };

  const cleanSaudiPlate = (plate: string) => {
    return plate.trim().toUpperCase();
  };

  const validateSaudiPlate = (plate: string) => {
    const clean = cleanSaudiPlate(plate);
    return clean.length >= 2 && /^[A-Z0-9\s_-]{2,20}$/i.test(clean);
  };

  const tractorCap = Number(formData.capacity_kg) || 0;
  const trailerCap = hasTrailer ? (Number(formData.trailer_capacity_kg) || 0) : 0;
  const totalCapacity = tractorCap + trailerCap;

  const isPlateValid = validateSaudiPlate(formData.plate_number);
  const isTrailerValid = !hasTrailer || validateSaudiPlate(formData.trailer_number);

  const isFormValid = isPlateValid && tractorCap > 0 && isTrailerValid;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!formData.plate_number.trim()) return setError('Plate number is required');
    if (!isPlateValid) return setError('Invalid vehicle plate number (e.g. DRA-6484 or 1234 ABC).');
    if (!formData.capacity_kg || tractorCap <= 0) return setError('Valid tractor capacity (kg) is required');
    if (hasTrailer && !formData.trailer_number.trim()) return setError('Trailer plate number is required when a trailer is attached');
    if (hasTrailer && !isTrailerValid) return setError('Invalid trailer plate number.');

    const payload: CreateVehiclePayload = {
      plate_number: cleanSaudiPlate(formData.plate_number),
      asset_type: formData.asset_type,
      capacity_kg: tractorCap,
      icces_device_id: formData.icces_device_id || undefined,
      image_url: formData.image_url || undefined,
      trailer_number: hasTrailer && formData.trailer_number ? cleanSaudiPlate(formData.trailer_number) : undefined,
      trailer_type: hasTrailer ? formData.trailer_type : undefined,
      trailer_capacity_kg: hasTrailer && formData.trailer_capacity_kg ? Number(formData.trailer_capacity_kg) : undefined,
    };

    createMutation.mutate(payload);
  };

  const getAssetIcon = (type: AssetType) => {
    switch (type) {
      case 'Reefer': return <ThermometerSnowflake className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
      case 'Tanker': return <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'Box': return <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case 'Flatbed':
      default: return <Container className="w-4 h-4 text-brand" />;
    }
  };

  // Completion Tracking
  const completionFields = [
    { label: 'Plate Number', filled: formData.plate_number.trim() !== '' },
    { label: 'Tractor Capacity', filled: tractorCap > 0 },
    { label: 'Trailer Config', filled: !hasTrailer || formData.trailer_number.trim() !== '' },
    { label: 'Telematics / GPS', filled: formData.icces_device_id.trim() !== '' },
  ];
  const filledCount = completionFields.filter(f => f.filled).length;
  const completionPct = Math.round((filledCount / completionFields.length) * 100);

  // Keyboard Shortcuts Integration
  useFormKeyboardShortcuts({
    onSave: () => {
      if (isFormValid) handleSubmit();
    },
    onCancel: () => navigate('/vehicles'),
    isSubmitting: createMutation.isPending,
  });

  return (
    <DashboardLayout active="Vehicles" title="Register New Vehicle">
      <div className="px-3 sm:px-5 pb-4 space-y-3 animate-fade-in max-w-[1350px] mx-auto">
        
        {/* Slim Top Action Strip */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400 font-bold border-none text-[11px] px-2 py-0.5">
              <Truck className="w-3 h-3 mr-1 inline text-blue-600" /> New Vehicle
            </Badge>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">• Fleet Operations</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleReset}
              className="h-7 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 px-2"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/vehicles')}
              className="h-7 text-xs font-medium border-slate-200 dark:border-slate-800 px-2.5"
            >
              Cancel <KbdBadge keys="Esc" />
            </Button>
            <Button 
              size="sm" 
              onClick={handleSubmit}
              disabled={createMutation.isPending || !isFormValid}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 shadow-xs"
            >
              {createMutation.isPending ? 'Registering...' : 'Register Vehicle'} <KbdBadge keys="Ctrl+S" />
            </Button>
          </div>
        </div>

        {/* 2-Column Balanced Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* Main Form Column (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs">
              <CardContent className="p-3.5 sm:p-4 space-y-3.5">

                {/* Section 1: Primary Asset Identifier */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-brand" /> Primary Asset Identifier
                    </h2>
                    <span className="text-[10px] text-slate-400 font-mono">* Required fields</span>
                  </div>

                  <VehicleImageUploader
                    value={formData.image_url}
                    onChange={(url) => handleChange('image_url', url || '')}
                    plateNumber={formData.plate_number}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="plate_number" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Saudi License Plate <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="plate_number"
                        autoFocus
                        placeholder="e.g. ABC 1234"
                        value={formData.plate_number}
                        onChange={(e) => handleChange('plate_number', e.target.value.toUpperCase())}
                        className="h-8 text-xs font-mono font-bold uppercase"
                      />
                      {formData.plate_number.trim() !== '' && !isPlateValid && (
                        <p className="text-[10px] text-rose-500 font-semibold mt-0.5">
                          Please enter a valid plate number (e.g. DRA-6484 or 1234 ABC).
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="asset_type" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Asset Classification <span className="text-rose-500">*</span>
                      </Label>
                      <Select
                        value={formData.asset_type}
                        onValueChange={(val) => handleChange('asset_type', val as AssetType)}
                      >
                        <SelectTrigger id="asset_type" className="h-8 text-xs">
                          <SelectValue placeholder="Select class type..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Flatbed" className="text-xs">Flatbed Tractor Unit</SelectItem>
                          <SelectItem value="Reefer" className="text-xs">Reefer / Coldchain Unit</SelectItem>
                          <SelectItem value="Box" className="text-xs">Box Truck (Dry Van)</SelectItem>
                          <SelectItem value="Tanker" className="text-xs">Liquid Tanker Unit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Payload & Telematics */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-blue-500" /> Payload & Telematics
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="capacity_kg" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Tractor Payload (kg) <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="capacity_kg"
                        type="number"
                        placeholder="e.g. 25000"
                        value={formData.capacity_kg}
                        onChange={(e) => handleChange('capacity_kg', e.target.value)}
                        className="h-8 text-xs font-mono font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="icces_device_id" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Saudi ICCES ID (GPS Tracker)
                      </Label>
                      <Input
                        id="icces_device_id"
                        placeholder="ICCES-9988-TRACK"
                        value={formData.icces_device_id}
                        onChange={(e) => handleChange('icces_device_id', e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Optional Trailer Configuration */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-500" /> Trailer Unit Attachment
                    </h2>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasTrailer}
                        onChange={(e) => setHasTrailer(e.target.checked)}
                        className="rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                      />
                      <span>Attach Trailer</span>
                    </label>
                  </div>

                  {hasTrailer && (
                    <div className="p-2.5 rounded-lg border border-purple-200 bg-purple-50/20 dark:bg-purple-950/20 dark:border-purple-900/40 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="trailer_number" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Trailer Plate No. <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          id="trailer_number"
                          placeholder="e.g. TRL-8899"
                          value={formData.trailer_number}
                          onChange={(e) => handleChange('trailer_number', e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono font-bold uppercase"
                        />
                        {formData.trailer_number.trim() !== '' && !isTrailerValid && (
                          <p className="text-[10px] text-rose-500 font-semibold mt-0.5">
                            Must be 1-4 digits followed by 3 letters (e.g. 1234 ABC).
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="trailer_type" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Trailer Type
                        </Label>
                        <Select
                          value={formData.trailer_type}
                          onValueChange={(val) => handleChange('trailer_type', val as AssetType)}
                        >
                          <SelectTrigger id="trailer_type" className="h-8 text-xs">
                            <SelectValue placeholder="Trailer type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Flatbed" className="text-xs">Flatbed Trailer</SelectItem>
                            <SelectItem value="Reefer" className="text-xs">Reefer Trailer</SelectItem>
                            <SelectItem value="Box" className="text-xs">Box Trailer</SelectItem>
                            <SelectItem value="Tanker" className="text-xs">Tanker Trailer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="trailer_capacity_kg" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Trailer Capacity (kg)
                        </Label>
                        <Input
                          id="trailer_capacity_kg"
                          type="number"
                          placeholder="e.g. 15000"
                          value={formData.trailer_capacity_kg}
                          onChange={(e) => handleChange('trailer_capacity_kg', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 4: Assign Driver */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 text-emerald-600" /> Driver Assignment
                    </h2>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsAddDriverOpen(true)}
                      className="h-6 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2"
                    >
                      <Plus className="w-3 h-3 mr-1" /> New Driver
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Combobox
                      id="assigned_driver_id"
                      value={formData.assigned_driver_id}
                      onChange={(val) => handleChange('assigned_driver_id', val)}
                      options={[
                        { value: '', label: '-- Unassigned (Assign Later) --' },
                        ...driverOptions,
                      ]}
                      placeholder="Search unassigned drivers..."
                      searchPlaceholder="Search by name, license, or phone..."
                      emptyText="No unassigned drivers found."
                      triggerClassName="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-medium w-full"
                    />
                    <p className="text-[10px] text-slate-400">
                      Only drivers not assigned to another vehicle are listed.
                    </p>
                  </div>
                </div>

                {/* Section 5: Vehicle Documents & Attachments */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" /> Vehicle Documents ({files.length})
                    </h2>
                    <span className="text-[10px] text-slate-400 font-medium">Istimara, Inspection (Fahs), Insurance</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <label className="sm:col-span-5 border border-dashed border-slate-300 dark:border-slate-700 hover:border-brand dark:hover:border-brand rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/50 block">
                      <input type="file" multiple onChange={handleFileUpload} className="hidden" />
                      <UploadCloud className="w-4 h-4 mx-auto text-slate-400 mb-0.5" />
                      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Upload Documents
                      </p>
                      <p className="text-[9px] text-slate-400">PDF, PNG, JPG (Max 10MB)</p>
                    </label>

                    <div className="sm:col-span-7 space-y-1 max-h-[100px] overflow-y-auto pr-1">
                      {files.length === 0 ? (
                        <div className="p-2 border border-slate-100 dark:border-slate-800 rounded-md text-[10px] text-slate-400 italic text-center">
                          No vehicle documents attached yet
                        </div>
                      ) : (
                        files.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-1.5 px-2 bg-slate-100/70 dark:bg-slate-800/60 rounded-md border border-slate-200/60 dark:border-slate-700/60 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                              <span className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">{file.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono shrink-0">({file.size})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(file.id)}
                              className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {error && (
              <div className="p-2.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right Sidebar Column (4 cols) */}
          <div className="lg:col-span-4 space-y-3 sticky top-2">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Vehicle Summary</span>
                <Badge variant="outline" className="text-[10px] font-mono text-brand border-orange-200">
                  {completionPct}% Complete
                </Badge>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 text-brand dark:bg-orange-950/40 flex items-center justify-center font-bold text-xs shrink-0 border border-orange-200 dark:border-orange-900/50">
                    {getAssetIcon(formData.asset_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 truncate">
                      {formData.plate_number || 'ABC 1234'}
                    </p>
                    <span className="text-[10px] text-slate-500 block">
                      {formData.asset_type} • {totalCapacity.toLocaleString()} kg payload
                    </span>
                  </div>
                </div>

                {/* Driver Assignment Details */}
                <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Assigned Driver</span>
                  <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    {assignedDriver ? `${assignedDriver.first_name} ${assignedDriver.last_name}` : 'Unassigned (Float unit)'}
                  </p>
                </div>

                {/* Trailer Details */}
                {hasTrailer && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">Attached Trailer</span>
                    <p className="text-[11px] font-mono font-bold text-purple-700 dark:text-purple-300 truncate">
                      {formData.trailer_number || 'Trailer Plate Pending'} ({trailerCap.toLocaleString()} kg)
                    </p>
                  </div>
                )}

                {/* Documents Summary */}
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-semibold">Attached Documents</span>
                  <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 h-4">
                    {files.length} {files.length === 1 ? 'File' : 'Files'}
                  </Badge>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                  <span>Requirements</span>
                  <span>{filledCount} of {completionFields.length}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-brand h-full transition-all duration-300 rounded-full"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>

              <Button 
                size="sm" 
                onClick={handleSubmit} 
                disabled={createMutation.isPending || !isFormValid}
                className="w-full h-8 text-xs bg-brand hover:bg-brand-hover text-white font-bold shadow-xs mt-1"
              >
                {createMutation.isPending ? 'Registering...' : 'Register Vehicle'}
              </Button>
            </Card>
          </div>

        </div>
      </div>

      <QuickCreateDriverModal
        isOpen={isAddDriverOpen}
        onClose={() => setIsAddDriverOpen(false)}
        onCreated={handleDriverCreated}
      />
    </DashboardLayout>
  );
}
