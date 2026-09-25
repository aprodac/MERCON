import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin, Plus, RotateCw, Edit2, Trash2, MoreHorizontal,
  Download, FileSpreadsheet, FileText, UploadCloud,
  Building2, List, Map as MapIcon, Check,
  Search, Filter, X, ArrowDown, ArrowUp,
  ChevronDown, Eye, MessageSquare,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable from '@/components/ui/DataTable';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import LocationFormDialog from '@/components/locations/LocationFormDialog';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import { LOCATION_COLUMNS } from '@/utils/importUtils';

import { locationService, Location } from '@/services/locationService';
import { customerService } from '@/services/customerService';
import { SAUDI_MAP_CONTAINER_PROPS } from '@/utils/saudiMapConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { matchesSearch } from '@/lib/search';
import { cn } from '@/lib/utils';

import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';

// ─── helpers ───────────────────────────────────────────────────────────────
const quotationUses = (l: Location) => l._count?.quotationStops ?? 0;
const tripUses      = (l: Location) => l._count?.tripStops      ?? 0;

// ─── export config ─────────────────────────────────────────────────────────
const LOCATION_EXPORT_COLUMNS: ExportColumn<Location>[] = [
  { id: 'customer',        label: 'Customer',        accessor: (l) => l.customer?.name || '—' },
  { id: 'code',            label: 'Code',            accessor: (l) => l.code },
  { id: 'name',            label: 'Location Name',   accessor: (l) => l.name },
  { id: 'city',            label: 'City',            accessor: (l) => l.city || '—' },
  { id: 'address',         label: 'Address',         accessor: (l) => l.address || '—' },
  { id: 'pinned',          label: 'Pin Status',      accessor: (l) => (l.lat != null && l.lng != null ? 'PINNED' : 'UNPINNED') },
  { id: 'latitude',        label: 'Latitude',        accessor: (l) => (l.lat != null ? l.lat.toFixed(6) : '—') },
  { id: 'longitude',       label: 'Longitude',       accessor: (l) => (l.lng != null ? l.lng.toFixed(6) : '—') },
  { id: 'quotation_count', label: 'Quotation Stops', accessor: (l) => quotationUses(l) },
  { id: 'trip_count',      label: 'Trip Stops',      accessor: (l) => tripUses(l) },
  { id: 'status',          label: 'Status',          accessor: (l) => (l.is_active ? 'Active' : 'Inactive') },
];

