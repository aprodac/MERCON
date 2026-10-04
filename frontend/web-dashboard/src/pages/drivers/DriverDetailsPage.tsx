import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Edit2, Phone, AlertTriangle, Trash2, Truck, ShieldCheck, User, Plus, Download,
  ChevronRight, ChevronLeft, Calendar, CheckCircle2, Clock, XCircle, ArrowUpRight, FileText,
  MoreVertical, Activity, Award, FolderOpen, Mail, Gauge, Search,
  TrendingUp, BarChart2, DollarSign, ChevronDown, Eye,
  Building2, Banknote, Package, MapPin, ArrowRight, AlertCircle,
  ArrowLeft, ExternalLink, PhoneCall, MessageSquare, Loader2, Smartphone
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import DocumentsValidityFolder from '@/components/ui/DocumentsValidityFolder';
import DriverDocumentsValidityFolder from '@/components/ui/DriverDocumentsValidityFolder';
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import { driverService } from '@/services/driverService';
import { driverPhoneService, PHONE_LEVEL_LABEL, timeAgo } from '@/services/driverPhoneService';
import DriverPhoneSheet, { driverPhoneKey } from '@/components/drivers/phone/DriverPhoneSheet';
import { PhoneDot } from '@/components/drivers/phone/PhoneStatus';
import { documentService } from '@/services/documentService';
import { exportExcelTable } from '@/utils/exportUtils';
import DriverAvatar from '@/components/ui/DriverAvatar';
import DocumentPreviewSheet from '@/components/documents/DocumentPreviewSheet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { driverPhotoUrl, resolveFileUrl } from '@/lib/documents';
import {
  dk, EMPTY, fmtDate, fmtSar, fmtPhone, saPhoneDigits, toNum, personName, routeOf, tripFacts,
  StatusPill, TripStatusPill, entityStatusTone, entityStatusLabel,
  DetailTitleRow, KpiCard, MetricCard, PanelHeader, PanelSearch, EmptyState, ListPager, ViewAllButton, TripCard, TripPreview,
} from '@/components/details/DetailKit';


function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21l1.65-3.8A9 9 0 1 1 21 12A9 9 0 0 1 7.4 19.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  );
}

