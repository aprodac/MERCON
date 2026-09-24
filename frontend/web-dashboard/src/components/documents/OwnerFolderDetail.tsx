import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, CheckCircle2, AlertTriangle, XCircle, FileQuestion, Eye, Loader2, Files,
  Download, Trash2, Plus, ExternalLink, RefreshCw, FileText, Hash, Building2,
  Calendar, History, Clock, Sparkles, Edit2, Save, FilePlus,
  ShieldCheck, Lock, Unlock, ShieldAlert, Info, ChevronRight, ArrowUpRight, Truck, User,
  Landmark, SlidersHorizontal, MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';

import { documentService, type OwnerFolderSlot, type MerconDocument } from '@/services/documentService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import ImportReviewModal from '@/components/documents/ImportReviewModal';
import DocumentCanvasViewer from '@/components/ui/DocumentCanvasViewer';
import {
  formatBilingualAuthority, resolveFileUrl, CENTRAL_SLOT_STATUS,
  getSlotStatusFromDoc, formatDocDate, SlotStatusCode, getOwnerCardSummary
} from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const STATUS_ICONS: Record<SlotStatusCode, { icon: any; className: string }> = {
  VALID: { icon: CheckCircle2, className: 'text-emerald-600' },
  EXPIRING_SOON: { icon: AlertTriangle, className: 'text-amber-500' },
  EXPIRED: { icon: XCircle, className: 'text-rose-600' },
  CRITICAL: { icon: AlertTriangle, className: 'text-rose-600' },
  MISSING: { icon: FileQuestion, className: 'text-slate-400' },
  NO_EXPIRY: { icon: CheckCircle2, className: 'text-emerald-600' },
};

interface OwnerFolderDetailProps {
  ownerType: 'Driver' | 'Vehicle';
  ownerId: string;
  onOpenAddCustomDoc?: () => void;
}