// ─── map pin ───────────────────────────────────────────────────────────────
function createCustomLocationPin(isSelected: boolean, isActive: boolean, isPinned: boolean) {
  let pinColor = '#E8450F';
  let glowColor = 'rgba(232, 69, 15, 0.45)';
  if (!isActive) { pinColor = '#64748B'; glowColor = 'rgba(100,116,139,0.3)'; }
  else if (!isPinned) { pinColor = '#D97706'; glowColor = 'rgba(217,119,6,0.45)'; }
  const borderCol = isSelected ? '#E8450F' : '#FFFFFF';
  const size = isSelected ? 44 : 36;
  const outerSize = isSelected ? 52 : 44;
  const html = `
    <div style="position:relative;width:${outerSize}px;height:${outerSize}px;display:flex;align-items:center;justify-content:center;">
      ${isSelected ? `<div class="animate-ping" style="position:absolute;width:${outerSize}px;height:${outerSize}px;border-radius:50%;background-color:${glowColor};opacity:0.75;"></div>` : ''}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${pinColor};border:3px solid ${borderCol};box-shadow:0 4px 14px ${glowColor};display:flex;align-items:center;justify-content:center;color:white;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({ html, className: 'custom-location-pin-wrapper', iconSize: [outerSize, outerSize], iconAnchor: [outerSize / 2, outerSize / 2], popupAnchor: [0, -outerSize / 2] });
}

// ─── map bounds controller ─────────────────────────────────────────────────
function MapBoundsController({ locations, selectedMapCenter, fitTrigger }: {
  locations: Location[];
  selectedMapCenter: [number, number] | null;
  fitTrigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    const safe = () => { try { if (map && (map as any)._container) map.invalidateSize(); } catch {} };
    safe();
    const t1 = setTimeout(safe, 50);
    const t2 = setTimeout(safe, 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  useEffect(() => {
    if (!selectedMapCenter) return;
    const t = setTimeout(() => { try { map.flyTo(selectedMapCenter, 14, { animate: true, duration: 1.0 }); map.invalidateSize(); } catch {} }, 200);
    return () => clearTimeout(t);
  }, [selectedMapCenter, map]);
  useEffect(() => {
    if (selectedMapCenter && fitTrigger === 0) return;
    const t = setTimeout(() => {
      try {
        const mapped = locations.filter(l => l.lat != null && l.lng != null);
        map.invalidateSize();
        if (mapped.length === 1) map.flyTo([mapped[0].lat!, mapped[0].lng!], 13, { animate: true, duration: 0.8 });
        else if (mapped.length > 1) map.fitBounds(L.latLngBounds(mapped.map(l => [l.lat!, l.lng!])), { padding: [50, 50], maxZoom: 14 });
        else map.setView([24.7136, 46.6753], 6);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [locations, fitTrigger, map, selectedMapCenter]);
  return null;
}

// ─── sort options ──────────────────────────────────────────────────────────
type LocationSortOption = 'latest' | 'oldest' | 'code_asc' | 'name_asc' | 'customer_asc' | 'status';

// ─── component ────────────────────────────────────────────────────────────
export default function LocationListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = (searchParams.get('view') as 'list' | 'map') || 'list';
  const setViewMode = (mode: 'list' | 'map') => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('view', mode); return n; });
  };

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filter] = useState<'all' | 'pinned' | 'unpinned' | 'active' | 'inactive' | 'exact' | 'approximate' | 'unknown'>('all');
  const [sortOrder] = useState<LocationSortOption>('code_asc');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedLocationsForExport, setSelectedLocationsForExport] = useState<Location[]>([]);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
    confirmLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedMapCenter, setSelectedMapCenter] = useState<[number, number] | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);

  const { data: customersRes } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customerService.getAll(),
  });
  const customers = customersRes?.data || [];

  const { data: response, isLoading } = useQuery({
    queryKey: ['locations', selectedCustomerId],
    queryFn: () => locationService.getAll({ customerId: selectedCustomerId !== 'all' ? selectedCustomerId : undefined }),
  });
  const locations = response?.data || [];

  const filteredData = useMemo(() => {
    return locations
      .filter(l => {
        const matchesCustomer = selectedCustomerId === 'all' || l.customerId === selectedCustomerId;
        const matchesTerm = matchesSearch(search, [l.name, l.code, l.city, l.address, l.customer?.name]);
        let matchesFilter = true;
        if (filter === 'exact')       matchesFilter = l.coordinate_precision === 'EXACT';
        else if (filter === 'approximate') matchesFilter = l.coordinate_precision === 'APPROXIMATE';
        else if (filter === 'unknown')     matchesFilter = l.coordinate_precision === 'UNKNOWN';
        else if (filter === 'active')      matchesFilter = l.is_active === true;
        else if (filter === 'inactive')    matchesFilter = l.is_active === false;
        return matchesCustomer && matchesTerm && matchesFilter;
      })
      .sort((a, b) => {
        if (sortOrder === 'code_asc')     return (a.code || '').localeCompare(b.code || '');
        if (sortOrder === 'name_asc')     return (a.name || '').localeCompare(b.name || '');
        if (sortOrder === 'customer_asc') return (a.customer?.name || '').localeCompare(b.customer?.name || '');
        if (sortOrder === 'status')       return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
        const dA = new Date(a.createdAt || 0).getTime();
        const dB = new Date(b.createdAt || 0).getTime();
        return sortOrder === 'oldest' ? dA - dB : dB - dA;
      });
  }, [locations, selectedCustomerId, search, filter, sortOrder]);



  const handleQuickExport = async (format: 'xlsx' | 'pdf') => {
    const toastId = toast.loading('Preparing export…');
    try {
      const headers = ['Customer', 'Code', 'Location Name', 'City', 'Address', 'Pin Status', 'Latitude', 'Longitude', 'Quotation Stops', 'Trip Stops', 'Status'];
      const rows = filteredData.map(l => [
        l.customer?.name || '—', l.code, l.name, l.city || '—', l.address || '—',
        l.lat != null && l.lng != null ? 'PINNED' : 'UNPINNED',
        l.lat != null ? l.lat.toFixed(6) : '—',
        l.lng != null ? l.lng.toFixed(6) : '—',
        quotationUses(l), tripUses(l), l.is_active ? 'Active' : 'Inactive',
      ]);
      toast.dismiss(toastId);
      if (format === 'xlsx') await exportExcelTable('MERCON Customer Locations', headers, rows, `customer_locations_${new Date().toISOString().slice(0, 10)}.xlsx`);
      else exportPDFTable('MERCON Customer Locations', headers, rows, `customer_locations_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      toast.dismiss(toastId);
      toast.error('Failed to generate export');
    }
  };

  const handleShareWhatsapp = (loc: Location) => {
    const text = [
      `📍 *MERCON Location Details*`,
      `• *Location Name:* ${loc.name}`,
      `• *Code:* ${loc.code}`,
      `• *Customer:* ${loc.customer?.name || '—'}`,
      `• *City:* ${loc.city || 'Saudi Arabia'}`,
      loc.address ? `• *Address:* ${loc.address}` : '',
      loc.lat != null && loc.lng != null
        ? `• *Map Location:* https://maps.google.com/?q=${loc.lat},${loc.lng}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // ── table columns ──────────────────────────────────────────────────────
  const columns = [
    {
      header: 'Customer',
      className: 'w-[13%] min-w-[110px]',
      accessor: (row: Location) => (
        <Badge variant="outline" className="bg-indigo-50/80 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-extrabold text-[10px] px-1.5 py-0.5 truncate">
          {row.customer?.name || '—'}
        </Badge>
      ),
    },
    {
      header: 'Code',
      className: 'w-[85px]',
      accessor: (row: Location) => (
        <span className="font-mono text-[10px] font-black text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
          {row.code}
        </span>
      ),
    },
    {
      header: 'Location Name',
      className: 'w-[22%] min-w-[150px]',
      accessor: (row: Location) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
          <span className="font-bold text-[11px] text-slate-900 dark:text-slate-100 truncate" title={row.name}>
            {row.name}
          </span>
        </div>
      ),
    },
    {
      header: 'City',
      className: 'w-[11%] min-w-[85px]',
      accessor: (row: Location) => (
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{row.city || '—'}</span>
      ),
    },
    {
      header: 'Address',
      className: 'w-[24%] min-w-[150px]',
      accessor: (row: Location) => (
        <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1" title={row.address || ''}>
          {row.address || '—'}
        </span>
      ),
    },
    {
      header: 'Precision / Map Pin',
      className: 'w-[18%] min-w-[140px]',
      accessor: (row: Location) => {
        const prec = row.coordinate_precision || (row.lat != null ? 'APPROXIMATE' : 'UNKNOWN');
        return (
          <div className="flex flex-col gap-1">
            {prec === 'EXACT' && (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold text-[10px] w-fit flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Exact ({row.lat!.toFixed(3)}, {row.lng!.toFixed(3)})</span>
              </Badge>
            )}
            {prec === 'APPROXIMATE' && (
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold text-[10px] w-fit flex items-center gap-1">
                <span>Area ({row.lat!.toFixed(3)}, {row.lng!.toFixed(3)})</span>
              </Badge>
            )}
            {prec === 'UNKNOWN' && (
              <Badge variant="outline" className="bg-amber-50/80 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 font-bold text-[10px] w-fit flex items-center gap-1">
                <span>○ Not pinned</span>
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'Status',
      className: 'w-[80px]',
      accessor: (row: Location) => (
        <Badge variant={row.is_active ? 'default' : 'outline'} className={cn(
          'text-[10px] font-bold',
          row.is_active ? 'bg-emerald-600 text-white' : 'text-slate-400 border-slate-300',
        )}>
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right whitespace-nowrap',
      accessor: (row: Location) => (
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleShareWhatsapp(row);
            }}
            title="Share Location via WhatsApp"
            aria-label="Share via WhatsApp"
            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all focus:outline-none cursor-pointer group"
          >
            <WhatsAppIcon className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors focus:outline-none cursor-pointer"
                title="More actions"
                aria-label="Location Actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
              <DropdownMenuItem
                onClick={() => handleShareWhatsapp(row)}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <WhatsAppIcon className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                Share on WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/locations/${row.id}`)}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
              >
                <Eye className="mr-2 h-3.5 w-3.5 text-indigo-600" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                onClick={() => setEditTarget(row)}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
              >
                <Edit2 className="mr-2 h-3.5 w-3.5 text-amber-600" />
                Edit Location
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                onClick={async () => {
                  const locName = row.name;
                  const qCount = quotationUses(row);
                  const tCount = tripUses(row);
                  const parts: string[] = [];
                  if (qCount > 0) parts.push(`${qCount} quotation stop${qCount === 1 ? '' : 's'}`);
                  if (tCount > 0) parts.push(`${tCount} trip stop${tCount === 1 ? '' : 's'}`);
                  const isReferenced = parts.length > 0;
                  const message = isReferenced
                    ? `"${locName}" (${row.code}) is referenced in ${parts.join(' and ')}. Operational locations with active history cannot be deleted. Would you like to deactivate this location instead?`
                    : `"${locName}" (${row.code}) has no linked quotations or trip stops. This will permanently delete the location.`;

                  setConfirmModal({
                    isOpen: true,
                    title: isReferenced ? 'Deactivate Location?' : 'Delete Customer Location?',
                    message,
                    confirmLabel: isReferenced ? 'Deactivate Location' : 'Delete Location',
                    isDestructive: !isReferenced,
                    onConfirm: async () => {
                      try {
                        if (isReferenced) {
                          await locationService.update(row.id, { is_active: false });
                          toast.success(`Location "${locName}" deactivated successfully`);
                        } else {
                          await locationService.delete(row.id);
                          toast.success(`Location "${locName}" deleted successfully`);
                        }
                        queryClient.invalidateQueries({ queryKey: ['locations'] });
                        setSelectionResetKey(k => k + 1);
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message || e?.message || 'Action failed');
                      }
                    },
                  });
                }}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete Location
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  // ── table filter element ───────────────────────────────────────────────
  const filterElement = (
    <div className="flex items-center gap-2.5 flex-wrap">
      {/* Customer filter */}
      <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
        <SelectTrigger className="h-9 px-3 w-44 shrink-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold rounded-lg shadow-2xs">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <SelectValue placeholder="All Customers" />
          </div>
        </SelectTrigger>
        <SelectContent align="start" className="w-56 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
          <SelectGroup>
            <SelectLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 px-2 py-1">Customer</SelectLabel>
            <SelectItem value="all" className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">All Customers</SelectItem>
          </SelectGroup>
          <SelectSeparator className="my-1 border-slate-100 dark:border-slate-800" />
          <SelectGroup>
            {customers.map(c => (
              <SelectItem key={c.id} value={c.id} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );

  // ── bulk actions bar ───────────────────────────────────────────────────
  const bulkActions = [
    {
      label: 'Edit Selected Location',
      icon: <Edit2 size={13} />,
      variant: 'primary' as const,
      onClick: (selectedRows: Location[]) => {
        if (selectedRows.length > 0) {
          setEditTarget(selectedRows[0]);
        }
      },
    },
    {
      label: 'Export Selected',
      icon: <Download size={13} />,
      variant: 'success' as const,
      onClick: (selectedRows: Location[]) => {
        setSelectedLocationsForExport(selectedRows);
        setIsExportOpen(true);
      },
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (selectedRows: Location[]) => {
        setConfirmModal({
          isOpen: true,
          title: 'Delete Selected Locations',
          message: `Delete ${selectedRows.length} location record${selectedRows.length === 1 ? '' : 's'}? Linked quotations and historical trip stops may be affected.`,
          isDestructive: true,
          onConfirm: async () => {
            try {
              await Promise.allSettled(selectedRows.map(r => locationService.delete(r.id)));
              toast.success(`${selectedRows.length} location${selectedRows.length === 1 ? '' : 's'} deleted`);
              queryClient.invalidateQueries({ queryKey: ['locations'] });
              setSelectionResetKey(k => k + 1);
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message || 'Failed to delete locations');
            }
          },
        });
      },
    },
  ];

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout active="Locations" title="Location Master">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">

        {/* ── 1. PAGE HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 pb-1">
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-brand shrink-0" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Location Master
                </h1>
                <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 font-semibold text-xs shrink-0">
                  Master Data
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* View switcher */}
            <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  viewMode === 'list'
                    ? 'bg-charcoal dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900',
                )}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  viewMode === 'map'
                    ? 'bg-charcoal dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900',
                )}
              >
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
            </div>

            {/* Export / Import dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs dark:bg-slate-900 dark:border-slate-800"
                >
                  <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  Export / Import
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
                <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
                  Export Data
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleQuickExport('xlsx')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                  Export Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleQuickExport('pdf')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                  <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" />
                  Export PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setSelectedLocationsForExport(filteredData); setIsExportOpen(true); }}
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40"
                >
                  <Filter className="mr-2 h-3.5 w-3.5 text-brand" />
                  Custom Export Settings…
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
                <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
                  Import Data
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => setIsImportOpen(true)}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <UploadCloud className="mr-2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Import from Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add Location */}
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs font-bold bg-brand hover:bg-brand-hover text-white shadow-xs rounded-md px-4"
              onClick={() => navigate('/locations/create')}
            >
              <Plus className="h-4 w-4" />
              Add Location
            </Button>
          </div>
        </div>

        {/* ── 3. MAIN CONTENT: LIST OR MAP VIEW ── */}
        {viewMode === 'list' ? (
          <div className="w-full flex flex-col">
            <DataTable
              columns={columns}
              data={filteredData}
              enableSelection={true}
              compact={true}
              bulkActions={bulkActions}
              selectionResetKey={selectionResetKey}
              isLoading={isLoading}
              onRowClick={row => navigate(`/locations/${row.id}`)}
              emptyTitle="No Locations Found"
              emptyMessage="No customer locations match the selected filters."
              searchPlaceholder="Search name, code, city, address…"
              searchValue={search}
              onSearchChange={setSearch}
              filterElement={filterElement}
            />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5 h-[650px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            {/* Map Sidebar */}
            <div className="w-full lg:w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Location Directory ({filteredData.length})
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {filteredData.filter(l => l.lat != null && l.lng != null).length} Pinned
                  </Badge>
                </div>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter map pins..."
                  className="h-8 text-xs font-medium"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                {filteredData.map((loc) => {
                  const isPinned = loc.lat != null && loc.lng != null;
                  const isSelected = selectedLocationId === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => {
                        setSelectedLocationId(loc.id);
                        if (isPinned) {
                          setSelectedMapCenter([loc.lat!, loc.lng!]);
                          setFitTrigger(t => t + 1);
                        }
                      }}
                      className={cn(
                        'w-full text-left p-3 transition-colors rounded-xl flex items-start justify-between gap-2 cursor-pointer',
                        isSelected ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {loc.code}
                          </span>
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {loc.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {loc.customer?.name} • {loc.city || 'Saudi Arabia'}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isPinned ? (
                          <Badge className={cn('text-[10px] font-bold', loc.coordinate_precision === 'EXACT' ? 'bg-emerald-600' : 'bg-indigo-600')}>
                            {loc.coordinate_precision === 'EXACT' ? 'EXACT' : 'AREA'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                            UNPINNED
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Map Leaflet Container */}
            <div className="flex-1 h-full relative">
              <MapContainer className="h-full w-full" {...SAUDI_MAP_CONTAINER_PROPS}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; Esri'
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                />
                <MapBoundsController locations={filteredData} selectedMapCenter={selectedMapCenter} fitTrigger={fitTrigger} />
                {filteredData.filter(l => l.lat != null && l.lng != null).map((loc) => {
                  const isSelected = selectedLocationId === loc.id;
                  return (
                    <Marker
                      key={loc.id}
                      position={[loc.lat!, loc.lng!]}
                      icon={createCustomLocationPin(isSelected, loc.is_active, true)}
                      eventHandlers={{
                        click: () => {
                          setSelectedLocationId(loc.id);
                          setSelectedMapCenter([loc.lat!, loc.lng!]);
                        },
                      }}
                    >
                      <Popup className="rounded-xl shadow-xl">
                        <div className="p-1 space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-black bg-slate-100 px-1.5 py-0.5 rounded">{loc.code}</span>
                            <span className="font-extrabold text-slate-900">{loc.name}</span>
                          </div>
                          <div className="text-slate-600 font-medium text-[11px]">{loc.customer?.name}</div>
                          <div className="text-slate-500 text-[10px] font-mono">{loc.lat!.toFixed(4)}, {loc.lng!.toFixed(4)}</div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/locations/${loc.id}`)}
                            className="w-full mt-1.5 text-[11px] font-bold h-7 cursor-pointer"
                          >
                            View Location Details
                          </Button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>
        )}

      </div>

      {/* ── Dialogs ── */}
      <LocationFormDialog
        isOpen={isAddOpen || !!editTarget}
        onClose={() => { setIsAddOpen(false); setEditTarget(null); }}
        location={editTarget}
        defaultCustomerId={selectedCustomerId !== 'all' ? selectedCustomerId : undefined}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          await confirmModal.onConfirm();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        confirmLabel={confirmModal.confirmLabel || 'Delete Location'}
      />

      {isExportOpen && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          filteredData={selectedLocationsForExport}
          columns={LOCATION_EXPORT_COLUMNS}
          fileNamePrefix="customer_locations_registry"
          title="Export Customer Locations"
        />
      )}

      <ExcelImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityLabel="Locations"
        columns={LOCATION_COLUMNS}
        requiredFields={['name']}
        preferSheet="CANONICAL_IMPORT"
        templateUrl="/templates/MERCON_Canonical_Locations_IMPORT.xlsx"
        onImport={(rows: any[]) => locationService.importRows(rows)}
        invalidateKeys={[['locations'], ['locations-all']]}
      />

    </DashboardLayout>
  );
}
