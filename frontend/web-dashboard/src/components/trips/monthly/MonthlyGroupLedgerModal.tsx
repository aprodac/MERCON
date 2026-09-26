import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Search,
  X,
  ArrowRight,
  Trash2,
  MapPin,
  SlidersHorizontal,
  Lightbulb,
  ChevronDown,
  Edit3,
  HelpCircle,
  Check,
  User,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDriverDetails } from '@/utils/driverStatusUtils';

import type { TemplateGroup } from './MonthlyCompanyBoard';
import { tripService, type MonthlyBoardTrip } from '@/services/tripService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { getDriverAvatar } from '@/lib/driverAvatarMap';
import { formatDayHeading, formatMoney, formatTime, initialsOf, isUnassigned, formatLocationClean } from './monthlyBoardUtils';

const STATUS_LIST = [
  'Scheduled',
  'Loading',
  'InTransit',
  'Completed',
  'Invoiced',
  'Cancelled',
];

const CORE_CATEGORIES = ['Single Trip', 'Round Trip', '10 Hours Duty', '12 Hours Duty'];

interface PendingChange {
  title: string;
  fieldLabel: string;
  tripContext: string;
  fromValue: string;
  toValue: string;
  payload: {
    trip_ids: string[];
    driver_id?: string;
    vehicle_id?: string;
    status?: string;
    rate_category?: string;
  };
}

interface MonthlyGroupLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TemplateGroup | null;
  companyName: string;
  companyLogo?: string | null;
  allCompanyTrips?: MonthlyBoardTrip[];
  onRefresh?: () => void;
}

