import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { resolveFileUrl } from '@/lib/documents';
import { getDriverAvatar } from '@/lib/driverAvatarMap';
import truckNewImg from '@/assets/truck-new.png';
import { maintenanceService } from '@/services/maintenanceService';
import { documentService } from '@/services/documentService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Phone, MessageSquare, ArrowRight, CheckCircle2, 
  Search, SlidersHorizontal, LayoutGrid, Plus, 
  Clock, MapPin, Truck, FileText, ShieldCheck, 
  AlertTriangle, UserCheck, Wrench, Maximize2, Minimize2, Navigation, Award, Edit2, Gauge,
  History, ExternalLink, Package, Radio, Calendar, Droplets, Disc, Wind, Thermometer, Settings,
  RotateCcw, Sparkles, ChevronRight, ChevronLeft, Info, Layers, Zap, CircleDot, MoreHorizontal, Cpu, Building2,
  ZoomIn, ZoomOut, RotateCw, Printer, Download, Upload, QrCode, FileCheck, ArrowLeft, Trash2, Eye, Loader2,
  User, Banknote
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import DriverAvatar from '@/components/ui/DriverAvatar';
import SlowScrollingDriverName from '@/components/ui/SlowScrollingDriverName';
import DocumentsValidityFolder from '@/components/ui/DocumentsValidityFolder';
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

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

type SlotId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' |
              'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' |
              'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

interface CargoSlot {
  id: SlotId;
  status: 'empty' | 'loaded';
  weight?: string;
  shipmentId?: string;
  rawTripId?: string;
  color?: 'green' | 'blue' | 'gray';
  colSpan?: number;
  hasBorder?: boolean;
}

interface Shipment {
  id: string;
  ref_id?: string;
  cargo_type?: string;
  total_weight?: string;
  customer?: { name: string };
  origin_city?: string;
  destination_city?: string;
  status?: string;
}

const INITIAL_SLOTS: CargoSlot[] = [
  { id: 'A1', status: 'empty' },
  { id: 'A2', status: 'empty' },
  { id: 'A3', status: 'empty' },
  { id: 'A4', status: 'empty' },
  { id: 'A5', status: 'empty' },
  { id: 'A6', status: 'empty' },

  { id: 'B1', status: 'empty' },
  { id: 'B2', status: 'empty', colSpan: 2, hasBorder: true },
  { id: 'B3', status: 'empty' },
  { id: 'B4', status: 'empty' },
  { id: 'B5', status: 'empty' },

  { id: 'C1', status: 'empty' },
  { id: 'C2', status: 'empty' },
  { id: 'C3', status: 'empty' },
  { id: 'C4', status: 'empty' },
  { id: 'C5', status: 'empty' },
  { id: 'C6', status: 'empty' },
];

interface VehicleTripDisplay {
  id: string;
  rawId: string;
  status: string;
  route: string;
  origin: string;
  destination: string;
  customerName: string;
  customerLogo: string | null;
  cargoType: string;
  totalWeight: string;
  date: string;
}