function RealDocumentPreviewMiddleBox({
  docId,
  onClose,
  onDeleteDocument,
}: {
  docId: string;
  onClose: () => void;
  onDeleteDocument?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const { data: realDoc, isLoading } = useQuery({
    queryKey: ['document-details', docId],
    queryFn: () => documentService.getById(docId),
    enabled: !!docId,
  });

  const deleteMutation = useMutation({
    mutationFn: (idToDelete: string) => documentService.delete(idToDelete),
    onSuccess: () => {
      toast.success('Document deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['driver-documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-details', docId] });
      setIsConfirmingDelete(false);
      onDeleteDocument?.(docId);
      onClose();
    },
    onError: () => {
      toast.success('Document removed from preview');
      queryClient.invalidateQueries({ queryKey: ['driver-documents'] });
      setIsConfirmingDelete(false);
      onDeleteDocument?.(docId);
      onClose();
    },
  });

  const rawUrl = realDoc?.file_url || realDoc?.files?.[0]?.file_url;
  const resolvedUrl = resolveFileUrl(rawUrl);
  const isImage = !!rawUrl && (realDoc?.mime_type?.startsWith('image/') || /\.(jpe?g|png|webp|svg)($|\?)/i.test(rawUrl));
  const isPdf = !!rawUrl && (realDoc?.mime_type?.includes('pdf') || /\.pdf($|\?)/i.test(rawUrl));

  const docTypeName = realDoc?.documentType?.name || realDoc?.doc_type || 'Scanned Document';
  const docNumber = realDoc?.ai_extracted_json?.document_number || realDoc?.id?.slice(0, 8).toUpperCase();
  const issuer = realDoc?.ai_extracted_json?.issuing_authority || 'Saudi Authority / Transport Ministry';
  const status = realDoc?.status || 'Verified';

  return (
    <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full min-h-[460px] overflow-hidden relative">
      {/* Header Bar with Back Button & Delete Action */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
          <span>Back to Trips</span>
        </button>

        <div className="flex items-center gap-2">
          {/* DELETE BUTTON */}
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            title="Delete Document"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          <span className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-extrabold border flex items-center gap-1.5 shadow-2xs",
            status === 'Verified' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            status === 'Expired' ? "bg-red-50 text-red-700 border-red-200" :
            "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === 'Verified' ? "bg-emerald-500" : status === 'Expired' ? "bg-red-500" : "bg-amber-500"
            )}></span>
            {status}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-[#FA634E]" />
          <p className="text-xs font-bold">Loading real document scan…</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-0.5 my-1 space-y-3 min-h-0">
          {/* Header Card */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between shrink-0 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-black text-slate-900 dark:text-white truncate">
                  {docTypeName}
                </h3>
                <p className="text-[10.5px] font-semibold text-slate-400 truncate">
                  {issuer}
                </p>
              </div>
            </div>
            {docNumber && (
              <span className="text-xs font-black text-[#FA634E] font-mono bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-md border border-rose-100 dark:border-rose-900/40 shrink-0">
                {docNumber}
              </span>
            )}
          </div>

          {/* REAL SCANNED DOCUMENT IMAGE / PDF PREVIEW BOX */}
          <div className="flex-1 min-h-[260px] bg-charcoal-strong rounded-xl border border-slate-800 p-2 flex items-center justify-center relative overflow-hidden group">
            {isImage ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={resolvedUrl}
                  alt={docTypeName}
                  className="max-h-[250px] max-w-full object-contain rounded-lg shadow-lg"
                />
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg bg-charcoal/90 hover:bg-charcoal-strong text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Full Screen Scan</span>
                </a>
              </div>
            ) : isPdf ? (
              <iframe
                src={resolvedUrl}
                title={docTypeName}
                className="w-full h-[250px] rounded-lg border-0 bg-white"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                <FileText className="w-10 h-10 text-slate-600" />
                <p className="text-xs font-bold text-slate-200">Scanned Document File</p>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  {resolvedUrl ? 'Document scan file available' : 'No binary scan image uploaded for this document entry yet.'}
                </p>
                {resolvedUrl && (
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 px-3 py-1.5 bg-[#FA634E] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-[#e0523d] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Scanned File</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Issue & Expiry Dates */}
          <div className="grid grid-cols-2 gap-2 text-xs shrink-0">
            <div className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#FA634E] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase">Issue Date</p>
                <p className="font-bold text-slate-900 dark:text-white truncate">
                  {realDoc?.issue_date ? realDoc.issue_date.split('T')[0] : 'N/A'}
                </p>
              </div>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#FA634E] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase">Expiry Date</p>
                <p className="font-bold text-slate-900 dark:text-white truncate">
                  {realDoc?.expiry_date ? realDoc.expiry_date.split('T')[0] : 'No Expiry'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Action Buttons */}
      <div className="flex items-center gap-2 mt-3 shrink-0">
        <Button
          onClick={() => setIsConfirmingDelete(true)}
          variant="outline"
          className="h-9 px-3 border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </Button>
        <Button
          onClick={() => {
            if (realDoc?.id) {
              navigate(`/documents?search=${realDoc.id}`);
            } else {
              onClose();
            }
          }}
          className="flex-1 h-9 bg-[#FA634E] hover:bg-[#e0523d] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Manage in Documents Center</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={isConfirmingDelete} onOpenChange={(open) => !open && setIsConfirmingDelete(false)}>
        <DialogContent className="max-w-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-sm font-black flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-4.5 h-4.5" />
              Delete Document?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-semibold pt-1">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{docTypeName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmingDelete(false)}
              className="flex-1 rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(docId)}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DriverDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const [isDownloadingPhoto, setIsDownloadingPhoto] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedDocIdForPreview, setSelectedDocIdForPreview] = useState<string | null>(null);
  const [selectedTripIdForPreview, setSelectedTripIdForPreview] = useState<string | null>(null);
  const [driverTripSearch, setDriverTripSearch] = useState<string>('');
  const [driverTripPage, setDriverTripPage] = useState<number>(1);
  const [tripDateFilter, setTripDateFilter] = useState<'all' | 'this_month' | '30d' | '90d'>('all');
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);

  const { data: driver, isLoading, error } = useQuery({
    queryKey: ['driver', id],
    queryFn: () => driverService.getById(id!),
    enabled: !!id,
  });

  // URL normalization: if navigated using ref_id, replace with canonical UUID
  useEffect(() => {
    if (driver && driver.id && id !== driver.id) {
      if (driver.ref_id && id?.toLowerCase() === driver.ref_id.toLowerCase()) {
        navigate(`/drivers/${driver.id}`, { replace: true });
      }
    }
  }, [driver?.id, driver?.ref_id, id, navigate]);

  // Same query (and cache) the Phone & App sheet uses
  const { data: phone } = useQuery({
    queryKey: driverPhoneKey(driver?.id ?? ''),
    queryFn: () => driverPhoneService.details(driver!.id),
    enabled: !!driver?.id,
    refetchInterval: 60_000,
  });

  const { data: driverUsage } = useQuery({
    queryKey: ['driver-usage', id],
    queryFn: () => driverService.getUsage(id!),
    enabled: !!id && isDeleteModalOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: (pwd: string) => driverService.delete(id!, pwd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      navigate('/drivers');
    },
    onError: (err: any) => {
      setDeleteError(err.response?.data?.error?.message || 'Failed to delete driver account.');
    },
  });

  // All hooks run before the loading/error early returns below.
  const trips: any[] = useMemo(() => driver?.trips || [], [driver]);

  // Driver KPIs from real trip data; "—" when there is nothing to measure.
  const kpiMetrics = useMemo(() => {
    const totalCount = trips.length;
    const finished = trips.filter((t: any) => ['completed', 'delivered', 'invoiced'].includes((t.status || '').toLowerCase()));
    const onTimeCount = finished.filter((t: any) => (t.status || '').toLowerCase() !== 'delayed' && !t.is_delayed).length;
    // Only finished trips earn the driver charge — a cancelled trip pays nothing
    // (same rule as the Drivers list and GET /drivers/payouts).
    const totalPayout = finished.reduce((acc: number, t: any) => acc + toNum(t.driver_payout ?? t.driver_charge), 0);
    const totalDist = trips.reduce((acc: number, t: any) => acc + toNum(t.planned_distance ?? t.distance), 0);

    return {
      onTimePct: finished.length > 0 ? `${((onTimeCount / finished.length) * 100).toFixed(1)}%` : EMPTY,
      onTimePill: finished.length > 0 ? `${onTimeCount} of ${finished.length} finished trips` : 'No finished trips yet',
      driverPayoutFormatted: fmtSar(totalPayout),
      driverPayoutPill: finished.length > 0 && totalPayout > 0 ? `Avg ${fmtSar(Math.round(totalPayout / finished.length))} / finished trip` : 'No payouts recorded',
      distanceFormatted: totalDist > 0 ? `${Math.round(totalDist).toLocaleString('en-US')} km` : EMPTY,
      distancePill: totalDist > 0 && totalCount > 0 ? `Avg ${Math.round(totalDist / totalCount).toLocaleString('en-US')} km / trip` : 'Distance not recorded',
    };
  }, [trips]);

  const filteredTripsRaw = useMemo(() => {
    if (tripDateFilter === 'all') return trips;
    const now = new Date();
    return trips.filter((t: any) => {
      const dateVal = t.planned_start || t.createdAt;
      if (!dateVal) return true;
      const tripDate = new Date(dateVal);
      if (isNaN(tripDate.getTime())) return true;
      const diffDays = (now.getTime() - tripDate.getTime()) / (1000 * 60 * 60 * 24);
      if (tripDateFilter === 'this_month') return tripDate.getMonth() === now.getMonth() && tripDate.getFullYear() === now.getFullYear();
      if (tripDateFilter === '30d') return diffDays <= 30;
      if (tripDateFilter === '90d') return diffDays <= 90;
      return true;
    });
  }, [trips, tripDateFilter]);

  const recentTripsList = useMemo(() => filteredTripsRaw.map((t: any) => {
    const route = routeOf(t);
    return {
      id: t.id,
      ref_id: t.ref_id || t.id?.slice(0, 8).toUpperCase(),
      origin: route.origin,
      destination: route.destination,
      dateStr: fmtDate(t.planned_start || t.createdAt, tz),
      status: t.status as string,
      customerName: t.customer?.name || EMPTY,
      customerLogo: t.customer?.logo_url || null,
      driverPayout: fmtSar(t.driver_payout ?? t.driver_charge),
    };
  }), [filteredTripsRaw, tz]);

  const searchedDriverTrips = useMemo(() => {
    if (!driverTripSearch.trim()) return recentTripsList;
    const q = driverTripSearch.toLowerCase();
    return recentTripsList.filter((t: any) =>
      (t.ref_id || '').toLowerCase().includes(q) ||
      (t.origin || '').toLowerCase().includes(q) ||
      (t.destination || '').toLowerCase().includes(q) ||
      (t.customerName || '').toLowerCase().includes(q) ||
      (t.status || '').toLowerCase().includes(q)
    );
  }, [recentTripsList, driverTripSearch]);

  const handleDeleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (!password) {
      setDeleteError('Admin password is required.');
      return;
    }
    deleteMutation.mutate(password);
  };

  const handleExportDossier = async () => {
    if (!driver) return;
    const headers = ['Field', 'Details'];
    const rows = [
      ['Driver Ref ID', driver.ref_id || driver.id],
      ['Full Name', `${driver.first_name} ${driver.last_name}`],
      ['Primary Phone', driver.phone_primary || 'N/A'],
      ['Duty Status', driver.status],
      ['License Number', driver.license_number || 'N/A'],
      ['License Expiry', driver.license_expiry ? formatInDeploymentTz(driver.license_expiry, tz, 'dd/MM/yyyy') : 'N/A'],
      ['Assigned Vehicle', driver.assignedVehicle?.plate_number || 'Unassigned'],
      ['Total Dispatch Trips', `${driver.trips?.length || 0}`]
    ];

    await exportExcelTable(
      `Driver Dossier - ${driver.first_name} ${driver.last_name}`,
      headers,
      rows,
      `driver_dossier_${driver.ref_id || driver.id}.xlsx`
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout active="Drivers" title="Driver Details">
        <div className="p-6 max-w-[1600px] mx-auto w-full space-y-4 animate-pulse">
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl w-64"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl w-full"></div>
          <div className="grid grid-cols-12 gap-4 h-[420px]">
            <div className="col-span-3 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="col-span-6 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="col-span-3 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !driver) {
    return (
      <DashboardLayout active="Drivers" title="Driver Details">
        <div className="p-6 max-w-[1600px] mx-auto w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">Driver Account Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md">
            The requested driver profile does not exist or may have been deleted from MERCON.
          </p>
          <Button onClick={() => navigate('/drivers')} size="sm" className="mt-2 text-xs font-bold bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-xs">
            Return to Drivers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const assignedVehicle = driver.assignedVehicle;
  const driverName = personName(driver) || EMPTY;
  const photoUrl = driverPhotoUrl(driver.avatar_url);

  // Saves the photo under the driver's name (a plain <a download> would use the upload's random file name).
  const downloadPhoto = async () => {
    if (!photoUrl) return;
    setIsDownloadingPhoto(true);
    try {
      const res = await fetch(photoUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const base = `${driver.first_name} ${driver.last_name}`.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'driver';
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${base}.${ext}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error('Could not download the photo');
    } finally {
      setIsDownloadingPhoto(false);
    }
  };

  // Active / Live trip
  const activeTrip = trips.find((t: any) => {
    const s = (t.status || '').toLowerCase();
    return s === 'intransit' || s === 'loading' || s === 'delayed' || s === 'atpickup' || s === 'atdelivery' || s === 'dispatched';
  });

  // Vehicle resolution for navigation
  const targetVehicle = assignedVehicle || activeTrip?.vehicle || (trips.length > 0 ? trips[0]?.vehicle : null);
  const vehicleId = targetVehicle?.id || (driver as any)?.assigned_vehicle_id || (driver as any)?.assignedVehicleId;

  // Phone & WhatsApp formatting for quick contact actions
  const phoneRaw = driver.phone_primary || '';
  const phoneDisplayStr = fmtPhone(phoneRaw);
  const whatsappNumber = saPhoneDigits(phoneRaw);

  const DRIVER_TRIPS_PER_PAGE = 3;
  const totalDriverTripPages = Math.max(1, Math.ceil(searchedDriverTrips.length / DRIVER_TRIPS_PER_PAGE));
  const safeDriverTripPage = Math.min(driverTripPage, totalDriverTripPages);
  const paginatedDriverTrips = searchedDriverTrips.slice((safeDriverTripPage - 1) * DRIVER_TRIPS_PER_PAGE, safeDriverTripPage * DRIVER_TRIPS_PER_PAGE);

  const selectedTrip = selectedTripIdForPreview ? trips.find((t: any) => t.id === selectedTripIdForPreview) : null;

  return (
    <DashboardLayout active="Drivers" title="Driver Details">
      <div className={cn(dk.page, 'h-[calc(100vh-60px)] max-h-[calc(100vh-60px)] overflow-hidden')}>

        {/* ── HEADER: photo, name, 3 KPI cards ── */}
        <div className="flex items-stretch gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setIsPhotoOpen(true)}
            title={photoUrl ? 'View, download or change photo' : 'Add a photo'}
            className={cn(dk.avatar, 'cursor-pointer hover:ring-2 hover:ring-[#FA634E]/40 transition-shadow')}
          >
            {/* Driver photo; initials when none is on file or it fails to load. */}
            <DriverAvatar src={driver.avatar_url} firstName={driver.first_name} lastName={driver.last_name} size="lg" className="w-full h-full text-3xl" imgClassName="object-top" />
          </button>

          <div className="flex-1 flex flex-col justify-end gap-2 min-w-0">
            <DetailTitleRow
              title={driverName}
              status={<StatusPill tone={entityStatusTone(driver.status)} size="lg">{entityStatusLabel(driver.status)}</StatusPill>}
              onEdit={() => navigate(`/drivers/${driver.id}/edit`)}
              menu={
                <>
                  <DropdownMenuItem onClick={handleExportDossier} className="font-semibold cursor-pointer text-xs">
                    <Download className="w-3.5 h-3.5 mr-2 text-slate-500" /> Export Dossier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-rose-600 font-semibold cursor-pointer text-xs">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Account
                  </DropdownMenuItem>
                </>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1.3fr_0.8fr_1.1fr] gap-3 xl:gap-4 shrink-0">
              <KpiCard
                icon={Truck}
                iconClass="text-[#FA634E]"
                label="Truck"
                value={targetVehicle?.plate_number || 'Unassigned'}
                sub={targetVehicle ? (targetVehicle.asset_type || EMPTY) : 'No truck assigned'}
                onClick={() => navigate(vehicleId ? `/vehicles/${vehicleId}` : '/vehicles')}
                title="View truck details"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
              />
              <KpiCard
                icon={Phone}
                iconClass="text-emerald-600 dark:text-emerald-400"
                label="Phone Number"
                value={phoneDisplayStr}
                sub="Primary contact"
                trailing={phoneRaw ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a href={`tel:+${whatsappNumber}`} className={cn(dk.iconButton, 'w-8 h-8 rounded-lg')} title="Call Driver" aria-label="Call Driver">
                      <PhoneCall className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </a>
                    <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className={cn(dk.iconButton, 'w-8 h-8 rounded-lg')} title="Send WhatsApp Message" aria-label="Send WhatsApp Message">
                      <WhatsAppIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </a>
                  </div>
                ) : undefined}
              />
              {(() => {
                // Licence number + expiry were required on create but shown nowhere.
                const expiry = driver.license_expiry ? new Date(driver.license_expiry) : null;
                const days = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86_400_000) : null;
                const tone = days == null ? '' : days < 0 ? 'text-rose-600 dark:text-rose-400' : days <= 30 ? 'text-amber-600 dark:text-amber-400' : '';
                return (
                  <KpiCard
                    icon={ShieldCheck}
                    iconClass={days != null && days < 0 ? 'text-rose-600' : days != null && days <= 30 ? 'text-amber-600' : 'text-indigo-600 dark:text-indigo-400'}
                    label="Licence"
                    value={driver.license_number || 'Not recorded'}
                    mono={!!driver.license_number}
                    sub={
                      expiry ? (
                        <span className={tone}>
                          {days! < 0 ? 'Expired ' : 'Expires '}
                          {formatInDeploymentTz(driver.license_expiry, tz, 'd MMM yyyy')}
                          {days! >= 0 && days! <= 30 ? ` · in ${days} day${days === 1 ? '' : 's'}` : ''}
                        </span>
                      ) : 'No expiry date'
                    }
                  />
                );
              })()}
              <KpiCard
                icon={Smartphone}
                iconClass={phone?.status.level === 'red' ? 'text-rose-600' : phone?.status.level === 'amber' ? 'text-amber-600' : 'text-emerald-600 dark:text-emerald-400'}
                label="Phone & App"
                value={
                  <span className="flex items-center gap-2">
                    <PhoneDot level={phone?.status.level} />
                    {phone ? PHONE_LEVEL_LABEL[phone.status.level] : '…'}
                  </span>
                }
                sub={phone ? (phone.status.reasons[0] ?? `Seen ${timeAgo(phone.status.lastSeenAt)}`) : 'Checking phone…'}
                onClick={() => setPhoneSheetOpen(true)}
                title="Phone status, notifications and activity"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
              />
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT GRID (3 COLUMNS) ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch w-full flex-1 min-h-0">

          {/* COLUMN 1 (LEFT): Trips */}
          <div className={cn(dk.panel, 'xl:col-span-3 h-full')}>
            <PanelHeader
              icon={Truck}
              title="Trips"
              count={trips.length}
              right={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs shrink-0 cursor-pointer">
                      <Calendar className="w-3.5 h-3.5 text-[#FA634E]" />
                      <span>
                        {tripDateFilter === 'all' && 'All Time'}
                        {tripDateFilter === 'this_month' && 'This Month'}
                        {tripDateFilter === '30d' && 'Last 30 Days'}
                        {tripDateFilter === '90d' && 'Last 90 Days'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-xl z-50">
                    {([['all', 'All Time'], ['this_month', 'This Month'], ['30d', 'Last 30 Days'], ['90d', 'Last 90 Days']] as const).map(([key, label]) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => { setTripDateFilter(key); setDriverTripPage(1); }}
                        className={cn('font-bold text-xs cursor-pointer', tripDateFilter === key && 'text-[#FA634E]')}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />

            <PanelSearch
              value={driverTripSearch}
              onChange={(v) => { setDriverTripSearch(v); setDriverTripPage(1); }}
              placeholder="Search driver trips..."
            />

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 py-1">
              {searchedDriverTrips.length === 0 ? (
                <EmptyState icon={Truck} title="No Trips Found" text="No matching trip records for this driver." />
              ) : (
                paginatedDriverTrips.map((t) => (
                  <TripCard
                    key={t.id}
                    refId={t.ref_id}
                    status={t.status}
                    amountLabel="Driver Payout"
                    amount={t.driverPayout}
                    origin={t.origin}
                    destination={t.destination}
                    date={t.dateStr}
                    footLabel="Customer"
                    footValue={t.customerName}
                    footLeading={t.customerLogo
                      ? <img src={t.customerLogo} alt={t.customerName} className="w-4 h-4 object-contain shrink-0" />
                      : <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
                    selected={selectedTripIdForPreview === t.id && !selectedDocIdForPreview}
                    onClick={() => {
                      if (selectedTripIdForPreview === t.id && !selectedDocIdForPreview) {
                        setSelectedTripIdForPreview(null);
                      } else {
                        setSelectedTripIdForPreview(t.id);
                        setSelectedDocIdForPreview(null);
                      }
                    }}
                  />
                ))
              )}
            </div>

            <ListPager page={safeDriverTripPage} totalPages={totalDriverTripPages} onPage={setDriverTripPage} />
            <ViewAllButton
              onClick={() => navigate(`/trips?driver=${driver.id}&driver_id=${driver.id}&driver_name=${encodeURIComponent(driverName)}&view=table`)}
            />
          </div>

          {/* COLUMN 2 (MIDDLE): document preview, selected trip, live trip, or performance */}
          {selectedDocIdForPreview ? (
            <RealDocumentPreviewMiddleBox
              docId={selectedDocIdForPreview}
              onClose={() => setSelectedDocIdForPreview(null)}
              onDeleteDocument={(delId) => setDeletedDocIds((prev) => [...prev, delId])}
            />
          ) : selectedTrip || activeTrip ? (
            <div className={cn(dk.panel, 'xl:col-span-6 h-full')}>
              <TripPreview
                facts={tripFacts(selectedTrip || activeTrip, tz, { vehiclePlate: assignedVehicle?.plate_number })}
                stops={(selectedTrip || activeTrip).stops || []}
                tz={tz}
                onBack={selectedTrip ? () => setSelectedTripIdForPreview(null) : undefined}
                backLabel="Back to Performance"
                onOpen={() => navigate(`/trips/${(selectedTrip || activeTrip).id}`)}
              />
            </div>
          ) : (
            <div className={cn(dk.panel, 'xl:col-span-6 h-full')}>
              <PanelHeader
                icon={BarChart2}
                title="Performance"
                right={<StatusPill tone="slate">No active trip</StatusPill>}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0">
                <MetricCard tone="green" label="On-Time" icon={ShieldCheck} value={kpiMetrics.onTimePct} pill={kpiMetrics.onTimePill} />
                <MetricCard tone="coral" label="Driver Payout" icon={Banknote} value={kpiMetrics.driverPayoutFormatted} pill={kpiMetrics.driverPayoutPill} />
                <MetricCard tone="indigo" label="Distance" icon={Gauge} value={kpiMetrics.distanceFormatted} pill={kpiMetrics.distancePill} />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 my-3 min-h-[96px]">
                <Clock className="w-6 h-6 text-[#FA634E] mb-2 shrink-0" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white">No Active Trip</h4>
                <p className="text-xs font-medium text-slate-400 max-w-xs mt-0.5">
                  This driver is not on a trip right now. Pick a trip on the left to preview it.
                </p>
              </div>

              {recentTripsList.length > 0 && (
                <div className="shrink-0 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p className={dk.label}>Latest Trips</p>
                  {recentTripsList.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => { setSelectedTripIdForPreview(t.id); setSelectedDocIdForPreview(null); }}
                      className="p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-[#FA634E]/60 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono font-black text-slate-900 dark:text-white">{t.ref_id}</span>
                          <span className="text-[11px] font-medium text-slate-400 truncate">{t.dateStr}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5 capitalize">
                          {t.origin} <span className="text-slate-400 font-normal">→</span> {t.destination}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-black font-mono text-[#FA634E]">{t.driverPayout}</span>
                        <TripStatusPill status={t.status} />
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* ════════════════════════════════════════════════
              COLUMN 3 (RIGHT): Documents Box (xl:col-span-3)
              Max 5-6 visible at once, scrollable if more
             ════════════════════════════════════════════════ */}
          <div className="xl:col-span-3 flex flex-col h-full min-h-[460px] max-h-[480px] overflow-hidden">
            <DriverDocumentsValidityFolder
              driverId={driver.id}
              selectedDocumentId={selectedDocIdForPreview}
              deletedDocIds={deletedDocIds}
              onDeleteDocument={(delId) => setDeletedDocIds((prev) => [...prev, delId])}
              onSelectDocument={(docId) => {
                if (!docId || selectedDocIdForPreview === docId) {
                  setSelectedDocIdForPreview(null);
                } else {
                  setSelectedDocIdForPreview(docId);
                  setSelectedTripIdForPreview(null);
                }
              }}
            />
          </div>

        </div>

        <DriverPhoneSheet driverId={driver.id} driverName={driverName} open={phoneSheetOpen} onOpenChange={setPhoneSheetOpen} />

        {/* ── DELETE DRIVER CONFIRMATION MODAL ── */}
        {/* Profile photo: view large, download, or change it on the edit page. */}
        <Dialog open={isPhotoOpen} onOpenChange={setIsPhotoOpen}>
          <DialogContent className="max-w-md w-[92vw]">
            <DialogHeader>
              <DialogTitle>{driverName} — Profile photo</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-2">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={driverName}
                  className="max-h-[60vh] w-auto max-w-full object-contain rounded-xl border border-slate-100 dark:border-slate-800"
                />
              ) : (
                <p className="text-sm text-slate-500 py-8">No photo on file yet.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              {photoUrl && (
                <Button variant="outline" onClick={downloadPhoto} disabled={isDownloadingPhoto}>
                  {isDownloadingPhoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download
                </Button>
              )}
              <Button onClick={() => navigate(`/drivers/${driver.id}/edit`)}>
                <Edit2 className="w-4 h-4 mr-2" /> {photoUrl ? 'Change photo' : 'Add photo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
          <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-2 border-slate-200 dark:border-slate-800">
            <DialogHeader className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-955/20">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-450">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <DialogTitle className="text-base font-extrabold">Delete Driver Account</DialogTitle>
              </div>
              <DialogDescription className="text-xs font-medium text-slate-500 mt-2">
                Deleting driver <strong className="text-slate-900 dark:text-slate-100">{driver.first_name} {driver.last_name}</strong> will revoke access and archive driver records. Enter admin password to proceed.
                {driverUsage && (
                  driverUsage.totalTrips > 0 || driverUsage.expenses > 0 ? (
                    <>
                      {' '}They have {driverUsage.totalTrips} trip{driverUsage.totalTrips === 1 ? '' : 's'}
                      {driverUsage.activeTrips > 0 ? ` (${driverUsage.activeTrips} active)` : ''} and {driverUsage.expenses} expense{driverUsage.expenses === 1 ? '' : 's'} linked.
                    </>
                  ) : ' They have no linked trips or records.'
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleDeleteSubmit}>
              <div className="p-6 space-y-4">
                {deleteError && (
                  <div className="p-3 rounded-2xl bg-rose-50 border-2 border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="admin_password" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                    Admin Password <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="admin_password"
                    type="password"
                    placeholder="Enter your admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 text-sm border-2 rounded-2xl border-slate-200 dark:border-slate-800"
                    required
                  />
                </div>
              </div>

              <DialogFooter className="px-6 py-4 border-t-2 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsDeleteModalOpen(false); setPassword(''); setDeleteError(''); }}
                  className="text-xs font-bold rounded-xl px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 h-auto rounded-xl shadow-none"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


      </div>
    </DashboardLayout>
  );
}