export default function MonthlyGroupLedgerModal({
  isOpen,
  onClose,
  group,
  companyName,
  companyLogo,
  allCompanyTrips = [],
  onRefresh,
}: MonthlyGroupLedgerModalProps) {
  const queryClient = useQueryClient();

  // Search, Filter & Sort state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unassigned' | 'Completed' | 'Scheduled' | 'InTransit'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'driver' | 'vehicle'>('latest');
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  useEffect(() => {
    if (group?.lineType) {
      setCategoryFilter(group.lineType);
    } else {
      setCategoryFilter('ALL');
    }
  }, [group?.key, group?.lineType]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(CORE_CATEGORIES);
    if (group?.lineType) set.add(group.lineType);
    if (allCompanyTrips) {
      allCompanyTrips.forEach((t) => {
        const cat = t.rate_category || t.billing_type;
        if (cat) set.add(cat);
      });
    }
    return Array.from(set);
  }, [group, allCompanyTrips]);

  // Bulk assignment staging state
  const [bulkDriverId, setBulkDriverId] = useState<string>('');
  const [bulkVehicleId, setBulkVehicleId] = useState<string>('');

  // Active inline popover trip tracking
  const [activeDriverTripId, setActiveDriverTripId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState<string>('');
  const [activeVehicleTripId, setActiveVehicleTripId] = useState<string | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState<string>('');

  // Deletion confirmation state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  // Fetch all available drivers
  const { data: driversRes } = useQuery({
    queryKey: ['drivers-ledger-lookup'],
    queryFn: () => driverService.getAll({ per_page: 1000, mode: 'lookup' }),
    enabled: isOpen,
  });

  // Fetch all available vehicles
  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles-ledger-lookup'],
    queryFn: () => vehicleService.getAll({ per_page: 1000, mode: 'lookup' }),
    enabled: isOpen,
  });

  const rawDrivers = driversRes?.data || [];
  const rawVehicles = vehiclesRes?.data || [];

  const driverOptions = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [
      { value: 'unassigned', label: '— Unassign Driver —', keywords: 'none unassign remove' },
    ];
    rawDrivers.forEach((d) => {
      const details = formatDriverDetails(d);
      const phoneStr = (d as any).phone || d.phone_primary || '';

      opts.push({
        value: d.id,
        label: `${d.first_name} ${d.last_name} (${details})`,
        keywords: `${d.first_name} ${d.last_name} ${phoneStr} ${details} ${d.status || ''}`,
      });
    });
    return opts;
  }, [rawDrivers]);

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [
      { value: 'unassigned', label: '— Unassign Vehicle —', keywords: 'none unassign remove' },
    ];
    rawVehicles.forEach((v) => {
      const capTon = v.capacity_kg ? (v.capacity_kg / 1000).toFixed(0) + 'T' : '';
      const typeStr = (v as any).type || v.asset_type || 'Truck';
      const meta = [typeStr, capTon].filter(Boolean).join(' · ');

      opts.push({
        value: v.id,
        label: meta ? `${v.plate_number} (${meta})` : v.plate_number,
        keywords: `${v.plate_number} ${typeStr} ${capTon}`,
      });
    });
    return opts;
  }, [rawVehicles]);

  const filteredDriversList = useMemo(() => {
    if (!driverSearch.trim()) return rawDrivers;
    const q = driverSearch.trim().toLowerCase();
    return rawDrivers.filter((d) => {
      const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim().toLowerCase();
      const customName = ((d as any).name || '').toLowerCase();
      const phone = ((d as any).phone || d.phone_primary || '').toLowerCase();
      return fullName.includes(q) || customName.includes(q) || phone.includes(q);
    });
  }, [rawDrivers, driverSearch]);

  const filteredVehiclesList = useMemo(() => {
    if (!vehicleSearch.trim()) return rawVehicles;
    const q = vehicleSearch.trim().toLowerCase();
    return rawVehicles.filter((v) => {
      const plate = (v.plate_number || '').toLowerCase();
      const typeStr = ((v as any).type || v.asset_type || '').toLowerCase();
      return plate.includes(q) || typeStr.includes(q);
    });
  }, [rawVehicles, vehicleSearch]);

  // Bulk / single assign mutation
  const assignMutation = useMutation({
    mutationFn: (payload: { trip_ids: string[]; driver_id?: string; vehicle_id?: string; status?: string; rate_category?: string }) =>
      tripService.bulkAssign(payload),
    onSuccess: (data, vars) => {
      toast.success(
        vars.trip_ids.length === 1
          ? 'Trip updated successfully'
          : `Updated ${vars.trip_ids.length} selected trip(s)`
      );
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trips', 'monthly-board'] });
      onRefresh?.();
      setBulkDriverId('');
      setBulkVehicleId('');
      setActiveDriverTripId(null);
      setActiveVehicleTripId(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to update trip assignments');
    },
  });

  // Delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => tripService.bulkDelete(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trips', 'monthly-board'] });
      onRefresh?.();
      setSelectedTripIds([]);
      setIsDeleteConfirmOpen(false);
      setTripToDelete(null);

      if (res?.skippedCount > 0) {
        if (res.deletedCount > 0) {
          toast.warning(`Deleted ${res.deletedCount} trip(s). ${res.skippedCount} trip(s) were protected from deletion (invoiced/settled).`);
        } else {
          toast.error(`Cannot delete trip(s): selected trip(s) are already invoiced or completed.`);
        }
      } else {
        toast.success(
          res.deletedCount === 1
            ? 'Trip deleted successfully'
            : `Deleted ${res.deletedCount} trip(s)`
        );
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to delete trips');
    },
  });

  const baseTrips = useMemo(() => {
    if (allCompanyTrips && allCompanyTrips.length > 0) {
      if (group?.origin && group?.destination) {
        const routeTrips = allCompanyTrips.filter((t) => {
          const o = formatLocationClean(t.origin);
          const d = formatLocationClean(t.destination);
          return o === group.origin && d === group.destination;
        });
        return routeTrips.length > 0 ? routeTrips : allCompanyTrips;
      }
      return allCompanyTrips;
    }
    return group?.trips || [];
  }, [allCompanyTrips, group]);

  const normalizeCat = (c: string) => (c || '').toLowerCase().replace(/[\s_-]+/g, '');

  const allTrips = useMemo(() => {
    if (categoryFilter === 'ALL') return baseTrips;
    const target = normalizeCat(categoryFilter);
    return baseTrips.filter((trip) => {
      const tripCat = trip.rate_category || trip.billing_type || 'Single Trip';
      const norm = normalizeCat(tripCat);
      return (
        norm === target ||
        (target.includes('10hour') && norm.includes('10hour')) ||
        (target.includes('12hour') && norm.includes('12hour')) ||
        (target.includes('round') && norm.includes('round')) ||
        (target.includes('single') && norm.includes('single'))
      );
    });
  }, [baseTrips, categoryFilter]);

  // Filtered & Sorted trips
  const filteredTrips = useMemo(() => {
    const list = allTrips.filter((trip) => {
      // Status filter
      if (statusFilter === 'Unassigned' && !isUnassigned(trip)) return false;
      if (statusFilter === 'Completed' && trip.status !== 'Completed' && trip.status !== 'Invoiced') return false;
      if (statusFilter === 'Scheduled' && trip.status !== 'Scheduled' && trip.status !== 'Draft') return false;
      if (statusFilter === 'InTransit' && trip.status !== 'InTransit' && trip.status !== 'Loading') return false;

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const refMatch = (trip.ref_id || '').toLowerCase().includes(q);
        const driverMatch = (trip.driver?.name || '').toLowerCase().includes(q);
        const vehicleMatch = (trip.vehicle?.plate_number || '').toLowerCase().includes(q);
        const dateMatch = (trip.date || '').toLowerCase().includes(q);
        if (!refMatch && !driverMatch && !vehicleMatch && !dateMatch) return false;
      }

      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'latest') {
        const dCompare = b.date.localeCompare(a.date);
        if (dCompare !== 0) return dCompare;
        return (b.planned_start || '').localeCompare(a.planned_start || '');
      }
      if (sortBy === 'oldest') {
        const dCompare = a.date.localeCompare(b.date);
        if (dCompare !== 0) return dCompare;
        return (a.planned_start || '').localeCompare(b.planned_start || '');
      }
      if (sortBy === 'driver') {
        return (a.driver?.name || 'zzz').localeCompare(b.driver?.name || 'zzz');
      }
      if (sortBy === 'vehicle') {
        return (a.vehicle?.plate_number || 'zzz').localeCompare(b.vehicle?.plate_number || 'zzz');
      }
      return 0;
    });
  }, [allTrips, statusFilter, search, sortBy]);

  const totalAmount = useMemo(() => {
    return allTrips.reduce((sum, t) => sum + (t.billing_amount ?? 0), 0);
  }, [allTrips]);

  const activeRateStr = useMemo(() => {
    if (allTrips.length > 0 && allTrips[0].billing_amount != null) {
      return formatMoney(allTrips[0].billing_amount, allTrips[0].currency);
    }
    return group?.rateStr;
  }, [allTrips, group?.rateStr]);

  const allVisibleIds = filteredTrips.map((t) => t.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedTripIds.includes(id));
  const isSomeSelected = !isAllSelected && allVisibleIds.some((id) => selectedTripIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTripIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    } else {
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...allVisibleIds])));
    }
  };

  const handleToggleTrip = (id: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Pending Change Confirmation state
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const getDriverDisplayName = (d?: any) => {
    if (!d) return 'Unassigned';
    return d.name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.ref_id || 'Driver';
  };

  // Handlers for single trip inline updates
  const handleSingleDriverChange = (tripId: string, newDriverId: string) => {
    setActiveDriverTripId(null);
    const trip = allTrips.find((t) => t.id === tripId);
    const currentDriverName = getDriverDisplayName(trip?.driver);
    const foundDriver = rawDrivers.find((d) => d.id === newDriverId);
    const newDriverName =
      newDriverId === 'unassigned' || !newDriverId
        ? 'Unassigned'
        : foundDriver
        ? getDriverDisplayName(foundDriver)
        : newDriverId;

    if (currentDriverName === newDriverName) return;

    setPendingChange({
      title: 'Confirm Driver Change',
      fieldLabel: 'Assigned Driver',
      tripContext: `${trip?.ref_id || 'Trip'} · ${trip?.date ? formatDayHeading(trip.date) : ''} ${formatTime(trip?.planned_start ?? null)}`,
      fromValue: currentDriverName,
      toValue: newDriverName,
      payload: {
        trip_ids: [tripId],
        driver_id: newDriverId,
      },
    });
  };

  const handleSingleVehicleChange = (tripId: string, newVehicleId: string) => {
    setActiveVehicleTripId(null);
    const trip = allTrips.find((t) => t.id === tripId);
    const currentVehiclePlate = trip?.vehicle?.plate_number || 'Unassigned';
    const newVehiclePlate =
      newVehicleId === 'unassigned' || !newVehicleId
        ? 'Unassigned'
        : rawVehicles.find((v) => v.id === newVehicleId)?.plate_number || newVehicleId;

    if (currentVehiclePlate === newVehiclePlate) return;

    setPendingChange({
      title: 'Confirm Vehicle Change',
      fieldLabel: 'Assigned Vehicle',
      tripContext: `${trip?.ref_id || 'Trip'} · ${trip?.date ? formatDayHeading(trip.date) : ''} ${formatTime(trip?.planned_start ?? null)}`,
      fromValue: currentVehiclePlate,
      toValue: newVehiclePlate,
      payload: {
        trip_ids: [tripId],
        vehicle_id: newVehicleId,
      },
    });
  };

  const handleSingleStatusChange = (tripId: string, newStatus: string) => {
    const trip = allTrips.find((t) => t.id === tripId);
    const currentStatus = trip?.status || 'Scheduled';
    if (currentStatus === newStatus) return;

    setPendingChange({
      title: 'Confirm Status Change',
      fieldLabel: 'Trip Status',
      tripContext: `${trip?.ref_id || 'Trip'} · ${trip?.date ? formatDayHeading(trip.date) : ''} ${formatTime(trip?.planned_start ?? null)}`,
      fromValue: currentStatus,
      toValue: newStatus,
      payload: {
        trip_ids: [tripId],
        status: newStatus,
      },
    });
  };

  const handleApplyBulkDriver = (val: string) => {
    if (!val || selectedTripIds.length === 0) return;
    const foundDriver = rawDrivers.find((d) => d.id === val);
    const newDriverName =
      val === 'unassigned'
        ? 'Unassigned'
        : foundDriver
        ? getDriverDisplayName(foundDriver)
        : val;

    setPendingChange({
      title: 'Confirm Bulk Driver Assignment',
      fieldLabel: 'Assigned Driver',
      tripContext: `${selectedTripIds.length} Selected Trips`,
      fromValue: 'Current Assignments',
      toValue: newDriverName,
      payload: {
        trip_ids: selectedTripIds,
        driver_id: val,
      },
    });
  };

  const handleApplyBulkVehicle = (val: string) => {
    if (!val || selectedTripIds.length === 0) return;
    const newVehiclePlate =
      val === 'unassigned'
        ? 'Unassigned'
        : rawVehicles.find((v) => v.id === val)?.plate_number || val;

    setPendingChange({
      title: 'Confirm Bulk Vehicle Assignment',
      fieldLabel: 'Assigned Vehicle',
      tripContext: `${selectedTripIds.length} Selected Trips`,
      fromValue: 'Current Assignments',
      toValue: newVehiclePlate,
      payload: {
        trip_ids: selectedTripIds,
        vehicle_id: val,
      },
    });
  };

  const handleApplyBulkStatus = (val: string) => {
    if (!val || selectedTripIds.length === 0) return;

    setPendingChange({
      title: 'Confirm Bulk Status Change',
      fieldLabel: 'Trip Status',
      tripContext: `${selectedTripIds.length} Selected Trips`,
      fromValue: 'Current Statuses',
      toValue: val,
      payload: {
        trip_ids: selectedTripIds,
        status: val,
      },
    });
  };

  const handleApplyBulkCategory = (val: string) => {
    if (!val || selectedTripIds.length === 0) return;

    setPendingChange({
      title: 'Confirm Bulk Category Change',
      fieldLabel: 'Trip Category (Line Type)',
      tripContext: `${selectedTripIds.length} Selected Trips`,
      fromValue: 'Current Categories',
      toValue: val.replace(/_/g, ' '),
      payload: {
        trip_ids: selectedTripIds,
        rate_category: val,
      },
    });
  };

  const handleGroupCategoryChange = (newCat: string) => {
    if (!newCat) return;
    const currentCat = (categoryFilter !== 'ALL' ? categoryFilter : (group?.lineType || 'Single Trip')).replace(/_/g, ' ');
    const targetCat = newCat.replace(/_/g, ' ');
    if (currentCat.toLowerCase() === targetCat.toLowerCase()) return;

    const tripIdsToUpdate = allTrips.map((t) => t.id);
    if (tripIdsToUpdate.length === 0) return;

    setPendingChange({
      title: 'Confirm Category Change',
      fieldLabel: 'Trip Category (Line Type)',
      tripContext: `All ${allTrips.length} Trips in this Group for ${companyName}`,
      fromValue: currentCat,
      toValue: targetCat,
      payload: {
        trip_ids: tripIdsToUpdate,
        rate_category: newCat,
      },
    });
  };

  const handleConfirmPendingChange = () => {
    if (!pendingChange) return;
    assignMutation.mutate(pendingChange.payload, {
      onSuccess: () => {
        if (pendingChange.payload.rate_category) {
          setCategoryFilter(pendingChange.payload.rate_category);
        }
        setPendingChange(null);
      },
    });
  };

  const getStatusBadgeStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === 'invoiced') {
      return 'bg-emerald-50 text-emerald-600 border border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-400';
    }
    if (s === 'intransit' || s === 'loading') {
      return 'bg-blue-50 text-blue-600 border border-blue-200/80 dark:bg-blue-950/40 dark:border-blue-800/60 dark:text-blue-400';
    }
    if (s === 'scheduled' || s === 'draft') {
      return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
    }
    if (s === 'cancelled') {
      return 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-400';
    }
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  };

  if (!group) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-[24px] border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl [&>button]:right-6 [&>button]:top-6 [&>button]:text-slate-400 [&>button]:hover:text-slate-600">
        
        {/* ── 1. Top Header Area (Clean Light Design matching reference) ── */}
        <div className="p-6 sm:px-8 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0">
          
          {/* Left: Company Partner Logo, Title & Route */}
          <div className="flex items-center gap-4 min-w-0">
            {companyLogo ? (
              <img
                src={companyLogo}
                alt={companyName}
                className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-full object-contain p-1 border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white"
              />
            ) : (
              <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-full bg-blue-600 text-white font-black text-xl flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900">
                {initialsOf(companyName)}
              </div>
            )}

            <div className="min-w-0">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                DELIVERY PARTNER
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                {companyName}
              </h2>
              
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100 mt-1 capitalize">
                <MapPin className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2.2] shrink-0" />
                <span>{formatLocationClean(group.origin)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <MapPin className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2.2] shrink-0" />
                <span>{formatLocationClean(group.destination)}</span>
              </div>
              <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                Kingdom of Saudi Arabia
              </span>
            </div>
          </div>

          {/* Right: Total Amount & Per-Trip Rate with Feature Badges */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-2xl sm:text-3xl font-black text-emerald-500 dark:text-emerald-400 leading-none">
                  {formatMoney(totalAmount)}
                </span>
                {activeRateStr && activeRateStr !== '—' && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/40 whitespace-nowrap shadow-3xs">
                    ({activeRateStr} / trip)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Vehicle Class Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-3xs">
                <Truck className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>{group.vehicleClass}</span>
              </div>

              {/* Interactive Line Type / Category Badge */}
              <Select
                value={categoryFilter !== 'ALL' ? categoryFilter : (group.lineType || '10 Hours Duty')}
                onValueChange={handleGroupCategoryChange}
              >
                <SelectTrigger className="h-7 px-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 font-bold text-xs shadow-3xs hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer flex items-center gap-1.5 focus:ring-0">
                  <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="uppercase">
                    {categoryFilter !== 'ALL'
                      ? categoryFilter.replace(/_/g, ' ')
                      : (group.lineType || 'Category').replace(/_/g, ' ')}
                  </span>
                </SelectTrigger>
                <SelectContent align="end" className="bg-white dark:bg-slate-900 z-50">
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">
                      Change Category (All {allTrips.length} Trips)
                    </SelectLabel>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs font-semibold">
                        {cat.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── 2. Toolbar: Search Bar, Filter Chips, Category Select & Sort Select ── */}
        <div className="p-3 sm:px-8 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 overflow-x-auto custom-scrollbar">
          
          {/* Left / Center: Search Input + Status Filter Chips + Category Filter */}
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <div className="relative w-48 sm:w-60 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search ref, driver, vehicle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs bg-slate-50/80 dark:bg-slate-900 rounded-xl border-slate-200 dark:border-slate-800 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-[#FA634E]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 shrink-0">
              {(['All', 'Unassigned', 'Scheduled', 'InTransit', 'Completed'] as const).map((filterOpt) => {
                const isActive = statusFilter === filterOpt;
                return (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => setStatusFilter(filterOpt)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-[#FA634E] text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{filterOpt}</span>
                    {filterOpt === 'All' && (
                      <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}>
                        {allTrips.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Trip Category / Line Type Filter Dropdown */}
            <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val)}>
              <SelectTrigger className="h-9 text-xs font-bold min-w-[135px] max-w-[170px] rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-3xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#FA634E] shrink-0" />
                <span className="truncate">
                  {categoryFilter === 'ALL' ? 'All Categories' : categoryFilter.replace(/_/g, ' ')}
                </span>
              </SelectTrigger>
              <SelectContent align="start" className="bg-white dark:bg-slate-900 z-50">
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">Trip Category</SelectLabel>
                  <SelectItem value="ALL" className="text-xs font-semibold">
                    All Categories
                  </SelectItem>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs font-semibold">
                      {cat.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Right: Quick Selection Count / Sort dropdown */}
          <div className="flex items-center gap-2.5 shrink-0">
            {selectedTripIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setTripToDelete(null);
                    setIsDeleteConfirmOpen(true);
                  }}
                  disabled={bulkDeleteMutation.isPending}
                  className="h-8 px-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer rounded-xl"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedTripIds.length})</span>
                </Button>

                <button
                  type="button"
                  onClick={() => setSelectedTripIds([])}
                  className="text-xs font-bold text-[#FA634E] hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className="h-9 text-xs font-bold w-32 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-3xs shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="bg-white dark:bg-slate-900">
                <SelectItem value="latest" className="text-xs font-semibold">Latest First</SelectItem>
                <SelectItem value="oldest" className="text-xs font-semibold">Oldest First</SelectItem>
                <SelectItem value="driver" className="text-xs font-semibold">By Driver</SelectItem>
                <SelectItem value="vehicle" className="text-xs font-semibold">By Vehicle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── 3. Sticky Bulk Actions Bar (When >= 1 trips selected) ── */}
        {selectedTripIds.length > 0 && (
          <div className="px-6 py-2.5 bg-[#FA634E]/10 dark:bg-[#FA634E]/15 border-b border-[#FA634E]/30 flex flex-wrap items-center justify-between gap-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#3E3C3D] dark:text-white bg-[#FA634E]/20 px-2.5 py-0.5 rounded-lg border border-[#FA634E]/30">
                {selectedTripIds.length} Selected
              </span>
              <span className="text-xs text-slate-700 dark:text-slate-200 font-semibold hidden sm:inline">
                Bulk assign to all selected dates:
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Bulk Driver Selector */}
              <div className="w-48 sm:w-56">
                <Combobox
                  options={driverOptions}
                  value={bulkDriverId}
                  onChange={(val) => {
                    setBulkDriverId(val);
                    if (val) {
                      handleApplyBulkDriver(val);
                    }
                  }}
                  placeholder="Set Driver for all..."
                  searchPlaceholder="Search drivers..."
                  className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                />
              </div>

              {/* Bulk Vehicle Selector */}
              <div className="w-48 sm:w-56">
                <Combobox
                  options={vehicleOptions}
                  value={bulkVehicleId}
                  onChange={(val) => {
                    setBulkVehicleId(val);
                    if (val) {
                      handleApplyBulkVehicle(val);
                    }
                  }}
                  placeholder="Set Vehicle for all..."
                  searchPlaceholder="Search vehicles..."
                  className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                />
              </div>

              {/* Bulk Category Selector */}
              <Select onValueChange={handleApplyBulkCategory}>
                <SelectTrigger className="h-8 w-36 text-xs bg-white dark:bg-slate-900 border-slate-300 text-[#3E3C3D] dark:text-white font-bold rounded-lg">
                  <SelectValue placeholder="Set Category..." />
                </SelectTrigger>
                <SelectContent align="end" className="bg-white dark:bg-slate-900 z-50">
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">Change Category</SelectLabel>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs font-semibold">
                        {cat.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              {/* Bulk Status Selector */}
              <Select onValueChange={handleApplyBulkStatus}>
                <SelectTrigger className="h-8 w-36 text-xs bg-white dark:bg-slate-900 border-slate-300 text-[#3E3C3D] dark:text-white font-bold rounded-lg">
                  <SelectValue placeholder="Set Status..." />
                </SelectTrigger>
                <SelectContent align="end" className="bg-white dark:bg-slate-900 z-50">
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">Change Status</SelectLabel>
                    {STATUS_LIST.map((st) => (
                      <SelectItem key={st} value={st} className="text-xs font-semibold">
                        Set to {st}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              {/* Bulk Delete Button */}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setTripToDelete(null);
                  setIsDeleteConfirmOpen(true);
                }}
                disabled={bulkDeleteMutation.isPending}
                className="h-8 px-3 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedTripIds.length})</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── 4. Main Ledger Table ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur z-10 shadow-xs border-y border-slate-100 dark:border-slate-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-6 py-3">
                  <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                    onCheckedChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 data-[state=checked]:bg-[#FA634E] data-[state=checked]:border-[#FA634E]"
                  />
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-40">
                  DATE & TIME
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-28">
                  TRIP REF
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  ASSIGNED DRIVER
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  ASSIGNED VEHICLE
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-32">
                  STATUS
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-right w-24">
                  AMOUNT
                </TableHead>
                <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-center w-24">
                  ACTION
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredTrips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40 text-center text-xs text-slate-400 font-medium">
                    No trips match the selected filter criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrips.map((trip) => {
                  const isSelected = selectedTripIds.includes(trip.id);
                  const isMissingResource = isUnassigned(trip);

                  return (
                    <TableRow
                      key={trip.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#FA634E]/5 dark:bg-[#FA634E]/10'
                          : isMissingResource
                          ? 'bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <TableCell className="px-6 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleTrip(trip.id)}
                          className="h-4 w-4 rounded border-slate-300 data-[state=checked]:bg-[#FA634E] data-[state=checked]:border-[#FA634E]"
                        />
                      </TableCell>

                      {/* Date & Time */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDayHeading(trip.date)}</span>
                          <span className="text-[11px] font-medium text-slate-400">
                            {formatTime(trip.planned_start)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Trip Ref ID */}
                      <TableCell className="py-3">
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md shadow-3xs">
                          {trip.ref_id || 'TRP-NEW'}
                        </span>
                      </TableCell>

                      {/* Driver Column: Inline Direct Popover */}
                      <TableCell className="py-3">
                        <Popover
                          open={activeDriverTripId === trip.id}
                          onOpenChange={(open) => {
                            setActiveDriverTripId(open ? trip.id : null);
                            if (!open) setDriverSearch('');
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="group flex items-center gap-2 text-xs font-semibold text-left max-w-[200px] truncate p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Click to change driver"
                            >
                              {trip.driver ? (
                                <>
                                  {(() => {
                                    const tripDriverAvatar = getDriverAvatar(trip.driver.avatar_url, trip.driver.name);
                                    return tripDriverAvatar ? (
                                      <img
                                        src={tripDriverAvatar}
                                        alt={trip.driver.name}
                                        className="h-5 w-5 rounded-full object-cover shrink-0"
                                      />
                                    ) : (
                                      <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-[9px] flex items-center justify-center shrink-0">
                                        {initialsOf(trip.driver.name)}
                                      </span>
                                    );
                                  })()}
                                  <span className="truncate text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E] font-bold">
                                    {trip.driver.name}
                                  </span>
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold text-[11px] bg-amber-50 dark:bg-amber-950/50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                  No Driver
                                </span>
                              )}
                              <ChevronDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 ml-auto" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                              Assign Driver for {trip.ref_id || 'Trip'}
                            </div>
                            <div className="relative my-1">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <Input
                                placeholder="Search driver..."
                                value={driverSearch}
                                onChange={(e) => setDriverSearch(e.target.value)}
                                className="h-8 pl-8 text-xs rounded-lg"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-0.5 mt-1.5 custom-scrollbar">
                              <button
                                type="button"
                                onClick={() => handleSingleDriverChange(trip.id, 'unassigned')}
                                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg font-semibold flex items-center justify-between transition-colors ${
                                  !trip.driver
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                                    : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                }`}
                              >
                                <span>— Unassign Driver —</span>
                                {!trip.driver && <Check className="w-3.5 h-3.5 text-rose-600" />}
                              </button>
                              {filteredDriversList.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-400 font-medium">
                                  No drivers found
                                </div>
                              ) : (
                                filteredDriversList.map((d) => {
                                  const isSelected = trip.driver?.id === d.id;
                                  const name = getDriverDisplayName(d);
                                  const phone = (d as any).phone || d.phone_primary || '';
                                  const dAvatar = getDriverAvatar(d.avatar_url, name);
                                  return (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => handleSingleDriverChange(trip.id, d.id)}
                                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg font-semibold flex items-center justify-between transition-colors ${
                                        isSelected
                                          ? 'bg-[#FA634E]/10 text-[#FA634E] font-bold'
                                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        {dAvatar ? (
                                          <img src={dAvatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                                        ) : (
                                          <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-[9px] flex items-center justify-center shrink-0">
                                            {initialsOf(name)}
                                          </span>
                                        )}
                                        <div className="truncate">
                                          <div className="truncate">{name}</div>
                                          {phone && <div className="text-[10px] text-slate-400 font-normal">{phone}</div>}
                                        </div>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-[#FA634E] shrink-0" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>

                      {/* Vehicle Column: Inline Direct Popover */}
                      <TableCell className="py-3">
                        <Popover
                          open={activeVehicleTripId === trip.id}
                          onOpenChange={(open) => {
                            setActiveVehicleTripId(open ? trip.id : null);
                            if (!open) setVehicleSearch('');
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="group flex items-center gap-2 text-xs font-semibold text-left max-w-[180px] truncate p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Click to change vehicle"
                            >
                              {trip.vehicle ? (
                                <>
                                  <Truck className="h-4 w-4 text-slate-500 shrink-0 group-hover:text-[#FA634E]" />
                                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-[#FA634E]">
                                    {trip.vehicle.plate_number}
                                  </span>
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold text-[11px] bg-amber-50 dark:bg-amber-950/50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                  No Truck
                                </span>
                              )}
                              <ChevronDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 ml-auto" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                              Assign Truck for {trip.ref_id || 'Trip'}
                            </div>
                            <div className="relative my-1">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <Input
                                placeholder="Search plate or type..."
                                value={vehicleSearch}
                                onChange={(e) => setVehicleSearch(e.target.value)}
                                className="h-8 pl-8 text-xs rounded-lg"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-0.5 mt-1.5 custom-scrollbar">
                              <button
                                type="button"
                                onClick={() => handleSingleVehicleChange(trip.id, 'unassigned')}
                                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg font-semibold flex items-center justify-between transition-colors ${
                                  !trip.vehicle
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                                    : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                }`}
                              >
                                <span>— Unassign Vehicle —</span>
                                {!trip.vehicle && <Check className="w-3.5 h-3.5 text-rose-600" />}
                              </button>
                              {filteredVehiclesList.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-400 font-medium">
                                  No vehicles found
                                </div>
                              ) : (
                                filteredVehiclesList.map((v) => {
                                  const isSelected = trip.vehicle?.id === v.id;
                                  const capTon = v.capacity_kg ? (v.capacity_kg / 1000).toFixed(0) + 'T' : '';
                                  const typeStr = (v as any).type || v.asset_type || 'Truck';
                                  const meta = [typeStr, capTon].filter(Boolean).join(' · ');
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => handleSingleVehicleChange(trip.id, v.id)}
                                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg font-semibold flex items-center justify-between transition-colors ${
                                        isSelected
                                          ? 'bg-[#FA634E]/10 text-[#FA634E] font-bold'
                                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div className="truncate">
                                          <span className="font-mono font-bold">{v.plate_number}</span>
                                          {meta && <span className="text-[10px] text-slate-400 ml-1.5 font-normal">({meta})</span>}
                                        </div>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-[#FA634E] shrink-0" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>

                      {/* Status Column: Quick Status Select with Styled Pill Trigger */}
                      <TableCell className="py-3">
                        <Select
                          value={trip.status}
                          onValueChange={(val) => handleSingleStatusChange(trip.id, val)}
                        >
                          <SelectTrigger className={`h-7 text-xs font-bold w-32 px-2.5 rounded-full shadow-3xs flex items-center justify-between ${getStatusBadgeStyle(trip.status)}`}>
                            <div className="flex items-center gap-1.5 truncate">
                              {(trip.status === 'Completed' || trip.status === 'Invoiced') && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              )}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent align="start" className="bg-white dark:bg-slate-900">
                            {STATUS_LIST.map((st) => (
                              <SelectItem key={st} value={st} className="text-xs font-semibold">
                                {st}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Billing Amount */}
                      <TableCell className="py-3 text-right font-bold text-xs text-slate-900 dark:text-slate-100">
                        {trip.billing_amount != null ? formatMoney(trip.billing_amount, trip.currency) : '—'}
                      </TableCell>

                      {/* Action: Open Trip Details & Delete Trip */}
                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/trips/${trip.id}`, '_blank')}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-[#FA634E] hover:bg-[#FA634E]/10 rounded-md"
                            title="Open trip details in new tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTripToDelete(trip.id);
                              setIsDeleteConfirmOpen(true);
                            }}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md"
                            title="Delete this trip"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── 5. Modal Footer (matching reference layout) ── */}
        <div className="p-4 px-8 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Lightbulb className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Click on any driver, vehicle, or status cell to update immediately.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 px-6 text-xs font-bold rounded-xl border-slate-200 dark:border-slate-800 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmModal
      isOpen={isDeleteConfirmOpen}
      onClose={() => {
        setIsDeleteConfirmOpen(false);
        setTripToDelete(null);
      }}
      onConfirm={() => {
        const idsToDelete = tripToDelete ? [tripToDelete] : selectedTripIds;
        if (idsToDelete.length > 0) {
          bulkDeleteMutation.mutate(idsToDelete);
        }
      }}
      title={tripToDelete ? 'Delete Trip?' : `Delete ${selectedTripIds.length} Selected Trip(s)?`}
      message={
        tripToDelete
          ? 'Are you sure you want to permanently delete this trip? This action cannot be undone.'
          : `Are you sure you want to delete ${selectedTripIds.length} selected trip(s)? Completed or invoiced trips will be protected.`
      }
      confirmLabel={bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete'}
      isDestructive
      isLoading={bulkDeleteMutation.isPending}
    />

    {/* ── 6. Change Confirmation Diff Modal (Clean, Centered, Constrained) ── */}
    <Dialog
      open={Boolean(pendingChange)}
      onOpenChange={(open) => {
        if (!open && !assignMutation.isPending) {
          setPendingChange(null);
          setBulkDriverId('');
          setBulkVehicleId('');
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px] w-[calc(100vw-2rem)] rounded-[24px] p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl [&>button]:right-5 [&>button]:top-5 z-50 overflow-hidden">
        <div className="flex flex-col gap-4 w-full min-w-0">
          {/* Icon + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FA634E]/10 dark:bg-[#FA634E]/20 text-[#FA634E] flex items-center justify-center shrink-0 shadow-3xs">
              <Edit3 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
                {pendingChange?.title || 'Confirm Changes'}
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate">
                Please review the proposed update before applying.
              </p>
            </div>
          </div>

          {/* Trip context tag */}
          {pendingChange?.tripContext && (
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 w-full min-w-0">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate flex-1">{pendingChange.tripContext}</span>
            </div>
          )}

          {/* Visual Diff: Current -> New */}
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 w-full min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {pendingChange?.fieldLabel}
            </span>
            
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 w-full min-w-0">
              {/* Current / From */}
              <div className="min-w-0 w-full p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center overflow-hidden">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">CURRENT</span>
                <span
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate block line-through decoration-slate-400"
                  title={pendingChange?.fromValue || '—'}
                >
                  {pendingChange?.fromValue || '—'}
                </span>
              </div>

              <ArrowRight className="w-4 h-4 text-[#FA634E] shrink-0 stroke-[2.5]" />

              {/* New / To */}
              <div className="min-w-0 w-full p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-center shadow-3xs overflow-hidden">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block mb-0.5">NEW</span>
                <span
                  className="text-xs font-black text-emerald-700 dark:text-emerald-300 truncate block"
                  title={pendingChange?.toValue || '—'}
                >
                  {pendingChange?.toValue || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1 w-full min-w-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingChange(null);
                setBulkDriverId('');
                setBulkVehicleId('');
              }}
              disabled={assignMutation.isPending}
              className="flex-1 h-10 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmPendingChange}
              disabled={assignMutation.isPending}
              className="flex-1 h-10 text-xs font-bold bg-[#FA634E] hover:bg-[#e05440] text-white rounded-xl cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              {assignMutation.isPending ? 'Updating...' : 'Confirm & Apply'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
