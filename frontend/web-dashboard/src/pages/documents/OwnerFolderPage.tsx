import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, UploadCloud, Truck, User, ArrowLeft, Folder, MoreVertical, RotateCw, ChevronDown, FilePlus, Phone, ChevronRight, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { driverService, type Driver } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { documentService } from '@/services/documentService';
import { downloadCSV } from '@/utils/exportUtils';
import { getOwnerCardSummary, resolveFileUrl } from '@/lib/documents';
import { cn } from '@/lib/utils';
import OwnerFolderDetail from '@/components/documents/OwnerFolderDetail';
import ImportReviewModal from '@/components/documents/ImportReviewModal';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import AddCustomDocumentModal from '@/components/ui/AddCustomDocumentModal';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function OwnerFolderPage() {
  const navigate = useNavigate();
  const [isSingleUploadOpen, setIsSingleUploadOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isCustomDocOpen, setIsCustomDocOpen] = useState(false);

  const { ownerType, ownerId } = useParams<{ ownerType: string; ownerId: string }>();
  const queryClient = useQueryClient();
  const normalizedType = ownerType === 'vehicles' ? 'Vehicle' : ownerType === 'drivers' ? 'Driver' : null;

  const { data: driversRes } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      try {
        return await driverService.getAll({ mode: 'lookup' });
      } catch (err) {
        return { data: [] } as any;
      }
    },
  });

  const driversList: Driver[] = driversRes?.data || [];

  const { data: driver } = useQuery({
    queryKey: ['driver', ownerId],
    queryFn: async () => {
      try {
        return await driverService.getById(ownerId!);
      } catch (err) {
        return null;
      }
    },
    enabled: !!ownerId && normalizedType === 'Driver',
  });

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', ownerId],
    queryFn: async () => {
      try {
        return await vehicleService.getById(ownerId!);
      } catch (err) {
        return null;
      }
    },
    enabled: !!ownerId && normalizedType === 'Vehicle',
  });

  const targetDriverId = normalizedType === 'Driver'
    ? ownerId
    : ((vehicle as any)?.assigned_driver_id || (vehicle as any)?.driver_id || vehicle?.assignedDriver?.id);

  const { data: fullTargetDriver } = useQuery({
    queryKey: ['driver', targetDriverId],
    queryFn: async () => {
      try {
        return await driverService.getById(targetDriverId!);
      } catch (err) {
        return null;
      }
    },
    enabled: !!targetDriverId,
  });

  const { data: folder } = useQuery({
    queryKey: ['documents', 'owner', normalizedType, ownerId],
    queryFn: async () => {
      try {
        return await documentService.getOwnerFolder(normalizedType!, ownerId!);
      } catch (err) {
        return null;
      }
    },
    enabled: !!ownerId && !!normalizedType,
  });

  const ownerName = normalizedType === 'Driver'
    ? (fullTargetDriver ? `${fullTargetDriver.first_name} ${fullTargetDriver.last_name}` : (driver ? `${driver.first_name} ${driver.last_name}` : 'Driver'))
    : normalizedType === 'Vehicle'
      ? (vehicle ? (vehicle.plate_number || vehicle.ref_id || 'Vehicle') : 'Vehicle')
      : 'Documents';

  const assignedDriver = fullTargetDriver || vehicle?.assignedDriver || (vehicle as any)?.driver;
  const driverName = assignedDriver
    ? `${assignedDriver.first_name || ''} ${assignedDriver.last_name || ''}`.trim()
    : 'Saleem Taha Khan';

  const activeDriverObj = useMemo(() => {
    if (fullTargetDriver) return fullTargetDriver;
    if (normalizedType === 'Driver') {
      return driver || driversList.find((d: Driver) => d.id === ownerId) || null;
    }
    const driverId = (vehicle as any)?.assigned_driver_id || (vehicle as any)?.driver_id || vehicle?.assignedDriver?.id;
    if (driverId) {
      return driversList.find((d: Driver) => d.id === driverId) || vehicle?.assignedDriver || null;
    }
    if (vehicle?.assignedDriver) {
      return driversList.find((d: Driver) => d.first_name === vehicle.assignedDriver?.first_name) || vehicle.assignedDriver;
    }
    return driversList[0] || null;
  }, [fullTargetDriver, normalizedType, driver, vehicle, driversList, ownerId]);

  const cardSummary = getOwnerCardSummary(folder?.slots || []);

  const handleRefresh = async () => {
    toast.loading('Refreshing document vault...', { id: 'refresh-vault' });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['vehicle', ownerId] });
    await queryClient.invalidateQueries({ queryKey: ['driver', ownerId] });
    toast.success('Document vault updated', { id: 'refresh-vault' });
  };

  const handleExportSummary = () => {
    if (!folder?.slots || folder.slots.length === 0) {
      toast.error('No compliance records available to export.');
      return;
    }
    const dataRows = folder.slots.map((s) => ({
      'Slot Code': s.documentType?.code || 'N/A',
      'Document Type': s.documentType?.name || 'N/A',
      'Status': s.status,
      'Doc Number': s.document?.ai_extracted_json?.document_number || (s.document as any)?.document_number || 'N/A',
      'Issue Date': s.document?.issue_date ? s.document.issue_date.slice(0, 10) : 'N/A',
      'Expiry Date': s.document?.expiry_date ? s.document.expiry_date.slice(0, 10) : 'N/A',
      'Requirement': s.documentType?.requirementStatus || 'MANDATORY',
    }));
    const filename = `${ownerName.toLowerCase().replace(/[^a-z0-0]/g, '_')}_compliance_summary.csv`;
    downloadCSV(dataRows, filename);
    toast.success(`Exported ${folder.slots.length} compliance record(s) to ${filename}`);
  };

  return (
    <DashboardLayout active="Documents" title={`${ownerName} Workspace`} fixedViewport>
      {/* Anchored Desktop Viewport Container: Fits full browser height on every desktop without scrolling */}
      <div className="px-4 sm:px-6 pb-4 max-w-[1600px] mx-auto w-full h-full flex flex-col overflow-hidden gap-4">
        
        {/* ── Reference Design ERP Header Card ── */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 px-5 py-4 sm:px-6 sm:py-5 shadow-3xs flex items-center justify-between gap-4 shrink-0">
          
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Left Truck / Entity Icon Box */}
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
              <Truck className="w-7 h-7 text-slate-700 dark:text-slate-300" />
            </div>

            <div className="min-w-0 space-y-1">
              {/* Row 1: Plate Number + Metadata Badges */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                  {vehicle?.plate_number || ownerName}
                </h1>
                
                {/* Vehicle Ref Code Tag */}
                {vehicle?.ref_id && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold uppercase tracking-wider">
                    {vehicle.ref_id}
                  </span>
                )}

                {/* Capacity Tag */}
                {vehicle?.capacity_kg ? (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold uppercase tracking-wider">
                    {(vehicle.capacity_kg / 1000).toFixed(0)} TON
                  </span>
                ) : null}
              </div>

              {/* Row 2: Subtitle Name & Phone */}
              {(() => {
                const fullDName = activeDriverObj ? `${activeDriverObj.first_name} ${activeDriverObj.last_name}` : (normalizedType === 'Driver' ? ownerName : driverName);
                const phoneNum = (activeDriverObj as any)?.phone_primary || (activeDriverObj as any)?.phone || (assignedDriver as any)?.phone_primary || (assignedDriver as any)?.phone || null;

                return (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="uppercase tracking-wide font-extrabold text-slate-800 dark:text-slate-200">{fullDName}</span>
                    {phoneNum && (
                      <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                        <Phone className="w-3 h-3" /> {phoneNum}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right Side: Issues Warning Badge & Sub-link */}
          <div className="shrink-0 flex flex-col items-end space-y-1">
            <Badge className={cn('text-xs font-mono font-extrabold px-3 py-1 border rounded-xl shadow-3xs gap-1.5', cardSummary.className)}>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              {cardSummary.isCompliant ? '0 Issues' : cardSummary.label}
            </Badge>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1 hover:text-slate-600 cursor-pointer">
              Documents need attention <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

        </div>

        {/* Viewport Fills: Main Master/Detail Workspace */}
        {normalizedType && ownerId && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <OwnerFolderDetail
              ownerType={normalizedType}
              ownerId={ownerId}
              onOpenAddCustomDoc={() => setIsCustomDocOpen(true)}
            />
          </div>
        )}

        {/* Single File Upload Modal */}
        {isSingleUploadOpen && normalizedType && ownerId && (
          <UploadDocumentModal
            isOpen={isSingleUploadOpen}
            onClose={() => setIsSingleUploadOpen(false)}
            entityType={normalizedType}
            entityId={ownerId}
            lockOwner
            ownerDisplayName={ownerName}
            onUploadSuccess={handleRefresh}
          />
        )}

        {/* Batch / Folder Import Modal */}
        {isBatchOpen && normalizedType && ownerId && (
          <ImportReviewModal
            isOpen={isBatchOpen}
            onClose={() => setIsBatchOpen(false)}
            lockOwnerType={normalizedType!}
            lockOwnerId={ownerId!}
            ownerDisplayName={ownerName}
            onImported={handleRefresh}
          />
        )}

        {/* Add Custom Document Requirement Modal */}
        {isCustomDocOpen && normalizedType && (
          <AddCustomDocumentModal
            isOpen={isCustomDocOpen}
            onClose={() => setIsCustomDocOpen(false)}
            ownerType={normalizedType}
            onSuccess={handleRefresh}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