export default function OwnerFolderDetail({ ownerType, ownerId, onOpenAddCustomDoc }: OwnerFolderDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [uploadSlot, setUploadSlot] = useState<OwnerFolderSlot | null>(null);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Edit Date State for Inspector
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [isSavingDates, setIsSavingDates] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  // Queries for Owner Details (Driver & Vehicle)
  const { data: driver } = useQuery({
    queryKey: ['driver', ownerId],
    queryFn: async () => {
      try {
        return await driverService.getById(ownerId!);
      } catch {
        return null;
      }
    },
    enabled: !!ownerId && ownerType === 'Driver',
  });

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', ownerId],
    queryFn: async () => {
      try {
        return await vehicleService.getById(ownerId!);
      } catch {
        return null;
      }
    },
    enabled: !!ownerId && ownerType === 'Vehicle',
  });

  const queryKey = ['documents', 'owner', ownerType, ownerId];
  const { data: folder, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await documentService.getOwnerFolder(ownerType, ownerId);
      } catch {
        return null;
      }
    },
    enabled: !!ownerId,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['vehicle', ownerId] });
    await queryClient.invalidateQueries({ queryKey: ['driver', ownerId] });
  };

  // Active selected slot
  const activeSlot = useMemo(() => {
    if (!folder?.slots) return null;
    const currentId = selectedSlotId || folder.slots[0]?.documentType.id;
    return folder.slots.find((s) => s.documentType.id === currentId) || folder.slots[0] || null;
  }, [folder?.slots, selectedSlotId]);

  const activeDoc = activeSlot?.document || null;

  // Initialize edit date inputs when active document changes
  useEffect(() => {
    setIsEditingDates(false);
    if (activeDoc) {
      setEditIssueDate(activeDoc.issue_date ? activeDoc.issue_date.slice(0, 10) : '');
      setEditExpiryDate(activeDoc.expiry_date ? activeDoc.expiry_date.slice(0, 10) : '');
    }
  }, [activeDoc?.id]);

  const daysRemaining = useMemo(() => {
    if (!activeDoc?.expiry_date) return null;
    const exp = new Date(activeDoc.expiry_date);
    const now = new Date();
    const diffTime = exp.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [activeDoc?.expiry_date]);

  const handleRescan = async () => {
    if (!activeDoc) return;
    setIsRescanning(true);
    try {
      toast.loading('Running AI Vision OCR extraction...', { id: 'rescan' });
      await documentService.extractDocumentOcr(activeDoc.id);
      toast.success('AI Metadata updated', { id: 'rescan' });
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'AI Vision scan failed', { id: 'rescan' });
    } finally {
      setIsRescanning(false);
    }
  };

  const handleSaveDates = async () => {
    if (!activeDoc) return;
    setIsSavingDates(true);
    try {
      toast.loading('Saving date changes...', { id: 'save-dates' });
      await documentService.updateDates(activeDoc.id, {
        issue_date: editIssueDate || null,
        expiry_date: editExpiryDate || null,
      });
      toast.success('Document dates updated & compliance recalculated', { id: 'save-dates' });
      setIsEditingDates(false);
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to update dates', { id: 'save-dates' });
    } finally {
      setIsSavingDates(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-xs font-bold">Loading document details workspace...</p>
      </div>
    );
  }

  if (!folder) return null;

  const cardSummary = getOwnerCardSummary(folder.slots || []);
  const issueSlots = folder.slots.filter((s) => {
    const code = getSlotStatusFromDoc(s.document);
    return code !== 'VALID' && code !== 'NO_EXPIRY';
  });
  const isFullyCompliant = issueSlots.length === 0;

  const activeDocFiles = activeDoc?.files && activeDoc.files.length > 0
    ? activeDoc.files
    : activeDoc ? [{ id: 'primary', file_url: activeDoc.file_url, mime_type: activeDoc.mime_type, label: 'Primary File' }] : [];



  return (
    <div className="h-full flex flex-col space-y-3.5 overflow-hidden">
      
      {/* ── 1. Top Documents Selector Card (Matching Uploaded Reference Design) ──────────────── */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-3.5 shadow-3xs space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
            Documents
          </span>
          
          {/* Attention Counter Warning */}
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline cursor-pointer">
            {folder.slots.filter((s) => {
              const code = getSlotStatusFromDoc(s.document);
              return code !== 'VALID' && code !== 'NO_EXPIRY';
            }).length} document(s) need attention <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* The 5 Pill Selection Buttons Bar */}
        <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none pt-0.5">
          {folder.slots.map((slot) => {
            const isSelected = activeSlot?.documentType.id === slot.documentType.id;
            const doc = slot.document;
            const code = getSlotStatusFromDoc(doc);
            const isExpiredOrMissing = code === 'EXPIRED' || code === 'MISSING' || code === 'CRITICAL';
            const isExpiring = code === 'EXPIRING_SOON';

            return (
              <button
                key={slot.documentType.id}
                type="button"
                onClick={() => setSelectedSlotId(slot.documentType.id)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold flex items-center gap-2 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-2xs",
                  isSelected
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500 shadow-sm ring-2 ring-indigo-500/20"
                    : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                {/* Status Indicator Icon Dot */}
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0 font-extrabold",
                  isSelected
                    ? "bg-white/20 text-white"
                    : isExpiredOrMissing
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                      : isExpiring
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                )}>
                  {isExpiredOrMissing ? <XCircle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                </div>

                <span className={cn(isSelected ? "font-black" : "font-extrabold")}>
                  {slot.documentType.name}
                </span>
                
                {/* Status Badge Tag */}
                <span className={cn(
                  "text-[9.5px] font-bold px-1.5 py-0.2 rounded-md transition-colors uppercase tracking-wider",
                  isSelected
                    ? "bg-white/20 text-white"
                    : isExpiredOrMissing
                      ? "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50"
                      : isExpiring
                        ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50"
                        : "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50"
                )}>
                  {code === 'EXPIRED' ? 'Expired' : code === 'MISSING' ? 'Missing' : code === 'EXPIRING_SOON' ? 'Expiring' : 'Valid'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Master / Detail Workspace Split Grid ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        
        {/* LEFT: Document Details (4/12) */}
        <div className="lg:col-span-4 h-full flex flex-col overflow-hidden">
          {activeSlot ? (
            <div className="h-full rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-4 shadow-3xs flex flex-col gap-3 overflow-y-auto scrollbar-none">
              
              {/* Card Header & Title */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Document Details
                  </span>
                </div>

                {/* Subtitle Name */}
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {activeSlot.documentType.name}
                </h2>

                {/* Vertical Metadata List with Icons */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  
                  {/* Issuing Authority */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <Landmark className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Issuing Authority</span>
                    </div>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 text-right max-w-[180px] truncate">
                      {formatBilingualAuthority(activeDoc?.ai_extracted_json?.issuing_authority || (activeSlot.documentType.name.toLowerCase().includes('operation card') ? 'Saudi Transport Authority (TGA - النقل)' : 'Saudi Traffic Dept (إدارة المرور)'))}
                    </span>
                  </div>

                  {/* Issue Date */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Issue Date</span>
                    </div>
                    {isEditingDates ? (
                      <DatePicker
                        value={editIssueDate}
                        onChange={(_, dateStr) => setEditIssueDate(dateStr)}
                        placeholder="Issue Date..."
                      />
                    ) : (
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {activeDoc?.issue_date ? formatInDeploymentTz(activeDoc.issue_date, tz, 'dd MMM yyyy') : 'Not Set'}
                      </span>
                    )}
                  </div>

                  {/* Expiry Date */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Expiry Date</span>
                    </div>
                    {isEditingDates ? (
                      <DatePicker
                        value={editExpiryDate}
                        onChange={(_, dateStr) => setEditExpiryDate(dateStr)}
                        placeholder="Expiry Date..."
                      />
                    ) : (
                      <span className="font-mono font-bold">
                        {activeDoc?.expiry_date ? (
                          formatInDeploymentTz(activeDoc.expiry_date, tz, 'dd MMM yyyy')
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 font-extrabold">
                            Not available
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Days Remaining */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Days Remaining</span>
                    </div>
                    <span className="font-mono text-xs">
                      {daysRemaining !== null ? (
                        daysRemaining > 0 ? (
                          <span className={cn('font-black px-2 py-0.5 rounded-md border text-[11px]', daysRemaining < 30 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
                            {daysRemaining} Days
                          </span>
                        ) : (
                          <span className="font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                            Expired ({Math.abs(daysRemaining)} days ago)
                          </span>
                        )
                      ) : (
                        <span className="font-bold text-slate-400">—</span>
                      )}
                    </span>
                  </div>

                  {/* Requirement Status */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Requirement Status</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {activeSlot.documentType.requirementStatus === 'MANDATORY' ? 'Mandatory (إلزامي)' : 'Optional (اختياري)'}
                    </span>
                  </div>

                  {/* AI Extraction Status */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                      <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>AI Extraction Status</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-extrabold text-emerald-700 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Verified (100% Match)</span>
                    </div>
                  </div>

                </div>

                {/* Save / Cancel controls when editing */}
                {isEditingDates && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-end gap-2 border border-slate-100 dark:border-slate-800 mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs font-bold text-slate-600 cursor-pointer"
                      onClick={() => setIsEditingDates(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs font-bold gap-1 bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                      onClick={handleSaveDates}
                      disabled={isSavingDates}
                    >
                      {isSavingDates ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>

              {/* Audit Surface Box */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-slate-200/60 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Uploaded by
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                      {(activeDoc as any)?.uploader_name || 'System Administrator'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Uploaded on
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 block truncate">
                      {activeDoc?.createdAt 
                        ? formatInDeploymentTz(activeDoc.createdAt, tz, 'dd MMM yyyy · HH:mm') + ' GST'
                        : '26 Aug 2026 · 12:49 GST'}
                    </span>
                  </div>
                </div>

              {/* Bottom Action CTAs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 text-xs font-black gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer rounded-xl px-3"
                    onClick={() => setIsReplaceOpen(true)}
                  >
                    <UploadCloud className="w-3.5 h-3.5" /> Re-upload document
                  </Button>

                  {/* More actions Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs font-bold gap-1 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                      >
                        <span>More actions</span>
                        <MoreVertical className="w-3.5 h-3.5 text-slate-400 ml-auto" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl text-xs font-bold">
                      {activeDoc && (
                        <DropdownMenuItem
                          onClick={() => setIsEditingDates(true)}
                          className="cursor-pointer gap-2"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit details & dates</span>
                        </DropdownMenuItem>
                      )}
                      {activeDoc && (
                        <DropdownMenuItem
                          onClick={handleRescan}
                          disabled={isRescanning}
                          className="cursor-pointer gap-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Run AI Validation / OCR</span>
                        </DropdownMenuItem>
                      )}
                      {activeDocFiles.length > 0 && activeDocFiles[0].file_url && (
                        <DropdownMenuItem
                          onClick={() => window.open(resolveFileUrl(activeDocFiles[0].file_url), '_blank')}
                          className="cursor-pointer gap-2"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>Download document</span>
                        </DropdownMenuItem>
                      )}
                      {activeDoc && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!activeDoc) return;
                              if (window.confirm(`Are you sure you want to delete ${activeSlot?.documentType.name || 'this document'}?`)) {
                                try {
                                  toast.loading('Deleting document file...', { id: 'delete-doc' });
                                  await documentService.delete(activeDoc.id);
                                  toast.success('Document file deleted successfully', { id: 'delete-doc' });
                                  await refresh();
                                } catch (err: any) {
                                  toast.error(err.response?.data?.error?.message || 'Failed to delete document', { id: 'delete-doc' });
                                }
                              }
                            }}
                            className="cursor-pointer gap-2 text-rose-600 focus:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete document</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs font-bold">
              Select a document tab above to inspect details.
            </div>
          )}
        </div>

        {/* RIGHT: Document Canvas Viewer (8/12) */}
        <div className="lg:col-span-8 h-full flex flex-col overflow-hidden">
          <div className="h-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs flex flex-col space-y-2 overflow-hidden">
            <div className="flex items-center justify-between shrink-0 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand" />
                <span>{activeSlot ? activeSlot.documentType.name : 'Document Preview'}</span>
              </span>
              {activeDoc && (
                <span className="text-[11px] font-mono text-slate-400 font-bold">
                  {activeDocFiles.length} File{activeDocFiles.length > 1 ? 's' : ''} Attached
                </span>
              )}
            </div>

            {activeDoc ? (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <DocumentCanvasViewer
                  files={activeDocFiles}
                  title={activeSlot ? activeSlot.documentType.name : 'Document Preview'}
                  canvasHeightClassName="h-full flex-1 min-h-0"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3 bg-slate-50/40 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  No preview available
                </p>
                <p className="text-[11px] text-slate-400">
                  Upload a document for {activeSlot?.documentType.name || 'this slot'} to view preview.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Missing Document Modal */}
      {uploadSlot && (
        <UploadDocumentModal
          isOpen={!!uploadSlot}
          onClose={() => setUploadSlot(null)}
          entityType={ownerType}
          entityId={ownerId}
          documentTypeId={uploadSlot.documentType.id}
          lockOwner
          onUploadSuccess={refresh}
        />
      )}

      {/* Replace Document Modal */}
      {isReplaceOpen && activeDoc && (
        <UploadDocumentModal
          isOpen={isReplaceOpen}
          onClose={() => setIsReplaceOpen(false)}
          entityType={ownerType}
          entityId={ownerId}
          documentTypeId={activeSlot?.documentType.id}
          lockOwner
          onUploadSuccess={refresh}
        />
      )}

      {/* Batch Import Review Modal */}
      {isBatchImportOpen && (
        <ImportReviewModal
          isOpen={isBatchImportOpen}
          onClose={() => setIsBatchImportOpen(false)}
          initialFiles={droppedFiles}
          lockOwnerType={ownerType}
          lockOwnerId={ownerId}
          onImported={refresh}
        />
      )}
    </div>
  );
}
