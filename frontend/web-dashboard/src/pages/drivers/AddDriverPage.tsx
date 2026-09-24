import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Truck,
  RotateCcw,
  Plus,
  ShieldCheck,
  AlertCircle,
  FileText,
  UploadCloud,
  X,
  CheckCircle2,
  Building2,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import QuickCreateVehicleModal from '@/components/trips/QuickCreateVehicleModal';
import { driverService, CreateDriverPayload } from '@/services/driverService';
import { vehicleService, Vehicle } from '@/services/vehicleService';
import { Card, CardContent } from '@/components/ui/card';
import PhoneInput from '@/components/ui/PhoneInput';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Combobox } from '@/components/ui/combobox';
import DriverImageUploader from '@/components/ui/DriverImageUploader';
import { getDriverAvatar } from '@/lib/driverAvatarMap';
import { useFormKeyboardShortcuts } from '@/hooks/useFormKeyboardShortcuts';
import { KbdBadge } from '@/components/ui/KbdBadge';

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  phone_primary: '',
  license_number: '',
  license_expiry: '',
  assigned_vehicle_id: '',
  avatar_url: null as string | null,
};

export interface DriverDocumentFile {
  id: string;
  name: string;
  size: string;
  type: string;
}

export default function AddDriverPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [files, setFiles] = useState<DriverDocumentFile[]>([]);

  const { data: vehiclesRes, refetch: refetchVehicles } = useQuery({
    queryKey: ['vehicles-select'],
    queryFn: () => vehicleService.getAll({ per_page: 100, mode: 'lookup' }),
  });

  const vehicles = vehiclesRes?.data || [];
  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.plate_number} (${v.asset_type} • ${v.capacity_kg ? `${v.capacity_kg.toLocaleString()} kg` : 'N/A'})`,
    keywords: `${v.plate_number} ${v.asset_type}`,
  }));

  const assignedVehicle = vehicles.find((v) => v.id === formData.assigned_vehicle_id);

  const handleVehicleCreated = (newVehicle: Vehicle) => {
    refetchVehicles();
    setFormData((prev) => ({ ...prev, assigned_vehicle_id: newVehicle.id }));
  };

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
    setFiles([]);
    setError(null);
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateDriverPayload) => driverService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-performance'] });
      navigate('/drivers');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create driver');
    },
  });

  const validateSaudiPhone = (phone: string) => {
    const clean = phone.replace(/[\s-]/g, '');
    return /^(\+966|00966|0)?5\d{8}$/.test(clean);
  };

  const validateSaudiLicense = (license: string) => {
    return /^[12]\d{9}$/.test(license.trim());
  };

  const isExpiryValid = formData.license_expiry ? new Date(formData.license_expiry) > new Date() : false;
  const isExpired = formData.license_expiry !== '' && !isExpiryValid;
  const isPhoneValid = validateSaudiPhone(formData.phone_primary);
  const isLicenseValid = validateSaudiLicense(formData.license_number);

  const isFormValid =
    formData.first_name.trim() !== '' &&
    formData.last_name.trim() !== '' &&
    isPhoneValid &&
    isLicenseValid &&
    formData.license_expiry !== '' &&
    isExpiryValid;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!formData.first_name.trim()) return setError('First name is required');
    if (!formData.last_name.trim()) return setError('Last name is required');
    if (!formData.phone_primary.trim()) return setError('Primary phone number is required');
    if (!isPhoneValid) return setError('Invalid Saudi phone number. Must start with 5 and be exactly 9 digits.');
    if (!formData.license_number.trim()) return setError('License number is required');
    if (!isLicenseValid) return setError('Invalid Saudi ID/Iqama/License. Must be exactly 10 digits starting with 1 or 2.');
    if (!formData.license_expiry) return setError('License expiry date is required');
    if (!isExpiryValid) {
      return setError('License is already expired. Only drivers with a valid, future-dated license can be added.');
    }

    createMutation.mutate({
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      phone_primary: formData.phone_primary.trim(),
      license_number: formData.license_number.trim(),
      license_expiry: formData.license_expiry,
      assigned_vehicle_id: formData.assigned_vehicle_id || undefined,
      avatar_url: formData.avatar_url || undefined,
    });
  };

  // Completion Tracking
  const completionFields = [
    { label: 'First Name', filled: formData.first_name.trim() !== '' },
    { label: 'Last Name', filled: formData.last_name.trim() !== '' },
    { label: 'Saudi Phone Number', filled: formData.phone_primary.trim() !== '' && isPhoneValid },
    { label: 'Saudi License Number', filled: formData.license_number.trim() !== '' && isLicenseValid },
    { label: 'License Expiry', filled: formData.license_expiry !== '' && isExpiryValid },
  ];
  const filledCount = completionFields.filter(f => f.filled).length;
  const completionPct = Math.round((filledCount / completionFields.length) * 100);

  // Keyboard Shortcuts Integration
  useFormKeyboardShortcuts({
    onSave: () => {
      if (isFormValid) handleSubmit();
    },
    onCancel: () => navigate('/drivers'),
    isSubmitting: createMutation.isPending,
  });

  return (
    <DashboardLayout active="Drivers" title="Add New Driver">
      <div className="px-3 sm:px-5 pb-4 space-y-3 animate-fade-in max-w-[1350px] mx-auto">
        
        {/* Slim Top Action Strip */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 font-bold border-none text-[11px] px-2 py-0.5">
              <User className="w-3 h-3 mr-1 inline text-emerald-600" /> New Driver
            </Badge>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">• Fleet Human Capital</span>
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
              onClick={() => navigate('/drivers')}
              className="h-7 text-xs font-medium border-slate-200 dark:border-slate-800 px-2.5"
            >
              Cancel <KbdBadge keys="Esc" />
            </Button>
            <Button 
              size="sm" 
              onClick={handleSubmit}
              disabled={createMutation.isPending || !isFormValid}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 shadow-xs"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Driver'} <KbdBadge keys="Ctrl+S" />
            </Button>
          </div>
        </div>

        {/* 2-Column Balanced Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* Main Form Column (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs">
              <CardContent className="p-3.5 sm:p-4 space-y-3.5">

                {/* Section 1: Personal Profile & Photo */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-brand" /> Personal Profile
                    </h2>
                    <span className="text-[10px] text-slate-400 font-mono">* Required fields</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Photo Uploader */}
                    <div className="shrink-0">
                      <DriverImageUploader
                        value={formData.avatar_url}
                        onChange={(url) => setFormData((prev) => ({ ...prev, avatar_url: url }))}
                        firstName={formData.first_name}
                        lastName={formData.last_name}
                      />
                    </div>

                    {/* Name & Phone Inputs */}
                    <div className="flex-1 w-full space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label htmlFor="first_name" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            First Name <span className="text-rose-500">*</span>
                          </Label>
                          <Input
                            id="first_name"
                            type="text"
                            autoFocus
                            placeholder="e.g. Ahmed"
                            value={formData.first_name}
                            onChange={(e) => handleChange('first_name', e.target.value)}
                            className="h-8 text-xs font-medium"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="last_name" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Last Name <span className="text-rose-500">*</span>
                          </Label>
                          <Input
                            id="last_name"
                            type="text"
                            placeholder="e.g. Al-Mansoor"
                            value={formData.last_name}
                            onChange={(e) => handleChange('last_name', e.target.value)}
                            className="h-8 text-xs font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="phone_primary" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Primary Phone Number <span className="text-rose-500">*</span>
                        </Label>
                        <PhoneInput
                          id="phone_primary"
                          value={formData.phone_primary}
                          onChange={(val) => handleChange('phone_primary', val)}
                          placeholder="50 000 0000"
                        />
                        {formData.phone_primary.trim() !== '' && !isPhoneValid && (
                          <p className="text-[10px] text-rose-500 font-semibold mt-0.5">
                            Must start with 5 and be exactly 9 digits.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Commercial Saudi License */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Commercial Driving License
                    </h2>
                    {formData.license_expiry && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                          isExpiryValid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                      >
                        {isExpiryValid ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Valid Future Expiry</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            <span>Expired License</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="license_number" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Saudi License ID <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="license_number"
                        type="text"
                        placeholder="e.g. 10XXXXXXXX"
                        value={formData.license_number}
                        onChange={(e) => handleChange('license_number', e.target.value)}
                        className="h-8 text-xs font-mono font-medium"
                      />
                      {formData.license_number.trim() !== '' && !isLicenseValid && (
                        <p className="text-[10px] text-rose-500 font-semibold mt-0.5">
                          Must be exactly 10 digits starting with 1 or 2.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="license_expiry" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        License Expiry Date <span className="text-rose-500">*</span>
                      </Label>
                      <DatePicker
                        id="license_expiry"
                        value={formData.license_expiry}
                        onChange={(_, dateStr) => handleChange('license_expiry', dateStr)}
                        placeholder="Select expiry date..."
                        error={isExpired}
                        minDate={new Date()}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Default Vehicle Assignment */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-brand" /> Default Vehicle Assignment
                    </h2>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsAddVehicleOpen(true)}
                      className="h-6 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Vehicle
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Combobox
                      id="assigned_vehicle_id"
                      value={formData.assigned_vehicle_id}
                      onChange={(val) => handleChange('assigned_vehicle_id', val)}
                      options={[
                        { value: '', label: '-- No default vehicle (Float Driver) --' },
                        ...vehicleOptions,
                      ]}
                      placeholder="Select default vehicle (optional)..."
                      searchPlaceholder="Search vehicles by plate or type..."
                      emptyText="No vehicles found."
                      onAddNew={() => setIsAddVehicleOpen(true)}
                      addNewLabel="Add New Vehicle"
                      triggerClassName="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-medium w-full"
                    />
                    <p className="text-[10px] text-slate-400">
                      Pre-fills automatically when this driver is assigned to a trip.
                    </p>
                  </div>
                </div>

                {/* Section 4: Driver Documents & Attachments */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" /> Driver Documents ({files.length})
                    </h2>
                    <span className="text-[10px] text-slate-400 font-medium">Iqama / ID Copy, License Copy</span>
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
                          No driver documents attached yet
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
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Driver Summary</span>
                <Badge variant="outline" className="text-[10px] font-mono text-brand border-orange-200">
                  {completionPct}% Complete
                </Badge>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                    {(() => {
                      const avatarSrc = getDriverAvatar(formData.avatar_url, `${formData.first_name} ${formData.last_name}`);
                      return avatarSrc ? (
                        <img src={avatarSrc} alt="Driver Avatar" className="w-full h-full object-cover" />
                      ) : (
                        `${formData.first_name[0] || 'D'}${formData.last_name[0] || 'R'}`
                      );
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {formData.first_name || formData.last_name ? `${formData.first_name} ${formData.last_name}`.trim() : 'New Driver Profile'}
                    </p>
                    <PhoneDisplay phone={formData.phone_primary} fallbackText="Phone pending" />
                  </div>
                </div>

                {/* License Details */}
                <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">License Status</span>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                      {formData.license_number || 'ID Not Set'}
                    </span>
                    {formData.license_expiry && (
                      <Badge className={`text-[9px] px-1.5 py-0 font-bold ${
                        isExpiryValid ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60'
                      }`}>
                        {isExpiryValid ? 'Valid' : 'Expired'}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Vehicle Details */}
                <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Assigned Vehicle</span>
                  <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    {assignedVehicle ? `${assignedVehicle.plate_number} (${assignedVehicle.asset_type})` : 'Float Driver (No assigned vehicle)'}
                  </p>
                </div>

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
                  <span>Required fields</span>
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
                {createMutation.isPending ? 'Saving...' : 'Save Driver Profile'}
              </Button>
            </Card>
          </div>

        </div>
      </div>

      {/* Modal for creating a new vehicle on-the-fly */}
      <QuickCreateVehicleModal
        isOpen={isAddVehicleOpen}
        onClose={() => setIsAddVehicleOpen(false)}
        onCreated={handleVehicleCreated}
      />
    </DashboardLayout>
  );
}