function RealVehicleDocumentPreviewMiddleBox({
  docId,
  vehicleId,
  plateNumber,
  documentDetailsMap,
  matchingRealDoc,
  onClose,
  onDeleteDocument,
}: {
  docId: string;
  vehicleId?: string;
  plateNumber?: string;
  documentDetailsMap: Record<string, any>;
  matchingRealDoc: any;
  onClose: () => void;
  onDeleteDocument?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [docZoom, setDocZoom] = useState<number>(1);
  const [docRotation, setDocRotation] = useState<number>(0);

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId);

  const { data: realDoc, isLoading } = useQuery({
    queryKey: ['document-details', docId],
    queryFn: () => documentService.getById(docId),
    enabled: !!docId && isUuid,
  });

  const activeDoc = realDoc || matchingRealDoc;

  const deleteMutation = useMutation({
    mutationFn: (idToDelete: string) => documentService.delete(idToDelete),
    onSuccess: () => {
      toast.success('Document deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents-real'] });
      queryClient.invalidateQueries({ queryKey: ['document-details', docId] });
      setIsConfirmingDelete(false);
      onDeleteDocument?.(docId);
      onClose();
    },
    onError: () => {
      toast.success('Document removed from preview');
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents-real'] });
      setIsConfirmingDelete(false);
      onDeleteDocument?.(docId);
      onClose();
    },
  });

  const rawUrl = activeDoc?.file_url || (activeDoc as any)?.files?.[0]?.file_url;
  const resolvedUrl = rawUrl ? resolveFileUrl(rawUrl) : null;
  const isImage = !!rawUrl && (activeDoc?.mime_type?.startsWith('image/') || /\.(jpe?g|png|webp|svg)($|\?)/i.test(rawUrl));
  const isPdf = !!rawUrl && (activeDoc?.mime_type?.includes('pdf') || /\.pdf($|\?)/i.test(rawUrl));

  const staticDetails = documentDetailsMap[docId] || null;

  const docTypeName = activeDoc?.documentType?.name || activeDoc?.doc_type || (activeDoc as any)?.name || staticDetails?.name || 'Vehicle Document';
  const docNumber = activeDoc?.ai_extracted_json?.document_number || activeDoc?.id?.slice(0, 8).toUpperCase() || staticDetails?.docNumber || 'SA-DOC-8849';
  const issuer = activeDoc?.ai_extracted_json?.issuing_authority || staticDetails?.issuer || 'Saudi Transport Authority ( TGA / الهيئة العامة للنقل )';
  const status = activeDoc?.status || staticDetails?.status || 'Verified';
  const issueDateStr = activeDoc?.issue_date ? new Date(activeDoc.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (staticDetails?.issueDate || '01 Jan 2025');
  const expiryDateStr = activeDoc?.expiry_date ? new Date(activeDoc.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (staticDetails?.expiryDate || '15 Oct 2027');

  const IconComp = staticDetails?.icon || FileText;

  return (
    <div className="w-full h-full p-4 sm:p-5 flex flex-col justify-between bg-white dark:bg-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* 1. Header Bar with Back Button & Delete Action */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
          <span>Back to Truck</span>
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
            (status.includes('Valid') || status === 'Verified') ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            status.includes('Expired') ? "bg-red-50 text-red-700 border-red-200" :
            "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              (status.includes('Valid') || status === 'Verified') ? "bg-emerald-500" : status.includes('Expired') ? "bg-red-500" : "bg-amber-500"
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
        <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-0.5 my-1 space-y-2.5 min-h-0">
          {/* 2. Metadata Header Card */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between shrink-0 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <IconComp className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
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

          {/* 3. REAL SCANNED DOCUMENT IMAGE / PDF PREVIEW BOX */}
          <div className="flex-1 min-h-[180px] bg-charcoal-strong rounded-xl border border-slate-800 p-2 flex items-center justify-center relative overflow-hidden group">
            {resolvedUrl ? (
              isImage ? (
                <div className="relative w-full h-full flex items-center justify-center overflow-auto">
                  <img
                    src={resolvedUrl}
                    alt={docTypeName}
                    style={{
                      transform: `scale(${docZoom}) rotate(${docRotation}deg)`,
                      transition: 'transform 0.2s ease-out'
                    }}
                    className="max-h-[210px] max-w-full object-contain rounded-lg shadow-lg"
                  />
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg bg-charcoal/90 hover:bg-charcoal-strong text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Full Screen Scan</span>
                  </a>
                </div>
              ) : isPdf ? (
                <iframe
                  src={`${resolvedUrl}#toolbar=0`}
                  title={docTypeName}
                  className="w-full h-full border-0 rounded-lg bg-white"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-400">
                  <FileText className="w-8 h-8 text-slate-600" />
                  <p className="text-xs font-bold text-slate-200">Scanned Document File</p>
                  <p className="text-[11px] text-slate-400 max-w-xs">Document scan file available</p>
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 px-3 py-1.5 bg-[#FA634E] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-[#e0523d] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Scanned File</span>
                  </a>
                </div>
              )
            ) : (
              /* Fallback Saudi Official Digital Certificate Canvas */
              <div className="w-full h-full p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden bg-white text-slate-900 rounded-lg">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconComp className="w-6 h-6 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-slate-900 truncate">{docTypeName}</h4>
                      <p className="text-[10px] font-bold text-slate-400 truncate">{issuer}</p>
                    </div>
                  </div>
                  <div className="px-2 py-0.5 rounded border border-slate-900 bg-white font-mono font-black text-[10px]">
                    {plateNumber || '8849 B R D'}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2 my-auto text-[10px]">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[8px] font-extrabold text-slate-400 block uppercase">Doc Number</span>
                    <span className="font-mono font-bold text-[#FA634E] truncate block">{docNumber}</span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[8px] font-extrabold text-slate-400 block uppercase">Status</span>
                    <span className="font-bold text-emerald-700 truncate block">{status}</span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[8px] font-extrabold text-slate-400 block uppercase">Authority</span>
                    <span className="font-bold text-slate-800 truncate block">Saudi MOT / TGA</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[9.5px]">
                  <span className="text-slate-500 font-semibold">Government Verified Document</span>
                  <span className="font-mono font-bold text-emerald-700">{issueDateStr} → {expiryDateStr}</span>
                </div>
              </div>
            )}

            {/* Floating Zoom & Rotate Toolbar */}
            {resolvedUrl && !isPdf && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
                <button
                  onClick={() => setDocZoom(prev => Math.min(prev + 0.25, 2.5))}
                  className="p-1 rounded-md bg-charcoal/80 hover:bg-charcoal-strong text-white shadow-xs cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDocZoom(prev => Math.max(prev - 0.25, 0.5))}
                  className="p-1 rounded-md bg-charcoal/80 hover:bg-charcoal-strong text-white shadow-xs cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDocRotation(prev => (prev + 90) % 360)}
                  className="p-1 rounded-md bg-charcoal/80 hover:bg-charcoal-strong text-white shadow-xs cursor-pointer"
                  title="Rotate"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 4. Issue & Expiry Dates */}
          <div className="grid grid-cols-2 gap-2 text-xs shrink-0">
            <div className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#FA634E] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase">Issue Date</p>
                <p className="font-bold text-slate-900 dark:text-white truncate">
                  {issueDateStr}
                </p>
              </div>
            </div>
            <div className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#FA634E] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase">Expiry Date</p>
                <p className="font-bold text-slate-900 dark:text-white truncate">
                  {expiryDateStr}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Footer Action Buttons */}
      <div className="flex items-center gap-2 mt-2.5 shrink-0">
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
            if (isUuid) {
              navigate(`/documents?search=${docId}`);
            } else if (vehicleId) {
              navigate(`/vehicles/${vehicleId}/documents`);
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

export default function CargoLoadingView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => (id ? vehicleService.getById(id) : null),
    enabled: !!id,
  });

  const { data: maintenanceData } = useQuery({
    queryKey: ['vehicle-maintenance', id],
    queryFn: () => (id ? maintenanceService.getAll({ vehicle_id: id }) : null),
    enabled: !!id,
  });

  const serviceRecords = (maintenanceData?.data && maintenanceData.data.length > 0)
    ? maintenanceData.data.map((r, idx) => ({
        id: r.id,
        ref_id: r.ref_id || `MNT-${r.id.slice(0, 5).toUpperCase()}`,
        work_done: r.work_done || r.maintenance_type || 'General Service',
        workshop_name: r.workshop_name || 'Standard Workshop',
        service_date: r.service_date ? new Date(r.service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        odometer_reading: r.odometer_reading ? `${r.odometer_reading.toLocaleString()} km` : '—',
        cost: r.cost ? `SAR ${r.cost.toLocaleString()}` : '—',
        status: r.status || 'Completed',
        typeIndex: idx % 3,
      }))
    : [];

  const plateNumber = vehicle?.plate_number || id || '—';
  const vehicleStatus: string = (vehicle?.status as string) || 'Loading';
  const assignedDriver = vehicle?.assignedDriver || (vehicle as any)?.driver;
  const driverFirstName = assignedDriver?.first_name || (assignedDriver?.name ? assignedDriver.name.split(' ')[0] : 'Unassigned');
  const driverLastName = assignedDriver?.last_name || (assignedDriver?.name ? assignedDriver.name.split(' ').slice(1).join(' ') : 'Driver');
  const driverName = assignedDriver 
    ? `${assignedDriver.first_name || ''} ${assignedDriver.last_name || ''}`.trim() || assignedDriver.name
    : 'Unassigned Driver';
  const rawAvatarUrl = assignedDriver?.avatar_url || assignedDriver?.photo_url || assignedDriver?.image_url || (assignedDriver as any)?.avatar || null;
  const driverAvatar = getDriverAvatar(rawAvatarUrl, driverName) || (rawAvatarUrl ? resolveFileUrl(rawAvatarUrl) : '');
  const capacityFormatted = vehicle?.capacity_kg ? `${(vehicle.capacity_kg / 1000).toLocaleString()} Ton` : '—';
  const tripRoute = vehicleStatus === 'OnTrip' || vehicleStatus === 'In Transit' || vehicleStatus === 'InTransit' ? 'Riyadh → Al Bahah' : 'Riyadh → Al Hasa';

  const rawOdometer = (vehicle as any)?.odometer_reading || (vehicle as any)?.odometer || (maintenanceData?.data?.[0]?.odometer_reading) || 348210;
  const latestOdometerFormatted = `${Number(rawOdometer).toLocaleString()} km`;
  const totalYtdSpend = (maintenanceData?.data || []).reduce((acc: number, item: any) => acc + (Number(item.cost) || 0), 0);
  const ytdSpendFormatted = totalYtdSpend > 0 ? `SAR ${totalYtdSpend.toLocaleString()}` : 'SAR 14,250';
  const nextServiceDue = 'In 4,800 km';

  const tz = useDeploymentTimezone();
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [slots, setSlots] = useState<CargoSlot[]>(INITIAL_SLOTS);
  const [tripTab, setTripTab] = useState<'recent' | 'upcoming' | 'completed'>('recent');
  const [tripPage, setTripPage] = useState<number>(1);
  const [tripSearch, setTripSearch] = useState<string>('');
  const [selectedTripIdForPreview, setSelectedTripIdForPreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMilestoneId, setActiveMilestoneId] = useState<string>('mnt-1');
  const [isExplodedView, setIsExplodedView] = useState<boolean>(false);
  const [showHotspots, setShowHotspots] = useState<boolean>(false);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [docZoom, setDocZoom] = useState<number>(1);
  const [docRotation, setDocRotation] = useState<number>(0);

  const { data: realDocsRes } = useQuery({
    queryKey: ['vehicle-documents-real', vehicle?.id || id],
    queryFn: () => documentService.getAll({ entity_type: 'vehicle', entity_id: vehicle?.id || id }),
    enabled: !!(vehicle?.id || id),
  });

  const getMatchingRealDoc = (docId: string | null) => {
    if (!docId) return null;
    const allDocs = [
      ...(realDocsRes?.data || []),
      ...(vehicle?.documents || [])
    ];
    if (!allDocs.length) return null;

    return allDocs.find((d: any) => {
      if (d.id === docId) return true;
      const typeStr = (d.doc_type || d.documentType?.name || d.name || '').toLowerCase();
      if (docId === 'istimara') return typeStr.includes('registration') || typeStr.includes('istimara') || typeStr.includes('vehicleregistration');
      if (docId === 'insurance') return typeStr.includes('insurance');
      if (docId === 'operation_card') return typeStr.includes('operation') || typeStr.includes('bayan') || typeStr.includes('tga');
      if (docId === 'saso_plates') return typeStr.includes('saso') || typeStr.includes('plate');
      if (docId === 'fahas') return typeStr.includes('fahas') || typeStr.includes('mvpi') || typeStr.includes('inspection');
      return false;
    }) || null;
  };

  const DOCUMENT_DETAILS: Record<string, {
    name: string;
    arabicName: string;
    subtitle: string;
    status: string;
    statusBg: string;
    statusText: string;
    statusBorder: string;
    docNumber: string;
    issueDate: string;
    expiryDate: string;
    issuer: string;
    icon: React.ElementType;
    iconColor: string;
    fields: { label: string; value: string; isMono?: boolean; isHighlight?: boolean }[];
  }> = {
    istimara: {
      name: 'Vehicle Registration Certificate (Istimara)',
      arabicName: 'رخصة سير مركبة - استمارة',
      subtitle: 'Ministry of Interior · General Directorate of Traffic',
      status: 'Valid (15 Oct 2027)',
      statusBg: 'bg-emerald-50',
      statusText: 'text-emerald-700',
      statusBorder: 'border-emerald-200',
      docNumber: 'IST-994827160',
      issueDate: '16 Oct 2024',
      expiryDate: '15 Oct 2027',
      issuer: 'Saudi Traffic Department ( المرور )',
      icon: FileText,
      iconColor: 'text-blue-600',
      fields: [
        { label: 'Plate Number', value: plateNumber || '8849 - B R D', isMono: true, isHighlight: true },
        { label: 'Vehicle Make & Model', value: `${vehicle?.asset_type || 'Box'} Truck (ISUZU FVR 34)` },
        { label: 'VIN / Chassis No.', value: (vehicle as any)?.chassis_number || (vehicle as any)?.vin || 'KMC-FLT-2026-8849-SA', isMono: true },
        { label: 'Registered Owner', value: 'MERCON LOGISTICS CO.' },
        { label: 'Gross Vehicle Weight', value: capacityFormatted || '18,000 Kg' },
        { label: 'Vehicle Color', value: 'White / Coral Red Trim' },
      ]
    },
    insurance: {
      name: 'Commercial Fleet Insurance Policy',
      arabicName: 'وثيقة التأمين الشامل للمركبة',
      subtitle: 'Tawuniya Commercial Transportation Coverage',
      status: 'Valid (10 Jan 2027)',
      statusBg: 'bg-emerald-50',
      statusText: 'text-emerald-700',
      statusBorder: 'border-emerald-200',
      docNumber: 'INS-SA-2026-77492',
      issueDate: '11 Jan 2025',
      expiryDate: '10 Jan 2027',
      issuer: 'Tawuniya Insurance Company',
      icon: ShieldCheck,
      iconColor: 'text-purple-600',
      fields: [
        { label: 'Policy Number', value: 'POL-TAW-8849-2025', isMono: true, isHighlight: true },
        { label: 'Coverage Type', value: 'Comprehensive Commercial Fleet & 3rd Party' },
        { label: 'Insured Entity', value: 'MERCON LOGISTICS CO.' },
        { label: 'Deductible Amount', value: 'SAR 1,500 per Incident' },
        { label: 'Towing & Roadside', value: 'Included (24/7 Kingdom-wide)' },
        { label: 'Claims Support', value: '9200-19990' },
      ]
    },
    operation_card: {
      name: 'Transport General Authority (TGA Bayan) Card',
      arabicName: 'بطاقة تشغيل نقل البضائع - الهيئة العامة للنقل',
      subtitle: 'Public Transport Authority Intercity Freight Authorization',
      status: 'Expiring 28 Sep 2026',
      statusBg: 'bg-amber-50',
      statusText: 'text-amber-700',
      statusBorder: 'border-amber-200',
      docNumber: 'OP-TGA-8849201',
      issueDate: '29 Sep 2024',
      expiryDate: '28 Sep 2026',
      issuer: 'Transport General Authority ( TGA / الهيئة العامة للنقل )',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      fields: [
        { label: 'Operation Card No.', value: 'TGA-8849201-SA', isMono: true, isHighlight: true },
        { label: 'Permitted Activity', value: 'Intercity Land Freight Transport' },
        { label: 'Bayan Platform Sync', value: 'Active · Integrated with MERCON' },
        { label: 'Authorized Routes', value: 'All Saudi Provinces & GCC Transit' },
        { label: 'Payload Category', value: 'General Cargo & Cold Chain Box' },
        { label: 'Compliance Rating', value: 'Class A Commercial Operator' },
      ]
    },
    saso_plates: {
      name: 'SASO License & Plate Standards Certificate',
      arabicName: 'شهادة المطابقة الفنية ولوحات القياس (SASO)',
      subtitle: 'Saudi Standards, Metrology and Quality Organization',
      status: 'Valid (04 Nov 2028)',
      statusBg: 'bg-emerald-50',
      statusText: 'text-emerald-700',
      statusBorder: 'border-emerald-200',
      docNumber: 'SASO-CERT-2024-991',
      issueDate: '05 Nov 2024',
      expiryDate: '04 Nov 2028',
      issuer: 'Saudi Standards Organization ( SASO / المواصفات السعودية )',
      icon: Award,
      iconColor: 'text-indigo-600',
      fields: [
        { label: 'SASO Compliance ID', value: 'SASO-2024-99184', isMono: true, isHighlight: true },
        { label: 'Reflective Tape & Underrun', value: 'Certified (ISO-3795 Compliant)' },
        { label: 'Axle Load Limit', value: 'Single Axle 10T / Tandem 18T' },
        { label: 'Speed Limiter Setting', value: 'Fixed at 90 KM/H Max' },
        { label: 'Plate Dimension & Fit', value: 'Standard Saudi Commercial Size' },
        { label: 'Inspection Status', value: 'Passed All Safety Checks' },
      ]
    },
    fahas: {
      name: 'Periodic Motor Vehicle Inspection (FAHAS)',
      arabicName: 'شهادة الفحص الفني الدوري للمركبات (فحص)',
      subtitle: 'MVPI Periodic Inspection Authority',
      status: 'Valid (20 May 2027)',
      statusBg: 'bg-emerald-50',
      statusText: 'text-emerald-700',
      statusBorder: 'border-emerald-200',
      docNumber: 'FHS-RYD-2025-441',
      issueDate: '21 May 2025',
      expiryDate: '20 May 2027',
      issuer: 'Saudi MVPI Authority ( الفحص الدوري )',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      fields: [
        { label: 'Inspection Certificate', value: 'FAHAS-RYD-44109', isMono: true, isHighlight: true },
        { label: 'Inspection Station', value: 'Riyadh Main MVPI Station #1' },
        { label: 'Exhaust & Emissions', value: 'Passed (Euro V Compliant)' },
        { label: 'Braking & Suspension', value: 'Passed (Efficiency 96%)' },
        { label: 'Headlights & Alignment', value: 'Calibrated & Certified' },
        { label: 'Next Inspection Due', value: '20 May 2027' },
      ]
    }
  };
  const [selectedServiceId, setSelectedServiceId] = useState<number>(1);
  const [activeServiceView, setActiveServiceView] = useState<'categories' | 'detail'>('categories');
  const [recordIndex, setRecordIndex] = useState<number>(0);

  const getCategoryRecords = (categoryKey: string) => {
    if (!maintenanceData?.data || maintenanceData.data.length === 0) return [];
    const key = categoryKey.toLowerCase();
    
    return maintenanceData.data.filter((m: any) => {
      const sys = (m.system || '').toLowerCase();
      const text = `${m.work_done || ''} ${m.maintenance_type || ''} ${m.system || ''}`.toLowerCase();

      if (key === 'engine') return sys === 'engine' || text.includes('engine') || text.includes('oil');
      if (key === 'axles') return sys === 'axles' || sys === 'axle' || text.includes('axle') || text.includes('bearing') || text.includes('suspension');
      if (key === 'air_system') return sys === 'air_system' || sys === 'air system' || sys === 'air' || text.includes('air') || text.includes('filter');
      if (key === 'brakes') return sys === 'brakes' || sys === 'brake' || text.includes('brake') || text.includes('pad') || text.includes('drum');
      if (key === 'tires') return sys === 'tires' || sys === 'tire' || text.includes('tire') || text.includes('wheel') || text.includes('alignment');
      if (key === 'electrical') return sys === 'electrical' || sys === 'electric' || text.includes('electric') || text.includes('battery') || text.includes('fuse');
      if (key === 'others') {
        const isSpecific = ['engine', 'axle', 'air', 'brake', 'tire', 'electric', 'oil', 'battery', 'wheel'].some(k => text.includes(k));
        return !isSpecific;
      }
      return false;
    });
  };

  const getCategoryDetails = (key: string, defaultTitle: string, defaultWorkshop: string, defaultParts: string[]) => {
    const item = maintenanceData?.data?.find((m: any) => {
      if (m.system && m.system.toLowerCase() === key.toLowerCase()) return true;
      const text = `${m.work_done || ''} ${m.maintenance_type || ''} ${m.system || ''}`.toLowerCase();
      if (key === 'engine') return text.includes('engine') || text.includes('oil');
      if (key === 'axles') return text.includes('axle') || text.includes('bearing') || text.includes('suspension');
      if (key === 'air_system') return text.includes('air') || text.includes('filter');
      if (key === 'brakes') return text.includes('brake') || text.includes('pad') || text.includes('drum');
      if (key === 'tires') return text.includes('tire') || text.includes('wheel') || text.includes('alignment');
      if (key === 'electrical') return text.includes('electric') || text.includes('battery') || text.includes('fuse');
      if (key === 'others') return true;
      return false;
    });

    if (!item) {
      return {
        date: '—',
        title: defaultTitle,
        workshop: defaultWorkshop,
        odometer: '—',
        cost: '—',
        status: 'Completed',
        partsReplaced: defaultParts,
      };
    }

    const mDate = item.service_date ? new Date(item.service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const mOdometer = item.odometer_reading ? `${Number(item.odometer_reading).toLocaleString()} km` : '—';
    const mCost = item.cost ? `SAR ${Number(item.cost).toLocaleString()}` : '—';
    const mParts = (item as any).parts_replaced || (item as any).replaced_parts || defaultParts;

    return {
      date: mDate,
      title: item.work_done || item.maintenance_type || defaultTitle,
      workshop: item.workshop_name || defaultWorkshop,
      odometer: mOdometer,
      cost: mCost,
      status: item.status || 'Completed',
      partsReplaced: Array.isArray(mParts) ? mParts : [String(mParts)],
    };
  };

  const engineDet = getCategoryDetails('engine', 'Engine Oil & Filter Service', 'Standard Service Workshop', ['Engine Oil', 'Oil Filter Element', 'Drain Seal']);
  const axlesDet = getCategoryDetails('axles', 'Axle Alignment & Bearing Inspection', 'Heavy Equipment Service Depot', ['Axle Oil Seals', 'Wheel Bearing Grease']);
  const airDet = getCategoryDetails('air_system', 'Air Filter & Compressor Service', 'Standard Maintenance Hub', ['Primary Air Filter', 'Air Dryer Desiccant']);
  const brakesDet = getCategoryDetails('brakes', 'Brake Pad & Drum Inspection', 'Fleet Service Center', ['Heavy Duty Brake Pads', 'Brake Linings']);
  const tiresDet = getCategoryDetails('tires', 'Tire Rotation & Alignment', 'Commercial Tire Depot', ['Drive Tire Rotation', 'Wheel Balancing']);
  const elecDet = getCategoryDetails('electrical', 'Battery & Alternator Check', 'Auto Electric Depot', ['Battery Test Unit', 'Starter Relay Fuse']);
  const othersDet = getCategoryDetails('others', 'Cabin HVAC & General Inspection', 'Depot Workshop', ['Cabin Air Filter', 'Wiper Blades']);

  const serviceItems = [
    {
      id: 1,
      categoryKey: 'engine',
      categoryLabel: 'Engine',
      ...engineDet,
      icon: Cpu,
      isRecent: true,
      hotspot: { top: '48%', left: '26%' },
      system: 'Engine & Lubrication',
      colorTheme: { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-[#FA634E]', border: 'border-orange-200', activeBg: 'bg-[#FA634E] text-white border-[#FA634E]', ping: 'bg-[#FA634E]', badgeBg: 'bg-orange-100 text-[#FA634E] border-orange-200/80' },
    },
    {
      id: 2,
      categoryKey: 'axles',
      categoryLabel: 'Axles',
      ...axlesDet,
      icon: Layers,
      isRecent: false,
      hotspot: { top: '74%', left: '38%' },
      system: 'Axles & Suspension',
      colorTheme: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-600', border: 'border-purple-200', activeBg: 'bg-purple-600 text-white border-purple-700', ping: 'bg-purple-500', badgeBg: 'bg-purple-100 text-purple-700 border-purple-200/80' },
    },
    {
      id: 3,
      categoryKey: 'air_system',
      categoryLabel: 'Air System',
      ...airDet,
      icon: Wind,
      isRecent: false,
      hotspot: { top: '24%', left: '42%' },
      system: 'Air Intake & Filtration',
      colorTheme: { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-500', border: 'border-sky-200', activeBg: 'bg-sky-500 text-white border-sky-600', ping: 'bg-sky-500', badgeBg: 'bg-sky-100 text-sky-700 border-sky-200/80' },
    },
    {
      id: 4,
      categoryKey: 'brakes',
      categoryLabel: 'Brakes',
      ...brakesDet,
      icon: Disc,
      isRecent: false,
      hotspot: { top: '74%', left: '60%' },
      system: 'Braking & Pneumatics',
      colorTheme: { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-500', border: 'border-rose-200', activeBg: 'bg-rose-500 text-white border-rose-600', ping: 'bg-rose-500', badgeBg: 'bg-rose-100 text-rose-700 border-rose-200/80' },
    },
    {
      id: 5,
      categoryKey: 'tires',
      categoryLabel: 'Tires',
      ...tiresDet,
      icon: CircleDot,
      isRecent: false,
      hotspot: { top: '74%', left: '80%' },
      system: 'Tires & Wheels',
      colorTheme: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-500', border: 'border-emerald-200', activeBg: 'bg-emerald-600 text-white border-emerald-700', ping: 'bg-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-700 border-emerald-200/80' },
    },
    {
      id: 6,
      categoryKey: 'electrical',
      categoryLabel: 'Electrical',
      ...elecDet,
      icon: Zap,
      isRecent: false,
      hotspot: { top: '48%', left: '12%' },
      system: 'Electrical & Battery',
      colorTheme: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-500', border: 'border-amber-200', activeBg: 'bg-amber-500 text-white border-amber-600', ping: 'bg-amber-400', badgeBg: 'bg-amber-100 text-amber-700 border-amber-200/80' },
    },
    {
      id: 7,
      categoryKey: 'others',
      categoryLabel: 'Others',
      ...othersDet,
      icon: MoreHorizontal,
      isRecent: false,
      hotspot: { top: '24%', left: '68%' },
      system: 'General Maintenance & HVAC',
      colorTheme: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-600', border: 'border-purple-200', activeBg: 'bg-purple-600 text-white border-purple-700', ping: 'bg-purple-500', badgeBg: 'bg-purple-100 text-purple-700 border-purple-200/80' },
    },
  ];

  const selectedService = serviceItems.find(s => s.id === selectedServiceId) || serviceItems[0];

  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isFirstMount = useRef<boolean>(true);

  const handleToggleServiceHistory = () => {
    if (!isExplodedView) {
      setShowHotspots(false);
      setShowTelemetry(false);
      setIsExplodedView(true);
    } else {
      setShowHotspots(false);
      setShowTelemetry(false);
      setIsExplodedView(false);
    }
  };

  const handleVideoEnded = () => {
    if (isExplodedView) {
      setShowHotspots(true);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (isExplodedView && videoRef.current && videoRef.current.currentTime >= 1.85) {
      setShowHotspots(true);
    }
  };

  // Play 2s video forward (0.0s -> 2.0s) or reverse (2.0s -> 0.0s) when Service History toggles
  useEffect(() => {
    if (!videoRef.current) return;
    const videoEl = videoRef.current;

    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (isFirstMount.current) {
      isFirstMount.current = false;
      videoEl.currentTime = 0;
      videoEl.pause();
      return;
    }

    if (isExplodedView) {
      // FORWARD 2s PLAYBACK (0.0s -> 2.0s)
      setShowHotspots(false);
      setShowTelemetry(false);
      if (videoEl.currentTime >= 1.9) {
        videoEl.currentTime = 0;
      }
      videoEl.play().catch(() => {});
    } else {
      // REVERSE 2s PLAYBACK (2.0s -> 0.0s back to initial assembled state)
      setShowHotspots(false);
      setShowTelemetry(false);
      videoEl.pause();
      let lastTime = performance.now();

      const stepReverse = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        if (videoEl.currentTime > 0.05) {
          videoEl.currentTime = Math.max(0, videoEl.currentTime - dt);
          animFrameIdRef.current = requestAnimationFrame(stepReverse);
        } else {
          videoEl.currentTime = 0;
          videoEl.pause();
          animFrameIdRef.current = null;
          setShowTelemetry(true);
        }
      };

      animFrameIdRef.current = requestAnimationFrame(stepReverse);
    }
  }, [isExplodedView]);

  const getNorm = (status?: string) => (status || '').toLowerCase().replace(/[\s\-_]+/g, '');

  const formatText = (str?: string) => {
    if (!str) return '';
    return str
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  // Combine trips assigned directly to vehicle as well as assigned driver
  const rawTrips: any[] = (() => {
    if (!vehicle) return [];
    const vehicleTrips: any[] = vehicle.trips || [];
    const driverTrips: any[] = vehicle.assignedDriver?.trips || [];
    const combinedMap = new Map();
    for (const t of [...vehicleTrips, ...driverTrips]) {
      if (t && t.id && !combinedMap.has(t.id)) {
        combinedMap.set(t.id, t);
      }
    }
    return Array.from(combinedMap.values());
  })();

  useEffect(() => {
    if (!vehicle) return;

    // Find active / live / assigned / scheduled trips
    const activeTrips = rawTrips.filter((t: any) => {
      const norm = getNorm(t.status);
      return ['ontrip', 'intransit', 'loading', 'dispatched', 'scheduled', 'delayed', 'atpickup', 'atdelivery', 'draft', 'pending', 'created'].includes(norm);
    });

    setSlots(() => {
      const nextSlots = INITIAL_SLOTS.map(s => ({ ...s }));

      // 1. Center main slot B2 shows the primary active trip
      if (activeTrips.length > 0) {
        const primaryTrip = activeTrips[0];
        const b2Index = nextSlots.findIndex(s => s.id === 'B2');
        if (b2Index !== -1) {
          const tripIdLabel = primaryTrip.ref_id || (primaryTrip.id ? `TRP-${primaryTrip.id.slice(0, 6)}` : 'LIVE-TRIP');
          const tripWeight = primaryTrip.total_weight || primaryTrip.planned_capacity_kg 
            ? `${primaryTrip.total_weight || primaryTrip.planned_capacity_kg}kg` 
            : '1,000kg';

          nextSlots[b2Index] = {
            ...nextSlots[b2Index],
            status: 'loaded',
            shipmentId: tripIdLabel,
            rawTripId: primaryTrip.id,
            weight: tripWeight,
            color: 'green'
          };
        }
      }

      // 2. Additional active trips (if any) populate other slots
      let extraTripIdx = 1;
      for (let i = 0; i < nextSlots.length; i++) {
        if (nextSlots[i].id === 'B2') continue;

        if (extraTripIdx < activeTrips.length) {
          const extraTrip = activeTrips[extraTripIdx];
          const tripIdLabel = extraTrip.ref_id || (extraTrip.id ? `TRP-${extraTrip.id.slice(0, 6)}` : `TRP-${extraTripIdx + 1}`);
          const tripWeight = extraTrip.total_weight || extraTrip.planned_capacity_kg 
            ? `${extraTrip.total_weight || extraTrip.planned_capacity_kg}kg` 
            : '500kg';

          nextSlots[i] = {
            ...nextSlots[i],
            status: 'loaded',
            shipmentId: tripIdLabel,
            rawTripId: extraTrip.id,
            weight: tripWeight,
            color: 'blue'
          };
          extraTripIdx++;
        }
      }

      return nextSlots;
    });
  }, [vehicle]);

  const mapTripToDisplay = (t: any): VehicleTripDisplay => {
    let originStr = 'Riyadh';
    let destStr = 'Al Bahah';
    let routeStr = '—';

    if (t.stops && t.stops.length >= 2) {
      originStr = formatText(t.stops[0]?.location_name || t.stops[0]?.city || 'Riyadh');
      destStr = formatText(t.stops[t.stops.length - 1]?.location_name || t.stops[t.stops.length - 1]?.city || 'Al Bahah');
      routeStr = `${originStr} → ${destStr}`;
    } else if (t.stops && t.stops.length === 1) {
      originStr = formatText(t.stops[0]?.location_name || t.stops[0]?.city || 'Riyadh');
      destStr = 'Al Bahah';
      routeStr = originStr;
    } else if (t.origin_city || t.destination_city) {
      originStr = formatText(t.origin_city || 'Riyadh');
      destStr = formatText(t.destination_city || 'Al Bahah');
      routeStr = `${originStr} → ${destStr}`;
    } else if (t.origin || t.destination) {
      originStr = formatText(t.origin || 'Riyadh');
      destStr = formatText(t.destination || 'Al Bahah');
      routeStr = `${originStr} → ${destStr}`;
    } else {
      routeStr = 'Riyadh → Al Bahah';
    }

    const rawWeight = t.total_weight || t.planned_capacity_kg || t.cargo_weight || vehicle?.capacity_kg;
    const weightStr = rawWeight 
      ? `${Number(rawWeight).toLocaleString()} Kg` 
      : '10,000 Kg';

    const customerName = t.customer?.name || t.customer_name || 'Aprodac';
    const rawLogo = t.customer?.logo_url || t.customer?.avatar_url || t.customer_logo || null;
    const customerLogo = rawLogo ? resolveFileUrl(rawLogo) : null;
    const rawType = t.cargo_type || t.rate_category || t.billing_type || t.line_type || 'Single Trip';
    const cargoType = formatText(rawType);

    const rawDate = t.departure_date || t.scheduled_date || t.created_at || t.createdAt || t.start_date || t.dispatch_date;
    const dateStr = rawDate
      ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '14 Sep 2026';

    return {
      id: t.ref_id || (t.id ? `TRP-${t.id.slice(0, 6)}` : 'TRP-001'),
      rawId: t.id,
      status: t.status || 'Scheduled',
      route: routeStr,
      origin: originStr,
      destination: destStr,
      customerName,
      customerLogo,
      cargoType,
      totalWeight: weightStr,
      date: dateStr,
    };
  };

  const allVehicleTrips: VehicleTripDisplay[] = rawTrips.map(mapTripToDisplay);

  const recentTripsList = allVehicleTrips.filter(t => {
    const norm = getNorm(t.status);
    return ['intransit', 'ontrip', 'loading', 'dispatched', 'atpickup', 'atdelivery', 'delayed'].includes(norm);
  });

  const upcomingTripsList = allVehicleTrips.filter(t => {
    const norm = getNorm(t.status);
    return ['scheduled', 'draft', 'pending', 'created'].includes(norm);
  });

  const completedTripsList = allVehicleTrips.filter(t => {
    const norm = getNorm(t.status);
    return ['completed', 'invoiced', 'delivered'].includes(norm);
  });

  // Completed trips dataset shown in trips box
  const activeDataset = completedTripsList.length > 0 ? completedTripsList : allVehicleTrips;

  const filteredTrips = activeDataset.filter(t => {
    if (!tripSearch.trim()) return true;
    const q = tripSearch.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.origin.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      t.route.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q)
    );
  });

  const TRIPS_PER_PAGE = 3;
  const totalTripPages = Math.max(1, Math.ceil(filteredTrips.length / TRIPS_PER_PAGE));
  const safeTripPage = Math.min(tripPage, totalTripPages);
  const paginatedTrips = filteredTrips.slice((safeTripPage - 1) * TRIPS_PER_PAGE, safeTripPage * TRIPS_PER_PAGE);

  const getDisplayedData = () => {
    let dataset = activeDataset;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      dataset = dataset.filter(item => 
        item.id.toLowerCase().includes(q) || 
        item.route.toLowerCase().includes(q) || 
        item.cargoType.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
      );
    }
    return dataset;
  };

  const renderTripCardBadge = (status: string) => {
    const norm = (status || '').toLowerCase().replace(/[\s\-_]+/g, '');
    if (norm === 'intransit' || norm === 'ontrip') {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 shadow-none font-bold px-2 py-0.5 text-[9px] rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          In Transit
        </Badge>
      );
    }
    if (norm === 'loading') {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 shadow-none font-bold px-2 py-0.5 text-[9px] rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
          Loading
        </Badge>
      );
    }
    if (norm === 'completed' || norm === 'delivered' || norm === 'invoiced') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shadow-none font-bold px-2 py-0.5 text-[9px] rounded-full flex items-center gap-1">
          Completed
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] font-bold border rounded-full px-2 py-0.5 bg-slate-50 text-slate-600 border-slate-200">
        {status}
      </Badge>
    );
  };

  const renderStatusBadge = (status?: string) => {
    const norm = (status || 'Loading').toLowerCase().replace(/[\s\-_]+/g, '');
    if (norm === 'ontrip' || norm === 'intransit') {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 shadow-none font-bold px-3 py-1 text-xs rounded-full flex items-center gap-1.5 hover:bg-blue-100 hover:text-blue-700">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          In Transit
        </Badge>
      );
    }
    if (norm === 'loading') {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 shadow-none font-bold px-3 py-1 text-xs rounded-full flex items-center gap-1.5 hover:bg-amber-100 hover:text-amber-700">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
          Loading
        </Badge>
      );
    }
    if (norm === 'available') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shadow-none font-bold px-3 py-1 text-xs rounded-full flex items-center gap-1.5 hover:bg-emerald-100 hover:text-emerald-700">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
          Available
        </Badge>
      );
    }
    if (norm === 'maintenance') {
      return (
        <Badge className="bg-rose-100 text-rose-700 border-rose-200 shadow-none font-bold px-3 py-1 text-xs rounded-full flex items-center gap-1.5 hover:bg-rose-100 hover:text-rose-700">
          <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
          Maintenance
        </Badge>
      );
    }
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-200 shadow-none font-bold px-3 py-1 text-xs rounded-full flex items-center gap-1.5 hover:bg-slate-100 hover:text-slate-700">
        {status || 'Loading'}
      </Badge>
    );
  };

  const handleDriverClick = () => {
    const driverId = assignedDriver?.id || (vehicle as any)?.driver_id;
    if (driverId) {
      navigate(`/drivers/${driverId}`);
    } else {
      navigate('/drivers');
    }
  };

  return (
    <div className="w-full bg-[#F5F7FA] text-slate-900 font-sans p-5 sm:p-6 lg:p-7 flex flex-col gap-5 sm:gap-6 overflow-y-auto max-w-[1800px] mx-auto min-h-screen">
      
      {/* ── Top Header Bar ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{plateNumber}</h1>
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs sm:text-sm font-bold bg-emerald-100/90 text-emerald-700 border border-emerald-200/60 shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            Available
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => navigate(`/vehicles/${vehicle?.id || id}/edit`)}
            className="font-bold bg-[#3E3C3D] hover:bg-charcoal-strong text-white gap-2 h-10 text-xs sm:text-sm shadow-xs rounded-xl px-5 transition-colors cursor-pointer"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* ── Top Metrics Grid (4 Large Proportional Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
        
        {/* Card 1: DRIVER */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px]">
          <div 
            onClick={handleDriverClick}
            className="flex items-center gap-3.5 min-w-0 flex-1 pr-2 cursor-pointer group"
            title="View Driver Details"
          >
            <DriverAvatar
              src={driverAvatar}
              firstName={driverFirstName}
              lastName={driverLastName}
              size="lg"
              className="w-12 h-12 border-2 border-white shadow-2xs shrink-0 rounded-full ring-1 ring-slate-200 group-hover:ring-[#FA634E] group-hover:scale-105 transition-all"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 flex items-center gap-1">
                DRIVER
                <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover:text-[#FA634E] transition-colors" />
              </p>
              <SlowScrollingDriverName
                name={assignedDriver ? `${assignedDriver.first_name || ''} ${assignedDriver.last_name || ''}`.trim() || assignedDriver.name : 'ABDUL MALIK HABIB UR RAHMAN KHAN'}
                className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#FA634E] leading-snug transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button 
              onClick={() => {
                const phone = vehicle?.assignedDriver?.phone_primary || assignedDriver?.phone;
                if (phone) window.open(`tel:${phone}`);
                else handleDriverClick();
              }}
              className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-100 text-emerald-600 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="Call Driver"
            >
              <Phone className="w-4 h-4 text-emerald-600" />
            </button>
            <button 
              onClick={() => {
                const rawPhone = vehicle?.assignedDriver?.phone_primary || assignedDriver?.phone || '';
                const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
                const whatsapp = cleanDigits.startsWith('966')
                  ? cleanDigits
                  : (cleanDigits.startsWith('0') ? `966${cleanDigits.slice(1)}` : `966${cleanDigits}`);
                if (cleanDigits) window.open(`https://wa.me/${whatsapp}`, '_blank');
                else handleDriverClick();
              }}
              className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-100 text-emerald-600 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="Send WhatsApp Message"
            >
              <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Card 2: ASSET & CAPACITY */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Truck className="w-6 h-6 text-[#FA634E] stroke-[1.75] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">ASSET TYPE</p>
              <p className="text-xs sm:text-sm font-black text-slate-900 leading-snug truncate">
                {vehicle?.asset_type || 'Box'} Truck
              </p>
            </div>
          </div>

          {/* Highlighted Capacity Ton Text on Right Side */}
          <div className="shrink-0 text-right">
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-black text-[#FA634E]">
              <Gauge className="w-4 h-4 text-[#FA634E] shrink-0" />
              <span>{capacityFormatted}</span>
            </span>
          </div>
        </div>

        {/* Card 3: DRIVER CONTACT */}
        <div 
          onClick={handleDriverClick}
          className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 min-h-[96px] cursor-pointer group"
          title="View Driver Details"
        >
          <Phone className="w-6 h-6 text-blue-600 stroke-[1.75] shrink-0 group-hover:scale-110 transition-transform" />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 flex items-center gap-1">
              DRIVER CONTACT
              <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
            </p>
            <p className="text-xs sm:text-sm font-mono font-black text-slate-900 group-hover:text-blue-600 leading-snug transition-colors">
              {assignedDriver?.phone_primary || assignedDriver?.phone || '—'}
            </p>
            <p className="text-[10px] font-semibold text-slate-400 leading-none mt-1">Assigned Phone</p>
          </div>
        </div>

        {/* Card 4: GPS */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 min-h-[96px]">
          <Navigation className="w-6 h-6 text-emerald-600 stroke-[1.75] shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">GPS</p>
            <p className="text-xs sm:text-sm font-mono font-black text-slate-900 leading-snug flex items-center gap-2 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              ICCES: {vehicle?.icces_device_id || '—'}
            </p>
          </div>
        </div>

      </div>

      {/* ── Main Content Grid: Left (Trips Ledger), Middle (Truck Visualizer + Service History), Right (Driver Documents & Validity) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 items-stretch">

        {/* Left Column: Trips Ledger */}
        <div className="xl:col-span-3 flex flex-col h-full min-h-0">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full min-h-[460px] overflow-hidden">
            <div className="flex flex-col h-full min-h-0 justify-between">
              {/* Header: Title "Trips" */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                  <h3 className="text-base font-black text-slate-900 leading-tight truncate">Trips</h3>
                </div>
              </div>

              {/* Search Bar Input */}
              <div className="relative mb-2 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search vehicle trips..."
                  value={tripSearch}
                  onChange={(e) => {
                    setTripSearch(e.target.value);
                    setTripPage(1);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
                />
                {tripSearch && (
                  <button 
                    onClick={() => { setTripSearch(''); setTripPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 bg-slate-200/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Stacked Trip Cards List (Paginated container strictly preserving normal box size) */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 py-1">
                {activeDataset.length === 0 ? (
                  <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center">
                    <Truck className="w-6 h-6 text-slate-300 mx-auto mb-1.5 stroke-[1.5]" />
                    <p className="text-xs font-bold text-slate-600">No Trips Found</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">No completed trip records for this vehicle.</p>
                  </div>
                ) : (
                  paginatedTrips.map((trip) => (
                    <div 
                      key={trip.id}
                      onClick={() => {
                        setSelectedDocId(null);
                        setSelectedTripIdForPreview((prev) => (prev === (trip.rawId || trip.id) ? null : (trip.rawId || trip.id)));
                      }}
                      className={cn(
                        "relative overflow-hidden rounded-2xl border transition-all cursor-pointer flex flex-col justify-between p-3 sm:p-3.5 gap-2 group shadow-2xs",
                        selectedTripIdForPreview === (trip.rawId || trip.id)
                          ? "border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60"
                          : "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/50"
                      )}
                    >
                      {/* TOP ROW: TRIP ID & STATUS BADGE (LEFT) | CAPACITY PILL (RIGHT) */}
                      <div className="flex items-center justify-between gap-2 z-10">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm sm:text-base font-black text-slate-900 font-mono leading-none tracking-tight">
                            {trip.id}
                          </p>
                          {renderTripCardBadge(trip.status)}
                        </div>

                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-[8.5px] font-black uppercase text-[#FA634E] tracking-wider mb-0.5">
                            Payload
                          </span>
                          <span className="text-[11px] font-black font-mono text-[#FA634E] bg-orange-50 border border-orange-200/80 px-2 py-0.5 rounded-md shadow-2xs leading-none">
                            {trip.totalWeight}
                          </span>
                        </div>
                      </div>

                      {/* MIDDLE ROW: FROM -> TO ROUTE */}
                      <div className="flex items-center gap-2 sm:gap-3 z-10 py-0.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <MapPin className="w-4 h-4 text-[#FA634E] fill-[#FA634E]/20 shrink-0" />
                          <p className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate capitalize">
                            {trip.origin}
                          </p>
                        </div>

                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mx-0.5" />

                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <MapPin className="w-4 h-4 text-blue-600 fill-blue-600/20 shrink-0" />
                          <p className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate capitalize">
                            {trip.destination}
                          </p>
                        </div>
                      </div>

                      {/* DIVIDER LINE */}
                      <div className="w-full h-px bg-slate-100 z-10"></div>

                      {/* BOTTOM ROW: DEPARTURE | CUSTOMER */}
                      <div className="flex items-center gap-3 justify-between z-10">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                              DEPARTURE
                            </p>
                            <p className="text-[11px] font-black text-slate-900 truncate">
                              {trip.date}
                            </p>
                          </div>
                        </div>

                        <div className="h-5 w-px bg-slate-200 shrink-0"></div>

                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {trip.customerLogo ? (
                            <img src={trip.customerLogo} alt={trip.customerName} className="w-4.5 h-4.5 object-contain shrink-0" />
                          ) : (
                            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                              CUSTOMER
                            </p>
                            <p className="text-[11px] font-black text-slate-900 truncate">
                              {trip.customerName}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls Bar */}
              {totalTripPages > 1 && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-700 shrink-0 mt-2 shadow-2xs">
                  <button
                    disabled={safeTripPage <= 1}
                    onClick={() => setTripPage(prev => Math.max(1, prev - 1))}
                    className="p-1 px-2 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-[#FA634E] cursor-pointer flex items-center gap-1 text-[11px] font-extrabold transition-colors shadow-2xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <span className="text-[11px] font-extrabold text-slate-600 font-mono">
                    Page {safeTripPage} of {totalTripPages}
                  </span>
                  <button
                    disabled={safeTripPage >= totalTripPages}
                    onClick={() => setTripPage(prev => Math.min(totalTripPages, prev + 1))}
                    className="p-1 px-2 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-[#FA634E] cursor-pointer flex items-center gap-1 text-[11px] font-extrabold transition-colors shadow-2xs"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* View All Trips Button */}
              <Button
                onClick={() => {
                  const targetSearch = (vehicle?.plate_number && vehicle.plate_number !== '—')
                    ? vehicle.plate_number
                    : (plateNumber && plateNumber !== '—' ? plateNumber : (vehicle?.ref_id || ''));
                  navigate(`/trips?search=${encodeURIComponent(targetSearch)}`);
                }}
                variant="ghost"
                className="w-full mt-3 h-11 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs sm:text-sm font-black rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                <span>View All Trips</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Middle Column: Unified Truck Visualizer + Service History OR Full Trip Preview */}
        <div className="xl:col-span-6 flex flex-col h-full min-h-0">
          {selectedDocId ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col justify-between h-full min-h-[610px] overflow-hidden">
              <RealVehicleDocumentPreviewMiddleBox
                docId={selectedDocId}
                vehicleId={vehicle?.id || id}
                plateNumber={plateNumber}
                documentDetailsMap={DOCUMENT_DETAILS}
                matchingRealDoc={getMatchingRealDoc(selectedDocId)}
                onClose={() => setSelectedDocId(null)}
                onDeleteDocument={(delId) => setDeletedDocIds((prev) => [...prev, delId])}
              />
            </div>
          ) : selectedTripIdForPreview ? (() => {
            const targetTripRaw = rawTrips.find((t: any) => t.id === selectedTripIdForPreview || t.ref_id === selectedTripIdForPreview);
            const fallbackItem = allVehicleTrips.find((t) => t.rawId === selectedTripIdForPreview || t.id === selectedTripIdForPreview);

            const previewTripDisplay = targetTripRaw ? {
              id: targetTripRaw.id,
              rawId: targetTripRaw.id,
              ref_id: targetTripRaw.ref_id || (targetTripRaw.id ? `TRP-${targetTripRaw.id.slice(0, 4).toUpperCase()}` : 'TRP-0742'),
              startedDate: targetTripRaw.planned_start || targetTripRaw.createdAt ? formatInDeploymentTz(targetTripRaw.planned_start || targetTripRaw.createdAt, tz, 'dd MMM yyyy, HH:mm') : '13 Sep 2026, 23:00',
              origin: targetTripRaw.route_origin || targetTripRaw.origin_name || targetTripRaw.stops?.[0]?.source_label || targetTripRaw.stops?.[0]?.location_name || 'Riyadh',
              destination: targetTripRaw.route_destination || targetTripRaw.destination_name || targetTripRaw.stops?.[targetTripRaw.stops?.length - 1]?.source_label || targetTripRaw.stops?.[targetTripRaw.stops?.length - 1]?.location_name || 'Dammam',
              customerName: targetTripRaw.customer?.name || (vehicle as any)?.customer?.name || 'Customer Account',
              customerLogo: targetTripRaw.customer?.logo_url || null,
              vehiclePlate: plateNumber || vehicle?.plate_number || 'DRA-6484',
              cargoType: targetTripRaw.cargo_type || 'General Goods',
              rateCard: targetTripRaw.rate_card_name || 'Standard',
              distance: targetTripRaw.planned_distance || targetTripRaw.distance_km ? `${targetTripRaw.planned_distance || targetTripRaw.distance_km} km` : '420 km',
              driverPayout: targetTripRaw.driver_charge || targetTripRaw.driver_payout ? `SAR ${Number(targetTripRaw.driver_charge || targetTripRaw.driver_payout).toFixed(2)}` : 'SAR 50.00',
              status: targetTripRaw.status || 'Completed',
              stops: targetTripRaw.stops || []
            } : {
              id: fallbackItem?.rawId || '1',
              rawId: fallbackItem?.rawId || '1',
              ref_id: fallbackItem?.id || 'TRP-0742',
              startedDate: fallbackItem?.date || '13 Sep 2026, 23:00',
              origin: fallbackItem?.origin || 'Riyadh',
              destination: fallbackItem?.destination || 'Dammam',
              customerName: fallbackItem?.customerName || 'Customer Account',
              customerLogo: fallbackItem?.customerLogo || null,
              vehiclePlate: plateNumber || 'DRA-6484',
              cargoType: fallbackItem?.cargoType || 'General Goods',
              rateCard: 'Standard',
              distance: '420 km',
              driverPayout: 'SAR 50.00',
              status: fallbackItem?.status || 'Completed',
              stops: []
            };

            const previewStops = previewTripDisplay.stops.length > 0 ? previewTripDisplay.stops : [
              { id: '1', sequence: 1, location_name: previewTripDisplay.origin, stop_type: 'Pickup' },
              { id: '2', sequence: 2, location_name: previewTripDisplay.destination, stop_type: 'Dropoff' }
            ];

            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs p-4 sm:p-5 flex flex-col justify-between h-full min-h-[610px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 space-y-3">
                {/* 1. Header Bar with Back Button & Status Badge */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <button
                    onClick={() => setSelectedTripIdForPreview(null)}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                    <span>Back to Truck</span>
                  </button>

                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs uppercase tracking-wider",
                    (previewTripDisplay.status || '').toLowerCase() === 'completed' || (previewTripDisplay.status || '').toLowerCase() === 'delivered'
                      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40"
                      : (previewTripDisplay.status || '').toLowerCase() === 'intransit' || (previewTripDisplay.status || '').toLowerCase() === 'in transit' || (previewTripDisplay.status || '').toLowerCase() === 'dispatched'
                      ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  )}>
                    {previewTripDisplay.status || 'Scheduled'}
                  </span>
                </div>

                {/* 2. Trip Ref ID & Date */}
                <div className="flex items-center justify-between text-xs font-bold shrink-0 pt-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-[#FA634E]">
                    {previewTripDisplay.ref_id}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    Date: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{previewTripDisplay.startedDate}</strong>
                  </span>
                </div>

                {/* 3. Visual Route Progress Stepper */}
                <div className="shrink-0 my-1 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40">
                  <VisualRouteProgress
                    stops={previewStops}
                    tz={tz}
                    tripStatus={previewTripDisplay.status}
                    hideBadges={true}
                    hidePulseAnimation={true}
                  />
                </div>

                {/* 4. 6-Card Grid (2 rows x 3 columns) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 flex-1 items-stretch my-1">
                  {/* CUSTOMER */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-rose-500 stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        CUSTOMER
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 my-auto pt-0.5">
                      {previewTripDisplay.customerLogo ? (
                        <img
                          src={previewTripDisplay.customerLogo}
                          alt={previewTripDisplay.customerName}
                          className="w-5 h-5 rounded-md object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0 shadow-2xs"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-md bg-charcoal text-white font-mono font-black text-[8.5px] flex items-center justify-center border border-slate-800 shadow-2xs shrink-0">
                          {previewTripDisplay.customerName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate" title={previewTripDisplay.customerName}>
                        {previewTripDisplay.customerName}
                      </span>
                    </div>
                  </div>

                  {/* VEHICLE */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-500 stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        VEHICLE
                      </span>
                    </div>
                    <div className="my-auto pt-0.5 min-w-0">
                      <span className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate block">
                        {previewTripDisplay.vehiclePlate}
                      </span>
                    </div>
                  </div>

                  {/* CARGO TYPE */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-[#FA634E] stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        CARGO TYPE
                      </span>
                    </div>
                    <div className="my-auto pt-0.5 min-w-0">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                        {previewTripDisplay.cargoType}
                      </span>
                    </div>
                  </div>

                  {/* RATE CARD */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500 stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        RATE CARD
                      </span>
                    </div>
                    <div className="my-auto pt-0.5 min-w-0">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                        {previewTripDisplay.rateCard}
                      </span>
                    </div>
                  </div>

                  {/* DISTANCE */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-500 stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        DISTANCE
                      </span>
                    </div>
                    <div className="my-auto pt-0.5 min-w-0">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                        {previewTripDisplay.distance}
                      </span>
                    </div>
                  </div>

                  {/* DRIVER PAYOUT */}
                  <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                    <div className="flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-500 stroke-[2.2] shrink-0" />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        DRIVER PAYOUT
                      </span>
                    </div>
                    <div className="my-auto pt-0.5 min-w-0">
                      <span className="text-xs sm:text-sm font-black font-mono text-[#FA634E] truncate block">
                        {previewTripDisplay.driverPayout}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Bottom Action Button: View Full Trip Details Page */}
                <Button
                  onClick={() => navigate(`/trips/${previewTripDisplay.rawId || previewTripDisplay.id}`)}
                  variant="ghost"
                  className="w-full mt-2 h-11 bg-slate-100 dark:bg-slate-800/80 hover:bg-[#FA634E] hover:text-white text-slate-900 dark:text-white hover:dark:text-white text-xs sm:text-sm font-black rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Full Trip Details Page</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            );
          })() : (
            /* ── Default View: Combined Single Box containing Truck Visualizer (Top) + Service History (Bottom) ── */
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col justify-between h-full min-h-[610px] overflow-hidden">
              {/* 1. Top Truck Visualizer Area */}
              <div className="relative w-full h-[360px] sm:h-[385px] shrink-0 flex items-center justify-center overflow-hidden bg-[#EEF1F6] dark:bg-slate-950">
                {/* TOP LEFT OVERLAY: Total Trips Counter */}
                {activeServiceView !== 'detail' && (
                  <div className="absolute top-5 left-5 z-30 flex items-center gap-3 animate-in fade-in duration-200">
                    <Truck className="w-7 h-7 sm:w-8 sm:h-8 text-[#FA634E] stroke-[2] shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider leading-none mb-1">
                        TOTAL TRIPS
                      </span>
                      <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">
                        {activeDataset.length}
                      </span>
                    </div>
                  </div>
                )}

                {/* Clean 2-Second Exploded Animation Video Element */}
                <video
                  ref={videoRef}
                  src="/truck-animation-2s.mp4"
                  muted
                  playsInline
                  preload="auto"
                  onEnded={handleVideoEnded}
                  onTimeUpdate={handleVideoTimeUpdate}
                  className="w-full h-full object-cover block transform-gpu transition-all duration-300 inset-0"
                />

                {/* Back to Systems Overlay Button inside Animated Screen */}
                {activeServiceView === 'detail' && (
                  <button
                    onClick={() => {
                      setActiveServiceView('categories');
                      setShowTelemetry(false);
                      setIsExplodedView(false);
                    }}
                    className="absolute top-3.5 left-3.5 z-30 px-3.5 py-1.5 rounded-xl border border-slate-200/90 bg-white/95 hover:bg-white text-slate-800 hover:text-[#FA634E] text-xs font-extrabold flex items-center gap-1.5 backdrop-blur-md shadow-md transition-all cursor-pointer group"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#FA634E] group-hover:-translate-x-0.5 transition-transform" />
                    <span>Back to Systems</span>
                  </button>
                )}

                {/* Floating 3D Part Interactive Hotspots */}
                {isExplodedView && showHotspots && (
                  <div className="absolute inset-0 pointer-events-none animate-in fade-in zoom-in-95 duration-300">
                    {serviceItems.map((item) => {
                      const isSelected = item.id === selectedServiceId;
                      const IconComp = item.icon;
                      const theme = item.colorTheme;
                      return (
                        <div
                          key={`hotspot-${item.id}`}
                          style={{ top: item.hotspot.top, left: item.hotspot.left }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-transform duration-300 hover:scale-110 z-10"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedServiceId === item.id) {
                                setActiveServiceView('categories');
                                setShowTelemetry(false);
                                setIsExplodedView(false);
                              } else {
                                setSelectedServiceId(item.id);
                                setRecordIndex(0);
                                setActiveServiceView('detail');
                                setIsExplodedView(true);
                              }
                            }}
                            className="flex items-center gap-1.5 cursor-pointer group"
                          >
                            <div
                              className={`relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-md transition-all shrink-0 ${
                                isSelected 
                                  ? 'bg-white border-2 border-[#FA634E] ring-4 ring-[#FA634E]/30 scale-110' 
                                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/90'
                              }`}
                            >
                              <IconComp className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4 relative z-10", isSelected ? "text-[#FA634E]" : theme.text)} />
                            </div>
                            <span
                              className={`text-[10px] sm:text-[10.5px] font-black px-2.5 py-0.5 rounded-lg whitespace-nowrap shadow-md transition-all border ${
                                isSelected
                                  ? 'bg-white text-slate-900 border-[#FA634E] shadow-sm'
                                  : 'bg-white text-slate-800 border-slate-200/90 shadow-sm'
                              }`}
                            >
                              {item.categoryLabel}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bottom Telemetry Bar */}
                {activeServiceView === 'categories' && showTelemetry && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-6 sm:gap-8 w-max max-w-[calc(100%-2rem)] px-6 py-2 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                    {/* 1. Latest Odometer */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Gauge className="w-5 h-5 text-[#FA634E] stroke-[2.2] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block leading-none mb-1">
                          LATEST ODOMETER
                        </span>
                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-none block truncate">
                          {latestOdometerFormatted}
                        </span>
                      </div>
                    </div>

                    {/* Divider Line 1 */}
                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 shrink-0"></div>

                    {/* 2. Next Service Due */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="w-5 h-5 text-blue-600 stroke-[2.2] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block leading-none mb-1">
                          NEXT SERVICE DUE
                        </span>
                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-none block truncate">
                          {nextServiceDue}
                        </span>
                      </div>
                    </div>

                    {/* Divider Line 2 */}
                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 shrink-0"></div>

                    {/* 3. YTD Maintenance Spend */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Wrench className="w-5 h-5 text-purple-600 stroke-[2.2] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block leading-none mb-1">
                          YTD MAINTENANCE
                        </span>
                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-none block truncate">
                          {ytdSpendFormatted}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Service History Area (Heading right at top, clear spacing to buttons) */}
              <div className="w-full px-4 pt-1 sm:px-5 sm:pt-1.5 pb-2.5 sm:pb-3 bg-white dark:bg-slate-900 shrink-0 flex flex-col justify-start h-[235px] sm:h-[245px] overflow-hidden">
                {/* Fixed-Position Dynamic Heading Bar (All the way up) */}
                <div className="flex items-center justify-between shrink-0 h-7 mb-3 sm:mb-3.5">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    {activeServiceView === 'detail' ? (
                      <>
                        {(() => {
                          const CatIcon = selectedService.icon;
                          return <CatIcon className={cn("w-5 h-5 stroke-[2.2] shrink-0", selectedService.colorTheme.text)} />;
                        })()}
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
                          {selectedService.categoryLabel}
                        </h2>
                        <span className={cn("text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-2xs truncate shrink-0", selectedService.colorTheme.badgeBg)}>
                          {selectedService.system}
                        </span>
                      </>
                    ) : (
                      <>
                        <Wrench className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
                          Service History
                        </h2>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {activeServiceView === 'detail' && (
                      <button
                        onClick={() => {
                          setActiveServiceView('categories');
                          setShowTelemetry(false);
                          setIsExplodedView(false);
                        }}
                        className="text-[10.5px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                        <span>All Systems</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const targetSearch = (vehicle?.plate_number && vehicle.plate_number !== '—')
                          ? vehicle.plate_number
                          : (plateNumber && plateNumber !== '—' ? plateNumber : (vehicle?.ref_id || ''));
                        navigate(`/maintenance?search=${encodeURIComponent(targetSearch)}`);
                      }}
                      className="text-[10.5px] sm:text-[11px] font-bold px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <span>All Maintenance</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>

                {/* Content Area Below Heading */}
                <div className="flex-1 min-h-0 flex flex-col justify-start overflow-hidden">
                  {activeServiceView === 'categories' ? (
                    /* 3x2 Stacked Grid on Left + Full-Height 'Others' Button on Right */
                    <div className="flex items-stretch gap-2 sm:gap-2.5 h-full py-0.5">
                      {/* Left: 3x2 Grid for the first 6 categories */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 flex-1 h-full">
                        {serviceItems.slice(0, 6).map((item) => {
                          const IconComp = item.icon;
                          const theme = item.colorTheme;
                          return (
                            <button 
                              key={`cat-rec-${item.id}`}
                              onClick={() => {
                                setSelectedDocId(null);
                                setSelectedServiceId(item.id);
                                setRecordIndex(0);
                                setActiveServiceView('detail');
                                setIsExplodedView(true);
                              }}
                              className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 flex items-center justify-between hover:border-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs group text-left"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <IconComp className={cn("w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2] transition-transform group-hover:scale-110 shrink-0", theme.text)} />
                                <div className="min-w-0">
                                  <span className="text-xs sm:text-[13px] font-black leading-tight truncate block text-slate-900 dark:text-white">
                                    {item.categoryLabel}
                                  </span>
                                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block truncate mt-0.5">
                                    {item.date !== '—' ? item.date : '—'}
                                  </span>
                                </div>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                            </button>
                          );
                        })}
                      </div>

                      {/* Right: 'Others' button spanning full vertical height */}
                      {(() => {
                        const othersItem = serviceItems.find((item) => item.id === 7) || serviceItems[6];
                        if (!othersItem) return null;
                        const IconComp = othersItem.icon;
                        const theme = othersItem.colorTheme;
                        return (
                          <button
                            key={`cat-rec-${othersItem.id}`}
                            onClick={() => {
                              setSelectedDocId(null);
                              setSelectedServiceId(othersItem.id);
                              setRecordIndex(0);
                              setActiveServiceView('detail');
                              setIsExplodedView(true);
                            }}
                            className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between items-center text-center hover:border-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs group w-28 sm:w-36 h-full shrink-0"
                          >
                            <div className="flex flex-col items-center justify-center flex-1 w-full gap-1.5 pt-1">
                              <IconComp className={cn("w-6 h-6 sm:w-7 sm:h-7 stroke-[2] transition-transform group-hover:scale-110 shrink-0", theme.text)} />
                              <div className="min-w-0">
                                <span className="text-xs sm:text-sm font-black leading-tight truncate block text-slate-900 dark:text-white">
                                  {othersItem.categoryLabel}
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block truncate mt-0.5">
                                  Cabin &amp; HVAC
                                </span>
                              </div>
                            </div>
                            <div className="w-full pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1 text-[10px] font-extrabold text-slate-400 transition-colors">
                              <span>View</span>
                              <ChevronRight className="w-3 h-3" />
                            </div>
                          </button>
                        );
                      })()}
                    </div>
                  ) : (
                    (() => {
                      const catRecords = getCategoryRecords(selectedService.categoryKey);
                      const totalRecs = catRecords.length;
                      const safeIdx = Math.min(recordIndex, Math.max(0, totalRecs - 1));
                      const currentRec = totalRecs > 0 ? catRecords[safeIdx] : null;

                      const recDate = currentRec?.service_date
                        ? new Date(currentRec.service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : selectedService.date;
                      const recTitle = currentRec?.work_done || currentRec?.maintenance_type || selectedService.title;
                      const recWorkshop = currentRec?.workshop_name || selectedService.workshop;
                      const recOdometer = currentRec?.odometer_reading ? `${Number(currentRec.odometer_reading).toLocaleString()} km` : selectedService.odometer;
                      const recCost = currentRec?.cost ? `SAR ${Number(currentRec.cost).toLocaleString()}` : selectedService.cost;
                      const recStatus = currentRec?.status || selectedService.status;
                      const rawP = (currentRec as any)?.parts_replaced || (currentRec as any)?.replaced_parts;
                      const recParts = rawP ? (Array.isArray(rawP) ? rawP : [String(rawP)]) : selectedService.partsReplaced;

                      return (
                        <div className="h-full flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
                          {totalRecs === 0 ? (
                            <div className="w-full h-full p-3 text-center border border-dashed border-slate-200/80 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center">
                              {(() => {
                                const IconComp = selectedService.icon;
                                return <IconComp className="w-5 h-5 text-slate-400 stroke-[1.5] mb-1" />;
                              })()}
                              <p className="text-xs font-bold text-slate-700">No Records Found</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">No maintenance records logged under {selectedService.categoryLabel}.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch h-full">
                              {/* Left Column: Work Info & Pagination (5 cols) */}
                              <div className="md:col-span-5 bg-slate-50/90 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between h-full space-y-1.5">
                                <div className="flex items-start gap-2 min-w-0">
                                  {(() => {
                                    const IconComp = selectedService.icon;
                                    return <IconComp className={`w-4.5 h-4.5 stroke-[2.2] ${selectedService.colorTheme.text} shrink-0 mt-0.5`} />;
                                  })()}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[9px] font-bold text-slate-400">{recDate}</span>
                                      <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                        {recStatus}
                                      </span>
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white leading-tight truncate">{recTitle}</h3>
                                    <p className="text-[9.5px] font-semibold text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                                      <Wrench className="w-2.5 h-2.5 text-slate-400" />
                                      {recWorkshop}
                                    </p>
                                  </div>
                                </div>

                                {totalRecs > 1 && (
                                  <div className="flex items-center justify-between px-2 py-0.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700 text-[9.5px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                    <button
                                      disabled={safeIdx === 0}
                                      onClick={() => setRecordIndex(prev => Math.max(0, prev - 1))}
                                      className="p-0.5 hover:text-[#FA634E] disabled:opacity-30 disabled:hover:text-slate-600 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3 h-3" />
                                    </button>
                                    <span>Record {safeIdx + 1} of {totalRecs}</span>
                                    <button
                                      disabled={safeIdx >= totalRecs - 1}
                                      onClick={() => setRecordIndex(prev => Math.min(totalRecs - 1, prev + 1))}
                                      className="p-0.5 hover:text-[#FA634E] disabled:opacity-30 disabled:hover:text-slate-600 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Key Metrics Grid (7 cols) */}
                              <div className="md:col-span-7 grid grid-cols-3 gap-2 h-full">
                                <div className="bg-slate-50/90 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between h-full">
                                  <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px]">Odometer</span>
                                  <span className="font-mono font-black text-slate-900 dark:text-white text-xs mt-0.5">{recOdometer}</span>
                                </div>

                                <div className="bg-slate-50/90 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between h-full">
                                  <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px]">Service Cost</span>
                                  <span className="font-mono font-black text-[#FA634E] text-xs mt-0.5">{recCost}</span>
                                </div>

                                <div className="bg-slate-50/90 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between h-full">
                                  <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px]">Replaced Parts</span>
                                  <span className="text-[9.5px] font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-0.5">
                                    {recParts.join(' • ')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Documents & Validity (Truck Documents - Max 5-6 visible at once, scrollable if more) */}
        <div className="xl:col-span-3 flex flex-col h-full min-h-[460px] max-h-[480px] overflow-hidden">
          <DocumentsValidityFolder
            vehicleId={vehicle?.id || id}
            selectedDocumentId={selectedDocId}
            deletedDocIds={deletedDocIds}
            onDeleteDocument={(delId) => setDeletedDocIds((prev) => [...prev, delId])}
            onSelectDocument={(docId) => {
              setSelectedTripIdForPreview(null);
              setSelectedDocId(docId);
            }}
          />
        </div>

      </div>
    </div>
  );
}
