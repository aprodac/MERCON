import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, IdCard, Phone, Calendar, Truck, FileText, Edit2, ExternalLink,
  ShieldCheck, AlertTriangle, CheckCircle2, X, ZoomIn, MapPin
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/ui/StatusBadge';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { getDriverAvatar } from '@/lib/driverAvatarMap';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { Driver } from '@/services/driverService';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

interface DriverPreviewModalProps {
  driver: Driver | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (driver: Driver) => void;
  onSelectVehicle?: (vehicle: any) => void;
}

export default function DriverPreviewModal({ driver, isOpen, onClose, onEdit, onSelectVehicle }: DriverPreviewModalProps) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const [photoZoom, setPhotoZoom] = useState(false);

  if (!driver) return null;

  const isLicenseExpired = driver.license_expiry ? new Date(driver.license_expiry) < new Date() : false;
  const daysUntilExpiry = driver.license_expiry
    ? Math.ceil((new Date(driver.license_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isLicenseExpiringSoon = !isLicenseExpired && daysUntilExpiry != null && daysUntilExpiry <= 30;

  const trips = driver.trips || [];
  const completedTripsCount = trips.filter(t => t.status === 'Completed').length;
  const totalTripsCount = trips.length;
  const assignedVehicle = driver.assignedVehicle;

  const handleOpenFullDetails = () => {
    onClose();
    navigate(`/drivers/${driver.id}`);
  };

  const handleOpenDocuments = () => {
    onClose();
    navigate(`/drivers/${driver.id}/documents`);
  };

  const handleOpenEdit = () => {
    onClose();
    if (onEdit) {
      onEdit(driver);
    } else {
      navigate(`/drivers/${driver.id}/edit`);
    }
  };

  const handleWhatsApp = () => {
    if (!driver.phone_primary) return;
    const cleanPhone = driver.phone_primary.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[92vw] p-0 overflow-hidden rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        {/* Header Strip */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <User className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                  Driver Profile Preview
                </DialogTitle>
                <StatusBadge status={driver.status} />
                <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700">
                  {driver.ref_id || `DRV-${driver.id.slice(0, 5).toUpperCase()}`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Detailed inspection card & dossier preview
              </p>
            </div>
          </div>

        </DialogHeader>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Hero Identity Banner */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-slate-50 to-white dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-indigo-500 to-emerald-500" />

            {/* Profile Avatar / Photo Container */}
            <div className="relative group shrink-0">
              <div
                className="cursor-pointer"
                onClick={() => setPhotoZoom(!photoZoom)}
                title="Click to toggle photo zoom"
              >
                <DriverAvatar
                  src={driver.avatar_url}
                  firstName={driver.first_name}
                  lastName={driver.last_name}
                  size="xl"
                  status={driver.status}
                  showStatusDot
                />
                <div className="absolute inset-0 rounded-full bg-charcoal-strong/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                  <ZoomIn className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Main Information */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {driver.first_name} {driver.last_name}
                </h2>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2 text-xs">
                <PhoneDisplay phone={driver.phone_primary} showActions variant="badge" />
                {driver.license_number && (
                  <span className="flex items-center gap-1.5 font-mono font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-slate-700 dark:text-slate-200 shadow-2xs">
                    <IdCard className="w-3.5 h-3.5 text-slate-400" />
                    {driver.license_number}
                  </span>
                )}
              </div>

              {/* License Status Banner */}
              <div className="mt-3 flex items-center justify-center sm:justify-start">
                <Badge
                  className={cn(
                    'text-[11px] font-bold px-2.5 py-0.5 flex items-center gap-1.5',
                    isLicenseExpired
                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                      : isLicenseExpiringSoon
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {isLicenseExpired
                    ? 'Saudi License Expired'
                    : isLicenseExpiringSoon
                    ? `License Expires in ${daysUntilExpiry} days`
                    : driver.license_expiry
                    ? `Valid License (Exp: ${formatInDeploymentTz(driver.license_expiry, tz, 'MM/dd/yyyy')})`
                    : 'License On File'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand" /> Duty Status
              </span>
              <div className="flex items-center gap-2 pt-0.5">
                <StatusBadge status={driver.status} />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-indigo-500" /> Assigned Vehicle
              </span>
              <div 
                className={cn(
                  "font-mono text-xs font-bold text-slate-800 dark:text-slate-200 pt-0.5",
                  assignedVehicle && "hover:text-brand cursor-pointer transition-colors underline"
                )}
                onClick={() => {
                  if (assignedVehicle) {
                    if (onSelectVehicle) onSelectVehicle(assignedVehicle);
                    else navigate(`/vehicles/${assignedVehicle.id}`);
                  }
                }}
              >
                {assignedVehicle ? assignedVehicle.plate_number : 'Unassigned'}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1 sm:col-span-2 lg:col-span-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" /> Dispatch Trips
              </span>
              <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 pt-0.5">
                {completedTripsCount} Completed / {totalTripsCount} Total
              </div>
            </div>
          </div>

          {/* Dossier Credentials Summary */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <IdCard className="w-4 h-4 text-indigo-600" /> Driver Dossier Summary
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Driver Ref:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {driver.ref_id || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Saudi License:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {driver.license_number || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">License Expiry:</span>
                <span className={cn('font-mono font-bold', isLicenseExpired ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200')}>
                  {driver.license_expiry ? formatInDeploymentTz(driver.license_expiry, tz, 'MM/dd/yyyy') : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Registration Date:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatInDeploymentTz(driver.createdAt, tz, 'MM/dd/yyyy')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {driver.phone_primary && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                className="h-8.5 text-xs font-bold gap-1.5 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400"
              >
                <WhatsAppIcon className="w-4 h-4 text-emerald-600" /> WhatsApp
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEdit}
              className="h-8.5 text-xs font-bold gap-1.5 border-slate-200 dark:border-slate-700"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-500" /> Edit
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenDocuments}
              className="h-8.5 text-xs font-bold gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-400"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" /> Document Vault
            </Button>

            <Button
              size="sm"
              onClick={handleOpenFullDetails}
              className="h-8.5 text-xs font-bold bg-brand hover:bg-brand-hover text-white gap-1.5 px-4 shadow-sm"
            >
              Full Profile Dossier <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Standalone Zoomed Photo Modal */}
    {(() => {
      const zoomPhotoUrl = getDriverAvatar(driver.avatar_url, `${driver.first_name} ${driver.last_name}`);
      return (
        <Dialog open={photoZoom && !!zoomPhotoUrl} onOpenChange={setPhotoZoom}>
          <DialogContent className="max-w-md w-[92vw] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate pr-8">
                {driver.first_name} {driver.last_name} — Profile Photo
              </h3>
            </div>
            <div className="pt-4 pb-1 flex items-center justify-center w-full">
              {zoomPhotoUrl && (
                <img
                  src={zoomPhotoUrl}
                  alt={`${driver.first_name} ${driver.last_name}`}
                  className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl shadow-md border border-slate-100 dark:border-slate-800"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
}
