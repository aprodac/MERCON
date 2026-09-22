import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  Navigation,
  Search,
  RefreshCw,
  Truck,
  User,
  MapPin,
  Layers,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Calendar as CalendarIcon,
  Building2,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  X,
  MoreHorizontal,
  ArrowDown,
  ArrowUp,
  Kanban,
  LayoutList,
  Receipt,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TruckMotion, CheckBadge, RouteLine, ClockIcon, RiskAlert } from '@/components/ui/kpi-icons';

import { format, subDays, addDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { tripService, Trip, TripStatus, getTripPayloadCapacity, getTripRateCategory, downloadTripExport } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTripWhatsAppShare } from '@/hooks/useTripWhatsAppShare';
import { useTripBulkImport, findDriverCandidates, downloadImportTemplate } from '@/hooks/useTripBulkImport';
import { TripDateFilterPicker, DateFilterType } from '@/components/trips/TripDateFilterPicker';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { TaxonomyBadge } from '@/components/common/TaxonomyBadge';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import DeletedBadge from '@/components/ui/DeletedBadge';
import Btn from '@/components/ui/Btn';
import KpiCard from '@/components/ui/KpiCard';
import TripKpiCards from '@/components/trips/TripKpiCards';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import PastDateTripConfirmModal from '@/components/trips/PastDateTripConfirmModal';


type TripSortOption = 'latest' | 'oldest' | 'price_desc' | 'price_asc' | 'ref_id_asc' | 'ref_id_desc' | 'customer_asc' | 'status';

const TRIP_SORT_OPTIONS: SortOption<TripSortOption>[] = [
  { value: 'latest', label: 'Newest Added', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest Added', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'price_desc', label: 'Billing Price (High → Low)', icon: <ArrowDown className="w-3.5 h-3.5 text-emerald-600" /> },
  { value: 'price_asc', label: 'Billing Price (Low → High)', icon: <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> },
];
import ConfirmModal from '@/components/ui/ConfirmModal';
import PostTripSettlementModal from '@/components/trips/PostTripSettlementModal';
import TripKanbanBoard, { TripKanbanBoardRef } from '@/components/trips/kanban/TripKanbanBoard';
import VehiclePreviewModal from '@/components/fleet/VehiclePreviewModal';
import CustomerPreviewModal from '@/components/customers/CustomerPreviewModal';
import ThirdPartyPreviewModal from '@/components/third-party/ThirdPartyPreviewModal';
import DriverPreviewModal from '@/components/drivers/DriverPreviewModal';
import CreateVehicleModal from '@/components/fleet/CreateVehicleModal';
import CreateCustomerModal from '@/components/customers/CreateCustomerModal';
import CreateDriverModal from '@/components/drivers/CreateDriverModal';
import EditVehicleModal from '@/components/fleet/EditVehicleModal';
import EditCustomerModal from '@/components/customers/EditCustomerModal';
import EditThirdPartyModal from '@/components/third-party/EditThirdPartyModal';
import EditDriverModal from '@/components/drivers/EditDriverModal';
import { Combobox } from '@/components/ui/combobox';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';

type ExportStatusGroup = 'All' | 'Completed' | 'InTransit' | 'NotCompleted';

const EXPORT_STATUS_GROUPS: { label: string; value: ExportStatusGroup }[] = [
  { label: 'All Trips', value: 'All' },
  { label: 'Completed / Delivered Only', value: 'Completed' },
  { label: 'In Transit Right Now', value: 'InTransit' },
  { label: 'Not Completed', value: 'NotCompleted' },
];

const matchesExportStatusGroup = (status: TripStatus, group: ExportStatusGroup) => {
  if (group === 'All') return true;
  if (group === 'Completed') return status === 'Completed' || status === 'AtDelivery' || status === 'Invoiced';
  if (group === 'InTransit') return status === 'InTransit';
  if (group === 'NotCompleted') return status !== 'Completed' && status !== 'AtDelivery' && status !== 'Invoiced';
  return true;
};

const TRIP_EXPORT_HEADERS = [
  'ref_id', 'status', 'customer', 'pickup_location', 'stops', 'dropoff_location',
  'driver', 'vehicle', 'rate_category', 'vehicle_type', 'quotation',
  'planned_start', 'actual_start', 'planned_end', 'actual_end',
  'driver_payout', 'additional_charge', 'billing_amount', 'carrier_name'
];

const formatExportDate = (value: string | null, tz: string = 'Asia/Riyadh') => (value ? formatInDeploymentTz(value, tz, 'yyyy-MM-dd') : '');

const getPickupInfo = (trip: Trip) => {
  const pickup = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  if (!pickup) return { name: '—', address: null };
  const name = pickup.location_name || pickup.location?.name || pickup.location_address || pickup.location?.address || (pickup.location_lat ? `${pickup.location_lat.toFixed(3)}, ${pickup.location_lng.toFixed(3)}` : '—');
  const address = (pickup.location_name && (pickup.location_address || pickup.location?.address)) ? (pickup.location_address || pickup.location?.address) : null;
  return { name, address };
};

const getDropoffInfo = (trip: Trip) => {
  const stops = trip.stops || [];
  if (!stops.length) {
    const fallback = trip.rateCard?.route_destination || (trip as any).quotation?.route_destination || (trip as any).route_destination || '—';
    return { name: fallback, address: null };
  }

  const pickupStop = stops.find((s) => s.stop_type === 'Pickup') || stops[0];
  const pickupName = (pickupStop?.location_name || pickupStop?.location?.name || '').toLowerCase().trim();

  const outboundStops = stops.filter((s: any) => ((s as any).leg_index ?? 0) === 0);
  let dropoff = outboundStops.length > 1 ? outboundStops[outboundStops.length - 1] : null;

  if (!dropoff || (outboundStops.length > 1 && (dropoff.location_name || dropoff.location?.name || '').toLowerCase().trim() === pickupName)) {
    const distinctStop = stops.find((s) => {
      const sName = (s.location_name || s.location?.name || '').toLowerCase().trim();
      return sName && sName !== pickupName;
    });
    if (distinctStop) {
      dropoff = distinctStop;
    }
  }

  if (!dropoff && stops.length > 1) dropoff = stops[stops.length - 1];
  if (!dropoff && stops.length > 0) dropoff = stops[0];
  if (!dropoff) return { name: '—', address: null };

  let name = dropoff.location_name || dropoff.location?.name || dropoff.location_address || dropoff.location?.address || (dropoff.location_lat ? `${dropoff.location_lat.toFixed(3)}, ${dropoff.location_lng.toFixed(3)}` : '—');
  name = name.replace(/🔁\s*/g, '').replace(/\[RETURN:.*?\]/gi, '').trim();

  const address = (dropoff.location_name && (dropoff.location_address || dropoff.location?.address)) ? (dropoff.location_address || dropoff.location?.address) : null;
  return { name, address };
};

const TRIP_EXPORT_COLUMNS: ExportColumn<Trip>[] = [
  // --- STANDARD COLUMNS (defaultSelected: true) ---
  { id: 'ref_id', label: 'Job / Ref ID', accessor: (t) => t.ref_id || '' },
  { id: 'status', label: 'Status', accessor: (t) => t.status || '' },
  { id: 'customer', label: 'Customer', accessor: (t) => t.customer?.name || 'Unassigned' },
  { id: 'pickup', label: 'Pickup Location', accessor: (t) => {
      const p = getPickupInfo(t);
      return p.name !== '—' ? p.name.split(/[\[(]/)[0].trim() : '—';
  } },
  { id: 'stops', label: 'Stops', accessor: (t) => (t.stops || []).filter(s => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff').map(s => (s.location_name || s.location?.name || '').split(/[\[(]/)[0].trim() || '—').filter(s => s !== '—').join(', ') || '—' },
  { id: 'dropoff', label: 'Dropoff Location', accessor: (t) => {
      const d = getDropoffInfo(t);
      return d.name !== '—' ? d.name.split(/[\[(]/)[0].trim() : '—';
  } },
  { id: 'driver', label: 'Driver', accessor: (t) => t.is_third_party
      ? (t.third_party_driver_name ? `${t.third_party_driver_name} (${t.thirdPartyProvider?.name || '3PL Carrier'})` : (t.thirdPartyProvider?.name || '3PL Driver'))
      : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned')
  },
  { id: 'vehicle', label: 'Vehicle', accessor: (t) => t.is_third_party
      ? (t.third_party_vehicle_plate || '3PL Vehicle')
      : (t.vehicle?.plate_number || 'Unassigned')
  },
  { id: 'line_type', label: 'Line Type', accessor: (t) => getTripRateCategory(t) },
  { id: 'category', label: 'Vehicle Type', accessor: (t) => t.quotation_vehicle_class || t.financials?.quotation_vehicle_class || t.vehicle_type || getTripPayloadCapacity(t) },
  { id: 'rate_card', label: 'Rate Card', accessor: (t) => t.rateCard?.name || 'Manual Rate' },
  { id: 'planned_start', label: 'Planned Start', accessor: (t) => formatExportDate(t.planned_start) },
  { id: 'actual_start', label: 'Actual Start', accessor: (t) => formatExportDate(t.actual_start) },
  { id: 'planned_end', label: 'Planned End', accessor: (t) => formatExportDate(t.planned_end) },
  { id: 'actual_end', label: 'Actual End', accessor: (t) => formatExportDate(t.actual_end) },
  { id: 'driver_payout', label: 'Trip Charge Per Day', accessor: (t) => Number(t.driver_payout || t.trip_charges || 0) },
  { id: 'additional_charge', label: 'Additional Charge', accessor: (t) => Number((t.charges || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0)) },
  { id: 'billing_amount', label: 'Billing Amount', accessor: (t) => Number(t.billing_amount || t.rateCard?.base_price || 0) },
  { id: 'carrier', label: 'Carrier / Provider', accessor: (t) => t.is_third_party
      ? (t.thirdPartyProvider?.name || t.carrier_name || '3PL Provider')
      : (t.carrier_name || 'MERCON LOGISTICS')
  },

  // --- JD MONTHLY SPECIFIC COLUMNS (defaultSelected: false) ---
  { id: 'jd_sl', label: 'S/L', accessor: (_, index) => index + 1, defaultSelected: false },
  { id: 'jd_date', label: 'DATE', accessor: (t) => formatExportDate(t.planned_start), defaultSelected: false },
  { id: 'jd_job', label: 'JOB #', accessor: (t) => t.ref_id || '', defaultSelected: false },
  { id: 'jd_driver', label: 'DRIVER NAME', accessor: (t) => t.is_third_party
      ? (t.third_party_driver_name ? `${t.third_party_driver_name} (${t.thirdPartyProvider?.name || '3PL Carrier'})` : (t.thirdPartyProvider?.name || '3PL Driver'))
      : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned'), defaultSelected: false },
  { id: 'jd_vehicle', label: 'VEHICLE NO:', accessor: (t) => t.is_third_party
      ? (t.third_party_vehicle_plate || '3PL Vehicle')
      : (t.vehicle?.plate_number || 'Unassigned'), defaultSelected: false },
  { id: 'jd_vehicle_type', label: 'VEHICLE TYPE', accessor: (t) => t.quotation_vehicle_class || t.financials?.quotation_vehicle_class || t.vehicle_type || getTripPayloadCapacity(t), defaultSelected: false },
  { id: 'jd_mobile', label: 'MOBILE NUMBER', accessor: (t) => t.driver?.phone_primary || t.third_party_driver_phone || '—', defaultSelected: false },
  { id: 'jd_provider', label: 'MERCON OR 3RD PARTY', accessor: (t) => t.is_third_party ? '3rd Party' : 'MERCON', defaultSelected: false },
  { id: 'jd_customer', label: 'SENDER/CUSTOMER', accessor: (t) => t.customer?.name || 'Unassigned', defaultSelected: false },
  { id: 'jd_receiver', label: 'RECEIVER', accessor: (t) => {
      const d = getDropoffInfo(t);
      return d.name !== '—' ? d.name.split(/[\[(]/)[0].trim() : '—';
  }, defaultSelected: false },
  { id: 'jd_waiting', label: 'WAITING/LABOR CHARGES', accessor: (t) => Number((t.charges || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0)), defaultSelected: false },
  { id: 'jd_stops', label: 'ADDITIONAL STOPS', accessor: (t) => (t.stops || []).filter(s => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff').map(s => (s.location_name || s.location?.name || '').split(/[\[(]/)[0].trim() || '—').filter(s => s !== '—').join(', ') || '—', defaultSelected: false },
  { id: 'jd_billing', label: 'BILLING AMOUNT', accessor: (t) => Number(t.billing_amount || t.rateCard?.base_price || 0), defaultSelected: false },
  { id: 'jd_total', label: 'TOTAL AMOUNT', accessor: (t) => {
      const base = Number(t.billing_amount || t.rateCard?.base_price || 0);
      const additional = Number((t.charges || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0));
      return base + additional;
  }, defaultSelected: false },
  { id: 'jd_trip_charge', label: 'TRIP CHARGES', accessor: (t) => Number(t.driver_payout || t.trip_charges || 0), defaultSelected: false },
  { id: 'jd_balance', label: 'BALANCE AMOUNT', accessor: (t) => {
      const base = Number(t.billing_amount || t.rateCard?.base_price || 0);
      const additional = Number((t.charges || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0));
      const total = base + additional;
      const tripCharge = Number(t.driver_payout || t.trip_charges || 0);
      return total - tripCharge;
  }, defaultSelected: false },
  { id: 'jd_company', label: 'COMPANY NAME', accessor: (t) => t.carrier_name || 'MERCON LOGISTICS', defaultSelected: false },
];


/**
 * Normalises a place or search string for tolerant phonetic matching:
 * handles Arabic/English transliterations (e.g. "dhamam" -> "dammam", "al-dammam" -> "dammam").
 */
const normalisePlace = (s: string) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/^al[\s-]+|^ad[\s-]+|^ar[\s-]+|^ash[\s-]+|^an[\s-]+/g, '')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/[^a-z0-9]/g, '');

const ROUTE_CONNECTOR_SET = new Set(['to', 'from', 'via', 'ret', 'return', '-', '->', '>', ',']);

/**
 * Calculates a search relevance score for a trip given the user's query.
 * 
 * Key Ordering Rules:
 * 1. Searching a single city (e.g. "dammam"):
 *    - Trips starting from Dammam (Pickup / Origin location) appear FIRST (top priority score: +5000).
 *    - Trips ending in Dammam (Dropoff / Destination location) appear after Origin matches (score: +1500).
 * 2. Searching a route or city pair (e.g. "dammam to BURAIDAH", "dammam - BURAIDAH", "dammam BURAIDAH"):
 *    - Trips going from Dammam -> Buraidah (Origin = Dammam, Destination = Buraidah) appear FIRST (+10,000 pts).
 *    - Reverse direction trips (Buraidah -> Dammam) appear lower (+3,000 pts).
 */
const computeTripSearchRelevance = (trip: Trip, search: string): number => {
  if (!search || !search.trim()) return 0;
  const rawQuery = search.trim().toLowerCase();
  const normQuery = normalisePlace(rawQuery);

  // Extract location tokens (filtering connector words like 'to', 'from', 'via', '-')
  const rawTokens = rawQuery.split(/\s+/).filter(Boolean);
  const locationTokens = rawTokens.filter(t => !ROUTE_CONNECTOR_SET.has(t));
  const effectiveTokens = locationTokens.length > 0 ? locationTokens : rawTokens;

  let score = 0;

  // Extract Pickup Info (Origin)
  const pickup = getPickupInfo(trip);
  const pickupStop = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  const pickupTexts = [
    pickup.name,
    pickup.address,
    pickupStop?.location_name,
    pickupStop?.location_address,
    pickupStop?.location?.name,
    pickupStop?.location?.city,
    pickupStop?.location?.state,
  ].filter(Boolean) as string[];

  // Extract Dropoff Info (Destination)
  const dropoff = getDropoffInfo(trip);
  const dropoffStop = (trip.stops && trip.stops.length > 1) ? trip.stops[trip.stops.length - 1] : (trip.stops?.find((s) => s.stop_type === 'Dropoff'));
  const dropoffTexts = [
    dropoff.name,
    dropoff.address,
    dropoffStop?.location_name,
    dropoffStop?.location_address,
    dropoffStop?.location?.name,
    dropoffStop?.location?.city,
    dropoffStop?.location?.state,
  ].filter(Boolean) as string[];

  // Extract Rate Card / Route Name
  const rateCardName = trip.rateCard?.name || (trip as any).route_name || '';

  const matchesTexts = (texts: string[], token: string): boolean => {
    const normTok = normalisePlace(token);
    return texts.some((text) => {
      const lower = text.toLowerCase();
      const norm = normalisePlace(text);
      return lower.includes(token) || (normTok && norm.includes(normTok));
    });
  };

  const startsWithTexts = (texts: string[], token: string): boolean => {
    const normTok = normalisePlace(token);
    return texts.some((text) => {
      const lower = text.toLowerCase();
      const norm = normalisePlace(text);
      return lower.startsWith(token) || (normTok && norm.startsWith(normTok));
    });
  };

  // 1. Route Pair Match (e.g., "dammam to BURAIDAH", "dammam - BURAIDAH")
  if (locationTokens.length >= 2) {
    const originTerm = locationTokens[0];
    const destTerm = locationTokens[1];

    const pickupMatchesOrigin = matchesTexts(pickupTexts, originTerm) || (rateCardName && matchesTexts([rateCardName.split(/[-–>]/)[0] || ''], originTerm));
    const dropoffMatchesDest = matchesTexts(dropoffTexts, destTerm) || (rateCardName && matchesTexts([rateCardName.split(/[-–>]/).slice(1).join(' ') || ''], destTerm));

    const pickupMatchesDest = matchesTexts(pickupTexts, destTerm);
    const dropoffMatchesOrigin = matchesTexts(dropoffTexts, originTerm);

    if (pickupMatchesOrigin && dropoffMatchesDest) {
      // Direct Route Match: Origin = dammam, Dest = buraidah (HIGHEST PRIORITY)
      score += 10000;
    } else if (pickupMatchesDest && dropoffMatchesOrigin) {
      // Reverse Route Match
      score += 3000;
    } else if (pickupMatchesOrigin) {
      score += 2000;
    } else if (dropoffMatchesDest) {
      score += 1500;
    }
  }

  // 2. Single Location / General Token Evaluation (e.g., "dammam")
  const primaryTerm = effectiveTokens[0] || rawQuery;

  // Origin / Pickup location matches (TOP PRIORITY for single place search)
  const pickupMatched = effectiveTokens.every(tok => matchesTexts(pickupTexts, tok));
  if (pickupMatched) {
    score += 5000; // Top score for Origin match!

    if (startsWithTexts(pickupTexts, primaryTerm)) {
      score += 1000; // Extra bonus if pickup name starts with search term
    }

    if (['InTransit', 'AtPickup', 'Dispatched', 'AtDelivery'].includes(trip.status)) {
      score += 300; // Active vehicle bonus
    }
  }

  // Rate card / Route Name origin bonus
  if (rateCardName) {
    const lowerRc = rateCardName.toLowerCase();
    const normRc = normalisePlace(rateCardName);
    if (lowerRc.includes(primaryTerm) || (normQuery && normRc.includes(normQuery))) {
      score += 800;
      if (lowerRc.startsWith(primaryTerm) || (normQuery && normRc.startsWith(normQuery))) {
        score += 1200;
      }
    }
  }

  // Destination / Dropoff location matches
  const dropoffMatched = effectiveTokens.every(tok => matchesTexts(dropoffTexts, tok));
  if (dropoffMatched) {
    score += 1500; // Dropoff match is ranked below Origin match
    if (startsWithTexts(dropoffTexts, primaryTerm)) {
      score += 300;
    }
  }

  // Other stops (intermediate waypoints)
  const otherStops = (trip.stops || []).filter(s => s !== pickupStop && s !== dropoffStop);
  const otherMatched = otherStops.some(s => {
    const texts = [s.location_name, s.location_address, s.location?.name, s.location?.city].filter(Boolean) as string[];
    return effectiveTokens.every(tok => matchesTexts(texts, tok));
  });
  if (otherMatched) {
    score += 500;
  }

  // Driver Name or Vehicle Plate Match
  const driverName = trip.is_third_party
    ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '')
    : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name} ${trip.driver.ref_id || ''}` : '');
  const vehiclePlate = trip.is_third_party
    ? (trip.third_party_vehicle_plate || '')
    : (trip.vehicle ? `${trip.vehicle.plate_number} ${trip.vehicle.ref_id || ''}` : '');

  if (effectiveTokens.every(tok => driverName.toLowerCase().includes(tok))) {
    score += 1500;
  }
  if (effectiveTokens.every(tok => vehiclePlate.toLowerCase().includes(tok))) {
    score += 1500;
  }

  // Trip Ref ID or Customer Name
  if (trip.ref_id && trip.ref_id.toLowerCase().includes(rawQuery)) {
    score += 8000;
  }
  if (trip.customer?.name && effectiveTokens.every(tok => trip.customer!.name.toLowerCase().includes(tok))) {
    score += 1200;
  }

  return score;
};

const tripsToExportRows = (trips: Trip[], tz: string = 'Asia/Riyadh') => trips.map(t => {
  const pickup = getPickupInfo(t);
  const dropoff = getDropoffInfo(t);
  const driverLabel = t.is_third_party
    ? (t.third_party_driver_name ? `${t.third_party_driver_name} (${t.thirdPartyProvider?.name || '3PL Carrier'})` : (t.thirdPartyProvider?.name || '3PL Driver'))
    : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned');
  const vehicleLabel = t.is_third_party
    ? (t.third_party_vehicle_plate || '3PL Vehicle')
    : (t.vehicle?.plate_number || 'Unassigned');
  const carrierLabel = t.is_third_party
    ? (t.thirdPartyProvider?.name || t.carrier_name || '3PL Provider')
    : (t.carrier_name || 'MERCON LOGISTICS');

  return [
    t.ref_id,
    t.status,
    t.customer?.name || 'Unassigned',
    pickup.name !== '—' ? pickup.name.split(/[\[(]/)[0].trim() : '—',
    (t.stops || []).filter(s => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff').map(s => (s.location_name || s.location?.name || '').split(/[\[(]/)[0].trim() || '—').filter(s => s !== '—').join(', ') || '—',
    dropoff.name !== '—' ? dropoff.name.split(/[\[(]/)[0].trim() : '—',
    driverLabel,
    vehicleLabel,
    getTripRateCategory(t),
    getTripPayloadCapacity(t),
    t.rateCard?.name || 'Manual Rate',
    formatExportDate(t.planned_start, tz),
    formatExportDate(t.actual_start, tz),
    formatExportDate(t.planned_end, tz),
    formatExportDate(t.actual_end, tz),
    Number(t.driver_payout || t.trip_charges || 0),
    Number((t.charges || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0)),
    Number(t.billing_amount || t.rateCard?.base_price || 0),
    carrierLabel,
  ];
});

const tripsToExportRowsWithTotals = (trips: Trip[], tz: string = 'Asia/Riyadh') => {
  const rows = tripsToExportRows(trips, tz);
  if (!trips.length) return rows;
  const totalCharges = trips.reduce((sum, t) => sum + Number(t.trip_charges || 0), 0);
  const totalBilling = trips.reduce((sum, t) => sum + Number(t.billing_amount || t.rateCard?.base_price || 0), 0);
  const totalsRow = [
    'TOTALS',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totalCharges,
    totalBilling,
    '',
  ];
  return [...rows, totalsRow];
};

type TripStatusFilter = TripStatus | 'All' | 'Active' | 'Issues' | 'Completed,Invoiced';

const STATUS_TABS: { label: string; value: TripStatusFilter }[] = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Completed', value: 'Completed,Invoiced' },
  { label: 'Issues', value: 'Issues' },
];

const STATUS_LABELS: Record<string, string> = {
  All: 'All Statuses',
  Active: 'Active',
  Draft: 'Draft',
  Scheduled: 'Scheduled',
  Dispatched: 'Dispatched',
  Loading: 'Loading',
  AtPickup: 'Loading',
  InTransit: 'In Transit',
  Delayed: 'Delayed',
  AtDelivery: 'At Delivery',
  Completed: 'Completed',
  Invoiced: 'Invoiced',
  Cancelled: 'Cancelled',
};

const EXACT_SERVER_STATUSES = new Set<TripStatusFilter>([
  'Draft',
  'Scheduled',
  'Loading',
  'InTransit',
  'Delayed',
  'Completed',
  'Invoiced',
  'Cancelled',
  'Dispatched',
  'AtPickup',
  'AtDelivery',
]);

const getServerStatusFilter = (status: TripStatusFilter) => (
  EXACT_SERVER_STATUSES.has(status) ? status : undefined
);

const matchesTripStatusFilter = (trip: Trip, filter: TripStatusFilter) => {
  if (filter === 'All') return true;
  if (filter === 'Active') {
    return ['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Dispatched', 'AtPickup', 'AtDelivery'].includes(trip.status);
  }
  if (filter === 'Scheduled' || filter === 'Draft') {
    return trip.status === 'Scheduled' || trip.status === 'Draft' || trip.status === 'Dispatched';
  }
  if (filter === 'Loading' || filter === 'AtPickup') {
    return trip.status === 'Loading' || trip.status === 'AtPickup';
  }
  if (filter === 'Completed' || filter === 'Completed,Invoiced') {
    return trip.status === 'Completed' || trip.status === 'AtDelivery' || trip.status === 'Invoiced';
  }
  if (filter === 'Issues') return trip.status === 'Cancelled' || trip.status === 'Delayed';
  return trip.status === filter;
};

/**
 * Mirrors `ALLOWED_TRANSITIONS` in `backend/api-server/src/services/tripLifecycle.ts`
 * — the backend is the source of truth and re-checks this on every request, but
 * without a client-side copy the kanban board lets an operator drag a card
 * anywhere and only finds out it was rejected after a round-trip 400. Keep the
 * two in sync when the backend graph changes.
 *
 * A status missing from this map (a legacy value like 'Dispatched'/'AtPickup'
 * that predates the current TripStatus enum, or a value this map hasn't been
 * taught about yet) allows every transition — failing open, so an unrecognized
 * status blocks nothing and the backend remains the real gate either way.
 */
const KANBAN_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Scheduled', 'Loading', 'InTransit', 'Cancelled'],
  Scheduled: ['Draft', 'Loading', 'InTransit', 'Delayed', 'Cancelled'],
  Loading: ['Draft', 'Scheduled', 'InTransit', 'Delayed', 'Cancelled'],
  InTransit: ['Draft', 'Scheduled', 'Loading', 'Delayed', 'Completed', 'Cancelled'],
  Delayed: ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Completed', 'Cancelled'],
  Completed: ['Invoiced', 'InTransit', 'Loading', 'Scheduled'],
  Invoiced: ['Completed'],
  Cancelled: ['Draft', 'Scheduled'],
};

const isKanbanTransitionAllowed = (from: string, to: string): boolean => {
  if (from === to) return true;
  const allowed = KANBAN_ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : true;
};

export default function TripListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const viewMode = searchParams.get('view') === 'kanban' ? 'kanban' : 'table';
  const setViewMode = (mode: 'table' | 'kanban') => {
    const newParams = new URLSearchParams(searchParams);
    if (mode === 'kanban') {
      newParams.set('view', 'kanban');
    } else {
      newParams.delete('view');
      newParams.delete('stage');
    }
    setSearchParams(newParams, { replace: true });
  };

  const stageParam = searchParams.get('stage');
  const handleStageFocusChange = (stage: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (stage) {
      newParams.set('stage', stage);
    } else {
      newParams.delete('stage');
    }
    setSearchParams(newParams, { replace: true });
  };

  const [localTripOverrides, setLocalTripOverrides] = useState<Record<string, TripStatus>>({});
  const kanbanBoardRef = useRef<TripKanbanBoardRef>(null);

  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    isOpen: boolean;
    trip: Trip | null;
    targetStatus: TripStatus | string | null;
    title: string;
    message: string;
    confirmLabel: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    trip: null,
    targetStatus: null,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    isLoading: false,
  });

  const [settlementModalTrip, setSettlementModalTrip] = useState<Trip | null>(null);

  const handleKanbanStatusChange = (trip: Trip, targetStatus: TripStatus | string) => {
    if (trip.status === targetStatus) return;

    if (!isKanbanTransitionAllowed(trip.status, String(targetStatus))) {
      toast.error(`Can't move ${trip.ref_id || 'this trip'} straight to ${targetStatus}`, {
        description: `It's currently ${trip.status} — move it through the stages in between first.`,
      });
      return;
    }

    const driverFirstName =
      trip.driver?.first_name ||
      (trip.third_party_driver_name ? trip.third_party_driver_name.split(' ')[0] : '') ||
      (trip.driver ? `${trip.driver.first_name}` : 'the driver');

    const ref = trip.ref_id || 'Draft';

    let title = 'Confirm Status Change';
    let message = `Are you sure you want to change status of trip ${ref} (${driverFirstName}) to ${targetStatus}?`;
    let confirmLabel = 'Confirm Status Change';

    const statusStr = String(targetStatus);

    if (statusStr === 'Completed') {
      title = 'Confirm Trip Completion';
      message = `Did ${driverFirstName} complete trip ${ref}?`;
      confirmLabel = 'Yes, Trip Completed';
    } else if (statusStr === 'Delayed') {
      title = 'Confirm Trip Delay';
      message = `Was ${driverFirstName} delayed on trip ${ref}?`;
      confirmLabel = 'Yes, Mark Delayed';
    } else if (statusStr === 'InTransit') {
      title = 'Confirm In-Transit Status';
      message = `Did ${driverFirstName} start transit for trip ${ref}?`;
      confirmLabel = 'Yes, Mark In Transit';
    } else if (statusStr === 'AtPickup') {
      title = 'Confirm Loading / At Pickup';
      message = `Has ${driverFirstName} arrived at pickup for trip ${ref}?`;
      confirmLabel = 'Yes, Arrived at Pickup';
    } else if (statusStr === 'Draft') {
      title = 'Confirm Revert to Scheduled';
      message = `Revert trip ${ref} for ${driverFirstName} to Scheduled?`;
      confirmLabel = 'Yes, Revert Status';
    } else if (statusStr === 'Emergency') {
      title = 'Confirm Emergency Status';
      message = `Report emergency status for ${driverFirstName} on trip ${ref}?`;
      confirmLabel = 'Report Emergency';
    }

    setStatusConfirmModal({
      isOpen: true,
      trip,
      targetStatus,
      title,
      message,
      confirmLabel,
      isLoading: false,
    });
  };

  const handleConfirmKanbanStatusChange = async () => {
    if (!statusConfirmModal.trip || !statusConfirmModal.targetStatus) return;
    const { trip, targetStatus } = statusConfirmModal;

    try {
      setStatusConfirmModal((prev) => ({ ...prev, isLoading: true }));
      setLocalTripOverrides((prev) => ({ ...prev, [trip.id]: targetStatus as TripStatus }));

      const updated = await tripService.updateStatus(trip.id, targetStatus as TripStatus);

      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      await queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['trips-kpi-period'] });
      await refetch();
      toast.success(`Updated ${trip.ref_id} status to ${targetStatus}`);

      setStatusConfirmModal({
        isOpen: false,
        trip: null,
        targetStatus: null,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        isLoading: false,
      });

      if (targetStatus === 'Completed') {
        setSettlementModalTrip(updated || { ...trip, status: 'Completed' });
      }
    } catch (e: any) {
      // Revert the local override on error so the card snaps back to its correct column
      setLocalTripOverrides((prev) => {
        const next = { ...prev };
        delete next[trip.id];
        return next;
      });
      // Surface the backend's actual reason (e.g. "not allowed from the
      // trip's current state") instead of a generic message — the client-side
      // transition guard above catches the common case, but the backend is
      // still the real authority and can reject for reasons this page
      // doesn't model (a driver/vehicle conflict, a missing assignment).
      const reason = e?.response?.data?.error?.message;
      toast.error(`Failed to update status for ${trip.ref_id}`, reason ? { description: reason } : undefined);
      setStatusConfirmModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Auto-enter full screen when opening the Trips page (list or kanban view), exit when leaving it
  useEffect(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Legacy `?new=true` deep link (old modal flow) — redirect to the full page.
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      navigate('/trips/new', { replace: true });
    }
  }, [searchParams, navigate]);

  // Deep-link support: ?driver=UUID&driver_name=... or ?search=PlateNumber pre-fills search & switches to table view
  // ?status=X pre-selects the status filter
  // Run once on mount (searchParams is stable on initial render)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTripsResetKey, setTotalTripsResetKey] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState<TripStatusFilter>('All');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('All');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('3Days');
  const activeFiltersCount = (selectedStatus !== 'All' ? 1 : 0) + (selectedCustomerId !== 'All' ? 1 : 0) + (selectedDriverId !== 'All' ? 1 : 0);

  useEffect(() => {
    const driverParam = searchParams.get('driver') || searchParams.get('driver_id');
    const driverNameParam = searchParams.get('driver_name');
    const searchParam = searchParams.get('search') || searchParams.get('vehicle') || searchParams.get('vehicle_name') || searchParams.get('plate_number');
    const statusParam = searchParams.get('status') as TripStatusFilter | null;

    if (statusParam && EXACT_SERVER_STATUSES.has(statusParam as any)) {
      setSelectedStatus(statusParam);
    }

    if (driverParam || driverNameParam) {
      // Switch to table view and show ALL trips of that driver across all time
      if (driverParam) {
        setSelectedDriverId(driverParam);
      } else if (driverNameParam) {
        setSearch(driverNameParam);
      }
      setDateFilter('All');
      const newParams = new URLSearchParams(searchParams);
      newParams.set('view', 'table');
      newParams.delete('driver');
      newParams.delete('driver_id');
      newParams.delete('driver_name');
      newParams.delete('status');
      setSearchParams(newParams, { replace: true });
    } else if (searchParam) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('view', 'table');
      newParams.delete('search');
      newParams.delete('vehicle');
      newParams.delete('vehicle_name');
      newParams.delete('plate_number');
      newParams.delete('status');
      setSearchParams(newParams, { replace: true });
      setSearch(searchParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [kpiPeriod, setKpiPeriod] = useState<DateFilterType>('Today');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortOption, setSortOption] = useState<
    'latest' | 'oldest' | 'price_desc' | 'price_asc' | 'ref_id_asc' | 'ref_id_desc' | 'customer_asc' | 'status'
  >('latest');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [statusDialogTrip, setStatusDialogTrip] = useState<Trip | null>(null);
  const [newStatus, setNewStatus] = useState<TripStatus>('Dispatched');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [previewVehicle, setPreviewVehicle] = useState<any | null>(null);
  const [previewCustomer, setPreviewCustomer] = useState<any | null>(null);
  const [previewThirdParty, setPreviewThirdParty] = useState<any | null>(null);
  const [previewDriver, setPreviewDriver] = useState<any | null>(null);

  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [editCustomer, setEditCustomer] = useState<any | null>(null);
  const [editThirdParty, setEditThirdParty] = useState<any | null>(null);
  const [editDriver, setEditDriver] = useState<any | null>(null);

  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [isCreateDriverOpen, setIsCreateDriverOpen] = useState(false);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | 'csv'>('excel');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStatusGroup, setExportStatusGroup] = useState<ExportStatusGroup>('All');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isCustomExportOpen, setIsCustomExportOpen] = useState(false);
  const [customExportFormat, setCustomExportFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [selectedTripsForExport, setSelectedTripsForExport] = useState<Trip[]>([]);

   const { data: exportDriversRes } = useQuery({
     queryKey: ['drivers-for-export'],
     queryFn: () => driverService.getAll({ per_page: 500, mode: 'lookup' }),
     enabled: exportMenuOpen || isCustomExportOpen,
   });
   const { data: exportVehiclesRes } = useQuery({
     queryKey: ['vehicles-for-export'],
     queryFn: () => vehicleService.getAll({ per_page: 500, mode: 'lookup' }),
     enabled: exportMenuOpen || isCustomExportOpen,
   });
  const exportDrivers = exportDriversRes?.data || [];
  const exportVehicles = exportVehiclesRes?.data || [];

  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Bulk Excel/CSV import — extracted to useTripBulkImport
  const {
    importDialogOpen,
    setImportDialogOpen,
    importFileName,
    importRows,
    importParseError,
    isImporting,
    importResult,
    driverMappings,
    setDriverMappings,
    activeImportDrivers,
    activeImportVehicles,
    pastDateModalOpen,
    setPastDateModalOpen,
    pastDateAnalysis,
    handleImportFileChange,
    handleConfirmImport,
    handlePastDateImportConfirm,
    resetImportDialog,
  } = useTripBulkImport();

  // WhatsApp Share Dialog — extracted to useTripWhatsAppShare
  const {
    whatsappDialogOpen,
    setWhatsappDialogOpen,
    whatsappSelectedTrips,
    whatsappRecipientType,
    setWhatsappRecipientType,
    whatsappCustomPhone,
    setWhatsappCustomPhone,
    whatsappMessageText,
    setWhatsappMessageText,
    whatsappWithTailgate,
    setWhatsappWithTailgate,
    openWhatsappShare,
    handleWhatsappSend,
  } = useTripWhatsAppShare();

  const startDateStr = dateFilter === '3Days'
    ? format(subDays(new Date(), 1), 'yyyy-MM-dd')
    : (dateFilter === 'Custom' && customDateRange?.from
      ? format(customDateRange.from, 'yyyy-MM-dd')
      : undefined);
  const endDateStr = dateFilter === '3Days'
    ? format(addDays(new Date(), 1), 'yyyy-MM-dd')
    : (dateFilter === 'Custom' && customDateRange?.to
      ? format(customDateRange.to, 'yyyy-MM-dd')
      : (dateFilter === 'Custom' && customDateRange?.from ? format(customDateRange.from, 'yyyy-MM-dd') : undefined));

  // Fetch trips using React Query with server-side pagination (10 trips default, 30s polling).
  const { data: tripsRes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trips', selectedStatus, selectedCustomerId, selectedDriverId, dateFilter, startDateStr, endDateStr, currentPage, pageSize, debouncedSearch],
    queryFn: () => tripService.getAll({
      status: getServerStatusFilter(selectedStatus) as any,
      customer_id: selectedCustomerId !== 'All' ? selectedCustomerId : undefined,
      driver_id: selectedDriverId !== 'All' ? selectedDriverId : undefined,
      date_filter: dateFilter === 'All' || dateFilter === 'Custom' ? undefined : dateFilter,
      start_date: startDateStr,
      end_date: endDateStr,
      search: debouncedSearch || undefined,
      page: currentPage,
      per_page: pageSize,
    }),
    // Keep the previous rows on screen while a new search/page loads.
    placeholderData: keepPreviousData,
    // Always fetch fresh data when this page mounts.
    refetchOnMount: true,
    // Auto-poll every 30s for smooth background status updates
    refetchInterval: 30000,
  });

  // The unfiltered trip ledger, for the export sheet. Despite the old name this
  // no longer feeds any KPI card — those read the main query — so fetching 1000
  // trips (each with its stops, driver, vehicle, customer and rate card) on
  // every mount of this page bought nothing until someone opened the export.
  const { data: allTripsRes, isError: isKpiSummaryError, refetch: refetchKpiSummary } = useQuery({
    queryKey: ['trips-export-all'],
    queryFn: () => tripService.getAll({ per_page: 1000 }),
    enabled: isCustomExportOpen,
  });

  // Dynamic title and description for the period KPI card
  const kpiTitle = useMemo(() => {
    if (kpiPeriod === 'ThisWeek') return "THIS WEEK'S TRIPS";
    if (kpiPeriod === 'ThisMonth') return "THIS MONTH'S TRIPS";
    return "TODAY'S TRIPS";
  }, [kpiPeriod]);

  const kpiDescription = useMemo(() => {
    if (kpiPeriod === 'ThisWeek') return "Scheduled or created this week";
    if (kpiPeriod === 'ThisMonth') return "Scheduled or created this month";
    return "Scheduled or created today";
  }, [kpiPeriod]);

  // Surface a toast when the export ledger fails/times out instead of silently
  // handing the export sheet an empty "all trips" set — indistinguishable from
  // "no trips", and easy to mistake for a real gap on a slow connection.
  useEffect(() => {
    if (isKpiSummaryError) {
      toast.error('The full trip ledger failed to load', {
        description: 'Exporting "all trips" may be incomplete. This can happen on a slow connection.',
        action: { label: 'Retry', onClick: () => { refetchKpiSummary(); } },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKpiSummaryError]);

  const rawTrips: Trip[] = useMemo(() => {
    const dbTrips = tripsRes?.data ?? [];
    let list: Trip[] = [...dbTrips];

    if (Object.keys(localTripOverrides).length > 0) {
      list = list.map((t) => (localTripOverrides[t.id] ? { ...t, status: localTripOverrides[t.id] } : t));
    }
    return list;
  }, [tripsRes?.data, localTripOverrides]);

  const { data: customerLookupRes } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => customerService.getAll({ per_page: 200, mode: 'lookup' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: driverLookupRes } = useQuery({
    queryKey: ['drivers-lookup'],
    queryFn: () => driverService.getAll({ per_page: 200, mode: 'lookup' }),
    staleTime: 5 * 60 * 1000,
  });

  const driverFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    const masterList = driverLookupRes?.data || [];
    masterList.forEach((d) => {
      if (d.id) {
        map.set(d.id, `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Driver');
      }
    });
    rawTrips.forEach((t) => {
      if (t.driver?.id) {
        map.set(t.driver.id, `${t.driver.first_name || ''} ${t.driver.last_name || ''}`.trim());
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [driverLookupRes?.data, rawTrips]);

  const customerFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    const masterList = customerLookupRes?.data || [];
    masterList.forEach((c) => {
      if (c.id && c.name) {
        map.set(c.id, c.name);
      }
    });
    rawTrips.forEach((t) => {
      if (t.customer?.id && t.customer?.name) {
        map.set(t.customer.id, t.customer.name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customerLookupRes?.data, rawTrips]);

  const companyOptions = useMemo(() => {
    const icon = <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
    const opts = [{ value: 'All', label: 'All Companies', icon }];
    customerFilterOptions.forEach((c) => {
      opts.push({ value: c.id, label: c.name, icon });
    });
    return opts;
  }, [customerFilterOptions]);

  const tripExportFilters = useMemo(() => {
    const filters: ExportFilter<Trip>[] = [
      {
        id: 'status_group',
        label: 'Status Group',
        options: [
          { label: 'All Trips', value: 'All' },
          { label: 'Completed / Delivered Only', value: 'Completed' },
          { label: 'In Transit Right Now', value: 'InTransit' },
          { label: 'Not Completed', value: 'NotCompleted' },
        ],
        filterFn: (t, val) => matchesExportStatusGroup(t.status, val as ExportStatusGroup),
      },
      {
        id: 'is_3pl',
        label: 'Provider Type',
        options: [
          { label: 'All Providers', value: 'All' },
          { label: 'MERCON Fleet Only', value: 'Mercon' },
          { label: 'Third-Party (3PL) Only', value: '3PL' },
        ],
        filterFn: (t, val) => {
          if (val === 'All') return true;
          const is3PL = !!(t.is_third_party || t.thirdPartyProviderId || (t.carrier_name && t.carrier_name !== 'MERCON LOGISTICS'));
          return val === '3PL' ? is3PL : !is3PL;
        },
      },
      {
        id: 'driver',
        label: 'Driver',
        options: [
          { label: 'All Drivers', value: 'All' },
          ...exportDrivers.map((d) => ({
            label: `${d.first_name} ${d.last_name}`,
            value: d.id,
          })),
        ],
        filterFn: (t, val) => {
          if (val === 'All') return true;
          return t.driver?.id === val;
        },
      },
      {
        id: 'vehicle',
        label: 'Vehicle',
        options: [
          { label: 'All Vehicles', value: 'All' },
          ...exportVehicles.map((v) => ({
            label: v.plate_number,
            value: v.id,
          })),
        ],
        filterFn: (t, val) => {
          if (val === 'All') return true;
          return t.vehicle?.id === val;
        },
      },
      {
        id: 'customer',
        label: 'Customer / Company',
        options: [
          { label: 'All Companies', value: 'All' },
          ...customerFilterOptions.map((c) => ({
            label: c.name,
            value: c.id,
          })),
        ],
        filterFn: (t, val) => {
          if (val === 'All') return true;
          return t.customer?.id === val;
        },
      },
    ];
    return filters;
  }, [exportDrivers, exportVehicles, customerFilterOptions]);



  // Ordered by search relevance when a search is active (e.g. origin/pickup matching trips first),
  // otherwise ordered purely by when the trip was created/entered, newest first by default.
  const trips = useMemo(() => {
    let filtered = rawTrips.filter(t => matchesTripStatusFilter(t, selectedStatus));
    if (selectedCustomerId !== 'All') {
      filtered = filtered.filter(t => t.customer?.id === selectedCustomerId);
    }
    if (selectedDriverId !== 'All') {
      filtered = filtered.filter(t => t.driver?.id === selectedDriverId || (t as any).driver_id === selectedDriverId);
    }
    if (debouncedSearch && debouncedSearch.trim()) {
      filtered = filtered.filter(t => computeTripSearchRelevance(t, debouncedSearch) > 0);
    }
    return filtered.sort((a, b) => {
      if (debouncedSearch && debouncedSearch.trim()) {
        const scoreA = computeTripSearchRelevance(a, debouncedSearch);
        const scoreB = computeTripSearchRelevance(b, debouncedSearch);
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Higher score (e.g. started at location) appears first!
        }
      }

      if (sortOption === 'oldest') {
        const timeA = new Date(a.createdAt || (a as any).created_at || a.planned_start || 0).getTime();
        const timeB = new Date(b.createdAt || (b as any).created_at || a.planned_start || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
      } else if (sortOption === 'price_desc') {
        const pA = a.billing_amount ?? a.trip_charges ?? a.rateCard?.base_price ?? 0;
        const pB = b.billing_amount ?? b.trip_charges ?? b.rateCard?.base_price ?? 0;
        if (pA !== pB) return pB - pA;
      } else if (sortOption === 'price_asc') {
        const pA = a.billing_amount ?? a.trip_charges ?? a.rateCard?.base_price ?? 0;
        const pB = b.billing_amount ?? b.trip_charges ?? b.rateCard?.base_price ?? 0;
        if (pA !== pB) return pA - pB;
      } else if (sortOption === 'ref_id_asc') {
        return (a.ref_id || a.id || '').localeCompare(b.ref_id || b.id || '', undefined, { numeric: true });
      } else if (sortOption === 'ref_id_desc') {
        return (b.ref_id || b.id || '').localeCompare(a.ref_id || a.id || '', undefined, { numeric: true });
      } else if (sortOption === 'customer_asc') {
        const cA = a.customer?.name || '';
        const cB = b.customer?.name || '';
        if (cA !== cB) return cA.localeCompare(cB);
      } else if (sortOption === 'status') {
        return (a.status || '').localeCompare(b.status || '');
      } else {
        // default 'latest'
        const timeA = new Date(a.createdAt || (a as any).created_at || a.planned_start || 0).getTime();
        const timeB = new Date(b.createdAt || (b as any).created_at || b.planned_start || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
      }

      return (b.ref_id || b.id || '').localeCompare(a.ref_id || a.id || '');
    });
  }, [rawTrips, selectedStatus, sortOption, debouncedSearch, selectedCustomerId]);

  // Fixed fleet-wide totals for KPI cards (do NOT change when table is filtered or searched)
  const kpiTrips = useMemo(() => {
    return rawTrips;
  }, [rawTrips]);
  const totalCount = kpiTrips.length;

  const inTransitTrips = kpiTrips.filter(t => t.status === 'InTransit');
  const inTransitCount = inTransitTrips.length;

  // Trucks at pickup point, loading goods
  const atPickupTrips = kpiTrips.filter(t => t.status === 'Loading' || t.status === 'AtPickup');
  const atPickupCount = atPickupTrips.length;

  // Delayed trips: active trips whose planned_end has already passed or explicitly marked Delayed
  const nowMs = Date.now();
  const delayedTrips = kpiTrips.filter(t =>
    t.status === 'Delayed' || (
      ['Scheduled', 'Loading', 'InTransit', 'Dispatched', 'AtPickup', 'AtDelivery'].includes(t.status) &&
      t.planned_end != null &&
      new Date(t.planned_end).getTime() < nowMs
    )
  );
  const delayedCount = delayedTrips.length;

  const deliveredPendingInvoiceTrips = kpiTrips.filter(t => t.status === 'Completed');
  const deliveredPendingInvoiceCount = deliveredPendingInvoiceTrips.length;

  const invoicedTrips = kpiTrips.filter(t => t.status === 'Invoiced');
  const invoicedCount = invoicedTrips.length;

  const completedTrips = kpiTrips.filter(t => t.status === 'Completed' || t.status === 'Invoiced');
  const completedCount = completedTrips.length;
  const completedPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const draftTrips = kpiTrips.filter(t => t.status === 'Draft' || t.status === 'Scheduled' || t.status === 'Dispatched');
  const dispatchQueueCount = draftTrips.length;

  const periodTrips = useMemo(() => {
    return rawTrips;
  }, [rawTrips]);
  const periodCount = periodTrips.length;
  const periodCompletedCount = periodTrips.filter(t => t.status === 'Completed' || t.status === 'Invoiced').length;
  const periodInTransitCount = periodTrips.filter(t => t.status === 'InTransit').length;
  const periodQueueCount = periodTrips.filter(t => t.status === 'Draft' || t.status === 'Scheduled' || t.status === 'Dispatched' || t.status === 'AtPickup' || t.status === 'Loading').length;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trips'] }),
      queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleUpdateStatus = async () => {
    if (!statusDialogTrip) return;
    const targetTrip = statusDialogTrip;
    const targetStatus = newStatus;
    try {
      setIsUpdatingStatus(true);
      const updated = await tripService.updateStatus(targetTrip.id, targetStatus);
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      await queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
      await refetch();
      setSelectionResetKey(k => k + 1);
      setStatusDialogTrip(null);
      toast.success('Trip status updated successfully');

      if (targetStatus === 'Completed') {
        setSettlementModalTrip(updated || { ...targetTrip, status: 'Completed' });
      }
    } catch (e) {
      toast.error('Failed to update trip status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const runExport = async (
    format: 'excel' | 'pdf' | 'csv',
    opts: { statusGroup: ExportStatusGroup; driverId?: string; vehicleId?: string; startDate?: string; endDate?: string; thirdPartyOnly?: boolean }
  ) => {
    try {
      setIsExporting(true);
      const res = await tripService.getAll({
        driver_id: opts.driverId,
        vehicle_id: opts.vehicleId,
        start_date: opts.startDate || undefined,
        end_date: opts.endDate || undefined,
        per_page: 2000,
      });
      let matched = (res.data || []).filter(t => matchesExportStatusGroup(t.status, opts.statusGroup));
      if (opts.thirdPartyOnly) {
        matched = matched.filter(t => t.is_third_party || t.thirdPartyProviderId || (t.carrier_name && t.carrier_name !== 'MERCON LOGISTICS'));
      }

      if (!matched.length) {
        toast.warning(opts.thirdPartyOnly ? 'No third-party trips match the selected export filters.' : 'No trips match the selected export filters.');
        return;
      }

      let groupLabel = EXPORT_STATUS_GROUPS.find(g => g.value === opts.statusGroup)?.label || 'All Trips';
      if (opts.thirdPartyOnly) {
        groupLabel = `Third-Party (3PL) Trips — ${groupLabel}`;
      }
      const groupSlug = (opts.thirdPartyOnly ? '3PL_' : '') + groupLabel.replace(/[\s/]+/g, '_');
      const datePart = new Date().toISOString().slice(0, 10);
      const baseName = `trips_export_${groupSlug}_${datePart}`;

      const exportRows = tripsToExportRowsWithTotals(matched, tz);
      const title = opts.thirdPartyOnly ? `Third-Party (3PL) Trips Export — ${groupLabel}` : `Trips Export — ${groupLabel}`;
      const subtitle = `Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · MERCON Logistics Platform · ${matched.length} record${matched.length === 1 ? '' : 's'}`;

      if (format === 'excel') {
        await exportExcelTable(title, TRIP_EXPORT_HEADERS, exportRows, `${baseName}.xlsx`, { subtitle, sheetName: opts.thirdPartyOnly ? '3PL Trips' : 'Trips' });
      } else {
        exportPDFTable(title, TRIP_EXPORT_HEADERS, exportRows, `${baseName}.pdf`, { subtitle });
      }
      setExportDialogOpen(false);
    } catch (e) {
      toast.error('Failed to generate export.');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Triggers a scalable backend streaming export for the given type.
   * All filtering is applied at the database level — no row limit.
   * PDF format is not supported here; use runExport() for PDF instead.
   */
  const triggerExport = async (
    params: { type: string; format: 'xlsx' | 'csv'; start_date?: string; end_date?: string; driver_id?: string; vehicle_id?: string }
  ) => {
    try {
      setIsExporting(true);
      const { blob, filename } = await downloadTripExport({ ...params });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export ready');
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDateRangeExport = () => {
    if (exportFormat === 'pdf' || exportFormat === 'excel') {
      // PDF / Excel: use beautiful browser-side styled generation (limited to 2,000 rows)
      runExport(exportFormat, {
        statusGroup: exportStatusGroup,
        startDate: exportStartDate,
        endDate: exportEndDate,
      });
      setExportDialogOpen(false);
    } else {
      // CSV: use the scalable backend streaming endpoint
      triggerExport({
        type: 'date-range',
        format: 'csv',
        start_date: exportStartDate || undefined,
        end_date: exportEndDate || undefined,
      });
      setExportDialogOpen(false);
    }
  };

  const getDriverInitials = (driver?: { first_name?: string; last_name?: string } | null) => {
    if (!driver) return '—';
    const f = driver.first_name?.[0] || '';
    const l = driver.last_name?.[0] || '';
    return (f + l).toUpperCase() || 'DR';
  };

  const columns = [
    {
      header: 'Trip ID',
      className: 'w-[90px] shrink-0',
      mobilePriority: 'primary' as const,
      accessor: (row: Trip) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs font-bold text-brand truncate">
            {row.ref_id || 'Draft'}
          </span>
        </div>
      ),
    },
    {
      header: 'Customer',
      className: 'max-w-[130px] truncate',
      mobilePriority: 'secondary' as const,
      accessor: (row: Trip) => (
        <div className="flex flex-col max-w-[130px] truncate">
          {row.customer ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewCustomer(row.customer);
              }}
              className="font-semibold text-xs text-brand hover:underline text-left truncate cursor-pointer"
              title={`Preview ${row.customer.name}`}
            >
              {row.customer.name}
            </button>
          ) : (
            <span className="font-semibold text-xs text-slate-400 italic">
              Unassigned
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Route',
      className: 'w-[140px] max-w-[160px]',
      mobilePriority: 'secondary' as const,
      accessor: (row: Trip) => {
        const pickup = getPickupInfo(row);
        const dropoff = getDropoffInfo(row);
        const stops = row.stops || [];

        const stopNames = stops
          .map((s) => {
            const n = s.location_name || s.location?.name || s.location_address || s.location?.address || '';
            return n.replace(/🔁\s*/g, '').replace(/\[RETURN:.*?\]/gi, '').trim();
          })
          .filter(Boolean);

        const firstStop = stopNames[0] || pickup.name || '—';
        const lastStop = stopNames.length > 1 ? stopNames[stopNames.length - 1] : dropoff.name || '—';

        let intermediateList: string[] = [];
        if (stopNames.length > 2) {
          intermediateList = stopNames
            .slice(1, stopNames.length - 1)
            .filter((name, idx, arr) => idx === 0 || name.toLowerCase() !== arr[idx - 1].toLowerCase());
        } else if (firstStop.toLowerCase() === lastStop.toLowerCase() && dropoff.name && dropoff.name.toLowerCase() !== firstStop.toLowerCase()) {
          intermediateList = [dropoff.name];
        }

        const fullRouteDisplay = [firstStop, ...intermediateList, lastStop].filter(Boolean).join(' → ');

        return (
          <div className="flex flex-col min-w-0 py-0.5 space-y-1" title={fullRouteDisplay}>
            {/* Origin (From) */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {firstStop}
              </span>
            </div>

            {/* In-Between Stop(s) */}
            {intermediateList.length > 0 && (
              <>
                <div className="pl-[2.5px] -my-0.5">
                  <div className="w-px h-2 border-l border-dashed border-slate-300 dark:border-slate-700" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 truncate">
                    {intermediateList.join(' → ')}
                  </span>
                </div>
              </>
            )}

            {/* Connecting visual line */}
            <div className="pl-[2.5px] -my-0.5">
              <div className="w-px h-2 border-l border-dashed border-slate-300 dark:border-slate-700" />
            </div>

            {/* Final Destination / Return (To) */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">
                {lastStop}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Driver / Vehicle',
      className: 'min-w-[160px] max-w-[190px]',
      mobilePriority: 'meta' as const,
      accessor: (row: Trip) => {
        const renderDriver = () => {
          if (row.is_third_party) {
            const name = row.third_party_driver_name || row.thirdPartyProvider?.name || '3PL Driver';
            const providerName = row.thirdPartyProvider?.name || row.carrier_name || '3PL Carrier';
            const initial = name[0]?.toUpperCase() || '3P';

            return (
              <div
                className="flex items-center gap-1.5 cursor-pointer group min-w-0"
                title={`3PL Driver: ${name}\nProvider: ${providerName}`}
                onClick={(e) => {
                  if (row.thirdPartyProvider) {
                    e.stopPropagation();
                    setPreviewThirdParty(row.thirdPartyProvider);
                  }
                }}
              >
                <div className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[8px] flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
                  {initial}
                </div>
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 group-hover:underline truncate">
                  {name}
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
              <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[8px] flex items-center justify-center shrink-0">
                {row.driver ? `${row.driver.first_name[0]}${row.driver.last_name ? row.driver.last_name[0] : ''}` : 'U'}
              </div>
              {row.driver ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewDriver(row.driver);
                  }}
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-brand hover:underline text-left cursor-pointer truncate"
                  title={`Preview ${row.driver.first_name} ${row.driver.last_name}`}
                >
                  {row.driver.first_name} {row.driver.last_name}
                </button>
              ) : (
                <span className="text-xs text-slate-400 italic">Unassigned</span>
              )}
              {row.driver?.deletedAt && <DeletedBadge />}
            </div>
          );
        };

        const renderCoDriver = () => {
          if (row.is_third_party || !(row as any).coDriver) return null;
          const coDriver = (row as any).coDriver;
          const coName = `${coDriver.first_name || ''} ${coDriver.last_name || ''}`.trim();
          if (!coName) return null;
          return (
            <div className="flex items-center gap-1.5 overflow-hidden min-w-0 mt-0.5">
              <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[7px] flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                CO
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                {coName}
              </span>
            </div>
          );
        };

        const renderVehicle = () => {
          if (row.is_third_party) {
            const plate = row.third_party_vehicle_plate || '3PL Truck';
            return (
              <div className="flex items-center gap-1 min-w-0">
                <Truck size={11} className="text-purple-500 shrink-0" />
                <span
                  className="font-mono text-[10px] text-purple-700 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/60 px-1 py-0.2 rounded truncate"
                  title={`3PL Vehicle Plate: ${plate}`}
                >
                  {plate}
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-1 min-w-0">
              <Truck size={11} className="text-slate-400 shrink-0" />
              {row.vehicle?.plate_number ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewVehicle(row.vehicle);
                    }}
                    className="font-mono text-[10px] text-slate-700 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 px-1 py-0.2 rounded truncate transition-colors cursor-pointer"
                    title={`Preview Vehicle ${row.vehicle.plate_number}`}
                  >
                    {row.vehicle.plate_number}
                  </button>
                  {row.vehicle?.deletedAt && <DeletedBadge />}
                </>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Unassigned</span>
              )}
            </div>
          );
        };

        return (
          <div className="flex flex-col space-y-0.5 py-0.5">
            {renderDriver()}
            {renderCoDriver()}
            {renderVehicle()}
          </div>
        );
      },
    },
    {
      header: 'Line Type',
      className: 'w-[120px] shrink-0',
      mobilePriority: 'hidden' as const,
      accessor: (row: Trip) => {
        const lineType = getTripRateCategory(row);
        return <TaxonomyBadge category="LINE_TYPE" value={lineType} fallbackText="Single Trip" />;
      },
    },
    {
      header: 'Vehicle Class',
      className: 'w-[130px] shrink-0',
      mobilePriority: 'hidden' as const,
      accessor: (row: Trip) => {
        const cat = row.quotation_vehicle_class || row.financials?.quotation_vehicle_class || row.vehicle_type || getTripPayloadCapacity(row);
        return <TaxonomyBadge category="VEHICLE_CLASS" value={cat} fallbackText="10 TON" />;
      },
    },
    {
      header: 'Rate',
      className: 'w-[100px] shrink-0',
      mobilePriority: 'meta' as const,
      accessor: (row: Trip) => {
        const price = row.billing_amount ?? row.trip_charges ?? row.rateCard?.base_price;
        return (
          <div className="flex items-center font-mono text-xs">
            <span className="font-extrabold text-slate-900 dark:text-slate-200">
              {price !== undefined && price !== null && price > 0
                ? `SAR ${Number(price).toLocaleString('en-US')}`
                : '—'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Driver Charge',
      className: 'w-[110px] shrink-0',
      mobilePriority: 'hidden' as const,
      accessor: (row: Trip) => {
        const primaryCharge = row.driver_payout ?? row.driver_charge ?? row.trip_charges ?? row.third_party_cost;
        const coDriverPayout = Number((row as any).co_driver_payout ?? 0);
        const combinedCharge = (primaryCharge !== undefined && primaryCharge !== null)
          ? Number(primaryCharge) + coDriverPayout
          : undefined;
        return (
          <div className="flex flex-col font-mono text-xs" title="What MERCON pays the driver(s) — not the customer-billed amount">
            <span className="font-bold text-slate-500 dark:text-slate-400">
              {combinedCharge !== undefined && combinedCharge > 0
                ? `SAR ${combinedCharge.toLocaleString('en-US')}`
                : '—'}
            </span>
            {coDriverPayout > 0 && (
              <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                {`${Number(primaryCharge).toLocaleString('en-US')} + ${coDriverPayout.toLocaleString('en-US')}`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Status',
      className: 'w-[105px] shrink-0',
      mobilePriority: 'primary' as const,
      accessor: (row: Trip) => (
        <StatusBadge status={row.status} />
      ),
    },
    {
      header: 'Planned Start',
      className: 'w-[95px] shrink-0',
      mobilePriority: 'meta' as const,
      accessor: (row: Trip) => (
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {row.planned_start ? formatInDeploymentTz(row.planned_start, tz, 'MMM d') : '—'}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'w-[95px] text-right shrink-0',
      headerClassName: 'text-right',
      mobilePriority: 'hidden' as const,
      accessor: (row: Trip) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => openWhatsappShare([row])}
            title="Share to WhatsApp"
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
          >
            <WhatsAppIcon className="w-3.5 h-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors focus:outline-none cursor-pointer"
                title="Trip Actions"
                aria-label="Trip Actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
              {row.status === 'InTransit' && (
                <DropdownMenuItem
                  onClick={() => navigate(`/trips/${row.id}/track`)}
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40"
                >
                  <Navigation className="mr-2 h-3.5 w-3.5" />
                  Live GPS Track
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={() => {
                  setStatusDialogTrip(row);
                  setNewStatus(row.status);
                }}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                Quick Status Change
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => navigate(`/trips/${row.id}/edit`)}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
              >
                <Edit2 className="mr-2 h-3.5 w-3.5 text-amber-600" />
                Edit Trip
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => openWhatsappShare([row])}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
              >
                <WhatsAppIcon className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                Share to WhatsApp
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

              <DropdownMenuItem
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Delete Trip',
                    message: `Are you sure you want to move trip ${row.ref_id || 'Draft'} to Trash?`,
                    onConfirm: async () => {
                      try {
                        await tripService.bulkDelete([row.id]);
                        await queryClient.invalidateQueries({ queryKey: ['trips'] });
                        await queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
                        await refetch();
                        setSelectionResetKey(k => k + 1);
                        toast.success('Trip moved to Trash');
                      } catch (e: any) {
                        toast.error(e.response?.data?.error?.message || 'Failed to delete trip');
                      }
                    }
                  });
                }}
                className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete Trip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const bulkActions = [
    {
      label: 'Edit Selected Trip',
      icon: <Edit2 size={13} />,
      variant: 'primary' as const,
      onClick: (selectedRows: Trip[]) => {
        if (selectedRows.length === 1) {
          navigate(`/trips/${selectedRows[0].id}/edit`);
        } else if (selectedRows.length > 1) {
          setStatusDialogTrip(selectedRows[0]);
          setNewStatus(selectedRows[0].status);
        }
      }
    },
    {
      label: 'Share to WhatsApp',
      icon: <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
      variant: 'success' as const,
      onClick: (selectedRows: Trip[]) => {
        openWhatsappShare(selectedRows);
      }
    },
    {
      label: 'Export Selected Excel',
      icon: <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />,
      variant: 'success' as const,
      onClick: (selectedRows: Trip[]) => {
        setCustomExportFormat('xlsx');
        setSelectedTripsForExport(selectedRows);
        setIsCustomExportOpen(true);
      }
    },
    {
      label: 'Export Selected PDF',
      icon: <FileText size={13} className="text-rose-600 dark:text-rose-400" />,
      variant: 'warning' as const,
      onClick: (selectedRows: Trip[]) => {
        setCustomExportFormat('pdf');
        setSelectedTripsForExport(selectedRows);
        setIsCustomExportOpen(true);
      }
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (selectedRows: Trip[], clearSelection?: () => void) => {
        setConfirmModal({
          isOpen: true,
          title: 'Delete Selected Trips',
          message: `Are you sure you want to move ${selectedRows.length} selected trip${selectedRows.length > 1 ? 's' : ''} to Trash?`,
          onConfirm: async () => {
            try {
              const res = await tripService.bulkDelete(selectedRows.map(r => r.id));
              await queryClient.invalidateQueries({ queryKey: ['trips'] });
              await queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
              await refetch();
              clearSelection?.();
              setSelectionResetKey(k => k + 1);
              if (res?.skippedCount > 0) {
                if (res.deletedCount > 0) {
                  toast.warning(`Moved ${res.deletedCount} trip(s) to Trash. ${res.skippedCount} trip(s) were protected from deletion (invoiced/settled).`);
                } else {
                  toast.error(`Cannot delete trip(s): selected trip(s) are already invoiced or financially settled.`);
                }
              } else {
                toast.success(`Successfully moved ${res?.deletedCount || selectedRows.length} trip(s) to Trash`);
              }
            } catch (e: any) {
              toast.error(e.response?.data?.error?.message || 'Failed to delete trips');
            }
          }
        });
      }
    }
  ];
  const inlineSearchInput = (
    <div className="relative w-full sm:w-60 md:w-72 shrink-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <Input
        placeholder="Search trip ID, driver, vehicle..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCurrentPage(1);
        }}
        className="pl-9 h-9 text-xs bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-semibold"
      />
      {search && (
        <button
          onClick={() => {
            setSearch('');
            setCurrentPage(1);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <DashboardLayout 
      active="Trips" 
      title="Trips" 
    >
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">

        {/* ── 2. Instrument-Panel KPI Cards (Trip Ledger Table View Only) ────────────────── */}
        {viewMode === 'table' && (
          <TripKpiCards
            kpiTitle={kpiTitle}
            kpiPeriod={kpiPeriod}
            setKpiPeriod={setKpiPeriod}
            setDateFilter={setDateFilter}
            setCurrentPage={setCurrentPage}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            periodCount={periodCount}
            periodCompletedCount={periodCompletedCount}
            periodInTransitCount={periodInTransitCount}
            periodQueueCount={periodQueueCount}
            inTransitCount={inTransitCount}
            completedCount={completedCount}
            scheduledCount={draftTrips.length}
            delayedCount={delayedCount}
          />
        )}

        {/* ── Control Toolbar & Views ───────────────────── */}
        {(() => {
          const filterControls = (
            <>
              {/* Search Input */}
              <div className="relative w-full sm:w-56 lg:w-64 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Search trip ID, driver, vehicle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-[11px] bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-semibold"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Multi-Filter Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs cursor-pointer rounded-lg px-2.5 shrink-0"
                  >
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span>Filters</span>
                    {activeFiltersCount > 0 && (
                      <span className="ml-0.5 px-1 py-0.2 rounded-full bg-red-600 text-white text-[8px] font-black leading-none">
                        {activeFiltersCount}
                      </span>
                    )}
                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 p-3.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-3 z-50">
                  <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 p-0">
                    Filter Trips
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-850" />
                  
                  <div className="space-y-2.5">
                    {/* Status Group / Exact State Filter */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => {
                          setSelectedStatus(e.target.value as any);
                          setCurrentPage(1);
                        }}
                        className="w-full h-8 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Loading">Loading</option>
                        <option value="InTransit">In Transit</option>
                        <option value="Delayed">Delayed</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    {/* Company Filter */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company</label>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => {
                          setSelectedCustomerId(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full h-8 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All">All Companies</option>
                        {customerFilterOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Driver Filter */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Driver</label>
                      <select
                        value={selectedDriverId}
                        onChange={(e) => {
                          setSelectedDriverId(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full h-8 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All">All Drivers</option>
                        {driverFilterOptions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {activeFiltersCount > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatus('All');
                          setSelectedCustomerId('All');
                          setSelectedDriverId('All');
                          setCurrentPage(1);
                        }}
                        className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Date Filter Picker */}
              <TripDateFilterPicker
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                customDateRange={customDateRange}
                setCustomDateRange={setCustomDateRange}
              />
            </>
          );

          const actionControls = (
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md text-xs font-bold flex items-center transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="List View"
                >
                  <LayoutList className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`p-1.5 rounded-md text-xs font-bold flex items-center transition-all cursor-pointer ${
                    viewMode === 'kanban'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Kanban View"
                >
                  <Kanban className="w-4 h-4" />
                </button>
              </div>

              <DropdownMenu open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px] font-semibold border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-2xs rounded-xl transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    <span className="hidden sm:inline">Export & Import</span>
                    <span className="sm:hidden">Export</span>
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
                  <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
                    Export Operations
                  </DropdownMenuLabel>
                  
                  <DropdownMenuItem
                    onClick={() => {
                      setCustomExportFormat('xlsx');
                      setExportMenuOpen(false);
                      setIsCustomExportOpen(true);
                    }}
                    className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-405 shrink-0" />
                    <span>Export to Excel</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      setCustomExportFormat('pdf');
                      setExportMenuOpen(false);
                      setIsCustomExportOpen(true);
                    }}
                    className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-4 w-4 text-rose-600 dark:text-rose-455 shrink-0" />
                    <span>Export to PDF</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

                  <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
                    Import Operations
                  </DropdownMenuLabel>

                  <DropdownMenuItem
                    onClick={() => {
                      setExportMenuOpen(false);
                      setImportDialogOpen(true);
                    }}
                    className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400"
                  >
                    <Upload className="h-4 w-4 text-blue-600 dark:text-blue-455 shrink-0" />
                    <span>Import File (Excel / CSV)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-[11px] font-bold bg-brand hover:bg-[#d13d0d] text-white shadow-xs rounded-xl px-3.5 cursor-pointer flex items-center"
                  >
                    <span>New Trip</span>
                    <ChevronDown className="h-3.5 w-3.5 text-white/80 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-50">
                  <DropdownMenuItem
                    onClick={() => navigate('/trips/new?billingType=Extra')}
                    className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3 hover:bg-orange-50 dark:hover:bg-orange-950/40 focus:bg-orange-50 focus:text-brand"
                  >
                    <Plus className="w-4 h-4 text-brand shrink-0" />
                    <div>
                      <div className="font-bold text-[#111111] dark:text-slate-100">Daily / Spot Trip</div>
                      <div className="text-[10px] text-slate-500">Single or round trip at spot rate cards</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => navigate('/trips/new?billingType=Monthly')}
                    className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3 hover:bg-orange-50 dark:hover:bg-orange-950/40 focus:bg-orange-50 focus:text-brand"
                  >
                    <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold text-[#111111] dark:text-slate-100">Monthly Duty Trip</div>
                      <div className="text-[10px] text-slate-500">Dedicated monthly contract duty & calendar</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => navigate('/trips/new?assignment=third_party')}
                    className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3 hover:bg-orange-50 dark:hover:bg-orange-950/40 focus:bg-orange-50 focus:text-brand"
                  >
                    <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold text-[#111111] dark:text-slate-100">3PL Partner Dispatch</div>
                      <div className="text-[10px] text-slate-500">Subcontracted trip with 3PL carrier cost</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );

          return (
            <>
              {/* Standalone Control Toolbar for Kanban View only */}
              {viewMode === 'kanban' && (
                <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs relative z-10">
                  <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                    {filterControls}
                  </div>
                  {actionControls}
                </div>
              )}

              {/* ── 3. Main View Canvas (Kanban or Ledger Table) ───────────────────── */}
              {viewMode === 'kanban' ? (
                <div className="flex-1 flex flex-col min-h-0 w-full gap-3 h-[calc(100vh-140px)] animate-fade-in">
                  {/* Full-Height Kanban Board Canvas */}
                  <div className="flex-1 min-h-0 relative">
                    <TripKanbanBoard
                      ref={kanbanBoardRef}
                      trips={trips}
                      statusFilter={selectedStatus !== 'All' ? (selectedStatus as string) : undefined}
                      focusedStage={stageParam}
                      onStageFocusChange={handleStageFocusChange}
                      onStatusChange={handleKanbanStatusChange}
                      onLogDelay={(trip) => setStatusDialogTrip(trip)}
                      onShareWhatsapp={(trip) => openWhatsappShare([trip])}
                      onDelete={(trip) => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Delete Trip',
                          message: `Are you sure you want to move trip ${trip.ref_id} to Trash?`,
                          onConfirm: async () => {
                            try {
                              await tripService.bulkDelete([trip.id]);
                              await queryClient.invalidateQueries({ queryKey: ['trips'] });
                              await queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
                              await refetch();
                              toast.success(`Moved trip ${trip.ref_id} to Trash`);
                            } catch (e: any) {
                              toast.error(e.response?.data?.error?.message || 'Failed to delete trip');
                            }
                          }
                        });
                      }}
                      onOpenSettlement={(trip) => setSettlementModalTrip(trip)}
                      onCreateTrip={() => navigate('/trips/new')}
                      isLoading={isLoading}
                      isError={isError}
                      onRetry={() => refetch()}
                    />
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col gap-3 animate-fade-in">

                  {/* Active Filter Indicator Banners */}
                  {selectedStatus !== 'All' && (
                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/40 px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold text-orange-900 dark:text-orange-200 animate-fade-in shrink-0">
                      <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-brand shrink-0" />
                        <span>
                          Filtered by status: <strong className="underline decoration-brand text-slate-900 dark:text-slate-100 font-bold">{STATUS_LABELS[selectedStatus] || selectedStatus}</strong> ({trips.length} trip{trips.length === 1 ? '' : 's'} matching)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedStatus('All');
                          setCurrentPage(1);
                        }}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-[11px] font-bold text-brand hover:bg-orange-100 dark:hover:bg-orange-950 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Show All Operations</span>
                        <X className="w-3 h-3 shrink-0" />
                      </button>
                    </div>
                  )}
                  {selectedDriverId !== 'All' && (
                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/40 px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold text-orange-900 dark:text-orange-200 animate-fade-in shrink-0">
                      <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-brand shrink-0" />
                        <span>
                          Filtered by driver: <strong className="underline decoration-brand text-slate-900 dark:text-slate-100 font-bold">{driverFilterOptions.find(d => d.id === selectedDriverId)?.name || 'Driver'}</strong> ({trips.length} trip{trips.length === 1 ? '' : 's'} matching)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedDriverId('All');
                          setCurrentPage(1);
                        }}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-[11px] font-bold text-brand hover:bg-orange-100 dark:hover:bg-orange-950 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Clear Driver Filter</span>
                        <X className="w-3 h-3 shrink-0" />
                      </button>
                    </div>
                  )}

                  <div className="w-full flex flex-col">
                    <DataTable
                      key={`${selectedStatus}_${selectedCustomerId}_${selectedDriverId}_${dateFilter}_${totalTripsResetKey}`}
                      title={
                        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                          <div className="flex flex-col gap-1 shrink-0">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-brand" />
                              <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-tight">Trip Ledger</span>
                            </div>
                            <Badge variant="outline" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold px-2 py-0.5 w-fit">
                              {trips.length} {trips.length === 1 ? 'record' : 'records'}
                            </Badge>
                          </div>
                          {filterControls}
                        </div>
                      }
                      hideRecordCount={true}
                      data={trips}
                      columns={columns}
                      enableSelection={true}
                      selectionResetKey={selectionResetKey}
                      compact={true}
                      isLoading={isLoading}
                      isError={isError}
                      errorMessage={(error as Error)?.message || 'Failed to load trips.'}
                      actionsElement={actionControls}
                      bulkActions={bulkActions}
                      currentPage={currentPage}
                      onPageChange={(page) => setCurrentPage(page)}
                      pageSize={pageSize}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                      totalRecords={tripsRes?.meta?.total ?? trips.length}
                      totalPages={tripsRes?.meta?.total_pages ?? Math.ceil((tripsRes?.meta?.total ?? trips.length) / pageSize)}
                      onRowClick={(row) => navigate(`/trips/${row.id}`)}
                    />
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Quick Status Update Modal (Dialog) */}
        <Dialog open={!!statusDialogTrip} onOpenChange={(open) => !open && setStatusDialogTrip(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-brand" />
                Update Trip Status
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update operational status for trip <span className="font-mono font-bold text-brand">{statusDialogTrip?.ref_id || 'Draft'}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select New Status:
              </label>
              <Select value={newStatus} onValueChange={(val) => { if (val) setNewStatus(val as any); }}>
                <SelectTrigger className="w-full text-xs font-semibold border-slate-200 rounded-lg">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="w-full p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
                  {(() => {
                    const currentStatus = statusDialogTrip?.status as TripStatus;
                    
                    const ALLOWED_TRANSITIONS: Record<string, TripStatus[]> = {
                      Draft: ['Dispatched', 'Cancelled'] as TripStatus[],
                      Dispatched: ['AtPickup', 'Draft', 'Cancelled'] as TripStatus[],
                      AtPickup: ['InTransit', 'Cancelled'] as TripStatus[],
                      InTransit: ['AtDelivery', 'Cancelled'] as TripStatus[],
                      AtDelivery: ['Completed', 'Cancelled'] as TripStatus[],
                      Completed: ['Invoiced'] as TripStatus[],
                      Invoiced: [] as TripStatus[],
                      Cancelled: ['Draft'] as TripStatus[],
                    };

                    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
                    const isValid = (status: string) => status === currentStatus || allowed.includes(status as TripStatus);

                    return (
                      <>
                        <SelectItem value="Draft" disabled={!isValid('Draft')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />Scheduled</span>
                        </SelectItem>
                        <SelectItem value="Dispatched" disabled={!isValid('Dispatched')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />Dispatched</span>
                        </SelectItem>
                        <SelectItem value="AtPickup" disabled={!isValid('AtPickup')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />Loading</span>
                        </SelectItem>
                        <SelectItem value="InTransit" disabled={!isValid('InTransit')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />In Transit</span>
                        </SelectItem>
                        <SelectItem value="AtDelivery" disabled={!isValid('AtDelivery')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />At Delivery</span>
                        </SelectItem>
                        <SelectItem value="Completed" disabled={!isValid('Completed')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />Completed</span>
                        </SelectItem>
                        <SelectItem value="Invoiced" disabled={!isValid('Invoiced')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />Invoiced</span>
                        </SelectItem>
                        <SelectItem value="Cancelled" disabled={!isValid('Cancelled')} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />Cancelled</span>
                        </SelectItem>
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setStatusDialogTrip(null)}
                disabled={isUpdatingStatus}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs font-bold bg-brand hover:bg-brand/90 text-white"
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? 'Saving...' : 'Update Status'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Date Range Export Dialog — the one filter that doesn't fit a dropdown item */}
        <Dialog open={exportDialogOpen} onOpenChange={(open) => !open && setExportDialogOpen(false)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-brand" />
                Export by Date Range
              </DialogTitle>
              <DialogDescription className="text-xs">
                Pick a status and a date window, then export as {exportFormat.toUpperCase()}.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status</label>
                <Select value={exportStatusGroup} onValueChange={(val) => val && setExportStatusGroup(val as ExportStatusGroup)}>
                  <SelectTrigger className="w-full h-9 text-xs font-semibold border-slate-200 rounded-lg">
                    <SelectValue placeholder="All Trips" />
                  </SelectTrigger>
                  <SelectContent className="w-full p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
                    {EXPORT_STATUS_GROUPS.map(g => (
                      <SelectItem key={g.value} value={g.value} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">From Date</label>
                  <Input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">To Date</label>
                  <Input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 w-fit">
                <button
                  onClick={() => setExportFormat('excel')}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-bold transition-colors ${exportFormat === 'excel' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Excel
                </button>
                <button
                  onClick={() => setExportFormat('pdf')}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-bold transition-colors ${exportFormat === 'pdf' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600" />
                  PDF
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setExportDialogOpen(false)}
                disabled={isExporting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className={`text-xs font-bold gap-1.5 ${exportFormat === 'excel' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                onClick={handleDateRangeExport}
                disabled={isExporting}
              >
                {exportFormat === 'excel' ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ExportModal
          isOpen={isCustomExportOpen}
          onClose={() => setIsCustomExportOpen(false)}
          initialFormat={customExportFormat}
          title="Trip Ledger Export"
          fileNamePrefix="trips_export"
          sheetName="Trips"
          filteredData={tripsRes?.data || []}
          allData={allTripsRes?.data || []}
          totalCount={allTripsRes?.meta?.total || allTripsRes?.data?.length || 0}
          selectedData={selectedTripsForExport}
          columns={TRIP_EXPORT_COLUMNS}
          filters={tripExportFilters}
          formats={['xlsx', 'csv', 'pdf']}
          themes={[
            { id: 'standard', label: 'Standard (MERCON Brand)' },
            { id: 'jd-monthly', label: 'JD Monthly Summary' }
          ]}
          rowDateAccessor={(t) => t.planned_start || t.createdAt}
        />

        {/* CSV Import Dialog */}
        {/* WhatsApp Share Dialog */}
        <Dialog open={whatsappDialogOpen} onOpenChange={(open) => !open && setWhatsappDialogOpen(false)}>
          <DialogContent className="sm:max-w-[460px] rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-extrabold flex items-center gap-2 text-emerald-600">
                <WhatsAppIcon className="w-5 h-5 text-emerald-500" />
                Share to WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                Send trip manifest details directly via WhatsApp web or mobile app.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {whatsappSelectedTrips.length === 1 ? (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select Recipient:
                  </span>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {/* Driver option */}
                    <label className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-colors ${whatsappRecipientType === 'driver' ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="recipientType"
                          value="driver"
                          checked={whatsappRecipientType === 'driver'}
                          onChange={() => setWhatsappRecipientType('driver')}
                          disabled={!whatsappSelectedTrips[0]?.driver?.phone_primary}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-bold text-slate-800">
                            Driver
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {whatsappSelectedTrips[0]?.driver 
                              ? `${whatsappSelectedTrips[0].driver.first_name} ${whatsappSelectedTrips[0].driver.last_name}`
                              : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-600 font-bold bg-white dark:bg-slate-900 border border-slate-200/60 px-2 py-0.5 rounded-md">
                        {whatsappSelectedTrips[0]?.driver?.phone_primary || 'No phone number'}
                      </span>
                    </label>

                    {/* Customer option */}
                    <label className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-colors ${whatsappRecipientType === 'customer' ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="recipientType"
                          value="customer"
                          checked={whatsappRecipientType === 'customer'}
                          onChange={() => setWhatsappRecipientType('customer')}
                          disabled={!whatsappSelectedTrips[0]?.customer?.contact_phone}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-bold text-slate-800">
                            Customer
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {whatsappSelectedTrips[0]?.customer?.name || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-600 font-bold bg-white dark:bg-slate-900 border border-slate-200/60 px-2 py-0.5 rounded-md">
                        {whatsappSelectedTrips[0]?.customer?.contact_phone || 'No phone number'}
                      </span>
                    </label>

                    {/* Custom number option */}
                    <label className={`flex flex-col gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-colors ${whatsappRecipientType === 'custom' ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="recipientType"
                          value="custom"
                          checked={whatsappRecipientType === 'custom'}
                          onChange={() => setWhatsappRecipientType('custom')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-bold text-slate-800">
                          Custom Phone Number
                        </span>
                      </div>
                      
                      {whatsappRecipientType === 'custom' && (
                        <div className="pl-6 animate-slide-down">
                          <Input
                            placeholder="e.g. 966512345678"
                            value={whatsappCustomPhone}
                            onChange={(e) => setWhatsappCustomPhone(e.target.value)}
                            className="h-8 text-xs border-slate-200 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
                          />
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Recipient Phone Number (Optional)
                  </label>
                  <Input
                    placeholder="e.g. 966512345678 (Leave blank to select chat inside WhatsApp)"
                    value={whatsappCustomPhone}
                    onChange={(e) => setWhatsappCustomPhone(e.target.value)}
                    className="h-9 text-xs border-slate-200 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Note: Sharing multiple trips constructs a manifest summary text.
                  </p>
                </div>
              )}

              {/* Message text preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Message Preview:
                  </label>
                  {whatsappSelectedTrips.length === 1 && ['Draft', 'Scheduled'].includes(whatsappSelectedTrips[0]?.status || '') && (
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-1 rounded-md transition-colors">
                      <input
                        type="checkbox"
                        checked={whatsappWithTailgate}
                        onChange={(e) => setWhatsappWithTailgate(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 bg-white"
                      />
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Include Tailgate
                      </span>
                    </label>
                  )}
                </div>
                <textarea
                  value={whatsappMessageText}
                  onChange={(e) => setWhatsappMessageText(e.target.value)}
                  className="w-full h-40 p-3 rounded-xl border border-slate-200 text-xs font-medium font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50 resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-9 rounded-lg"
                onClick={() => setWhatsappDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 px-4"
                onClick={handleWhatsappSend}
              >
                <WhatsAppIcon className="w-4 h-4 text-white" />
                Open WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importDialogOpen} onOpenChange={(open) => !open && resetImportDialog()}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Upload className="h-4 w-4 text-brand" />
                Import Trips
              </DialogTitle>
              <DialogDescription className="text-xs">
                Bulk-create trips from a spreadsheet (.xlsx or .csv). Route stops aren't linked to a saved Location — add those per trip afterward.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-3.5">
              {!importResult && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] text-slate-600 leading-snug">
                      Columns: <span className="font-mono font-semibold">Customer Name</span> (required),{' '}
                      <span className="font-mono font-semibold">Driver Name</span>,{' '}
                      <span className="font-mono font-semibold">Vehicle Plate</span>,{' '}
                      <span className="font-mono font-semibold">Planned Start</span>,{' '}
                      <span className="font-mono font-semibold">Rate Category</span>,{' '}
                      <span className="font-mono font-semibold">Vehicle Type</span>,{' '}
                      <span className="font-mono font-semibold">Billing Type</span>,{' '}
                      <span className="font-mono font-semibold">Origin</span>,{' '}
                      <span className="font-mono font-semibold">Destination</span>,{' '}
                      <span className="font-mono font-semibold">Billing Amount</span>,{' '}
                      <span className="font-mono font-semibold">Driver Charge</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 gap-1.5 text-xs font-semibold border-slate-200"
                    onClick={downloadImportTemplate}
                  >
                    <Download className="h-3.5 w-3.5 text-slate-600" />
                    Download CSV Template
                  </Button>

                  <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-lg py-6 cursor-pointer hover:border-brand/40 hover:bg-orange-50/30 transition-colors">
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">
                      {importFileName || 'Click to choose a file'}
                    </span>
                    <span className="text-[10px] text-slate-400">.xlsx or .csv, up to 500 rows</span>
                    <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportFileChange} />
                  </label>

                  {importParseError && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {importParseError}
                    </div>
                  )}

                  {importRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-semibold flex items-center justify-between">
                        <span>{importRows.length} trip{importRows.length > 1 ? 's' : ''} ready from "{importFileName}".</span>
                        <Badge variant="outline" className="bg-white text-emerald-800 border-emerald-300 font-mono text-[10px]">
                          {importRows.filter(r => r.driver_name).length} with drivers
                        </Badge>
                      </div>

                      {/* Driver Disambiguation Section */}
                      {(() => {
                        const uniqueDriverNames = Array.from(new Set(importRows.map(r => r.driver_name).filter(Boolean))) as string[];
                        const ambiguousOrUnmatched = uniqueDriverNames.map(name => {
                          let candidates = findDriverCandidates(name, activeImportDrivers);

                          // Cross-verify with Vehicle Plate Number if candidate is not uniquely matched
                          if (candidates.length !== 1) {
                            const matchingRows = importRows.filter(r => (r.driver_name || '').trim().toLowerCase() === name.trim().toLowerCase());
                            const rowPlates = Array.from(new Set(matchingRows.map(r => (r.vehicle_plate || '').replace(/[\s-]/g, '').toLowerCase()).filter(Boolean)));

                            if (rowPlates.length > 0) {
                              const plateMatchedDriverIds = new Set<string>();

                              activeImportDrivers.forEach((d: any) => {
                                const assignedPlate = (d.assignedVehicle?.plate_number || '').replace(/[\s-]/g, '').toLowerCase();
                                if (assignedPlate && rowPlates.includes(assignedPlate)) {
                                  plateMatchedDriverIds.add(d.id);
                                }
                                if (d.assignedVehicleId) {
                                  const matchedV = activeImportVehicles.find((v: any) => v.id === d.assignedVehicleId);
                                  if (matchedV) {
                                    const vPlate = (matchedV.plate_number || '').replace(/[\s-]/g, '').toLowerCase();
                                    if (vPlate && rowPlates.includes(vPlate)) {
                                      plateMatchedDriverIds.add(d.id);
                                    }
                                  }
                                }
                              });

                              if (plateMatchedDriverIds.size > 0) {
                                const plateCandidates = activeImportDrivers.filter((d: any) => plateMatchedDriverIds.has(d.id));
                                if (plateCandidates.length > 0) {
                                  candidates = plateCandidates;
                                }
                              }
                            }
                          }

                          return { name, candidates };
                        });

                        const needingReview = ambiguousOrUnmatched.filter(e => e.candidates.length !== 1);

                        if (needingReview.length === 0) return null;

                        return (
                          <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl space-y-2.5 max-h-56 overflow-y-auto">
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>Driver Review & Confirmation ({needingReview.length} name(s)):</span>
                            </div>
                            {needingReview.map(({ name, candidates }) => (
                              <div key={name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-amber-200/70 text-xs">
                                <div>
                                  Sheet Name: <strong className="font-mono text-brand">{name}</strong>
                                  <span className="text-[10px] text-slate-500 block">
                                    {candidates.length > 1 ? `${candidates.length} matching candidates found` : 'No exact candidate found'}
                                  </span>
                                </div>
                                <Select
                                  value={driverMappings[name] || (candidates.length === 1 ? candidates[0].id : 'none')}
                                  onValueChange={(val) => setDriverMappings(prev => ({ ...prev, [name]: val }))}
                                >
                                  <SelectTrigger className="h-8 text-xs w-[210px] bg-slate-50 dark:bg-slate-800">
                                    <SelectValue placeholder="Select Driver..." />
                                  </SelectTrigger>
                                  <SelectContent align="end" className="w-56 max-h-48 overflow-y-auto">
                                    <SelectItem value="none">Leave Unassigned / Draft</SelectItem>
                                    {candidates.map(c => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.first_name} {c.last_name}
                                      </SelectItem>
                                    ))}
                                    {candidates.length === 0 && activeImportDrivers.map(d => (
                                      <SelectItem key={d.id} value={d.id}>
                                        {d.first_name} {d.last_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}

              {importResult && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
                      <div className="text-lg font-extrabold text-emerald-700">{importResult.imported}</div>
                      <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Imported</div>
                    </div>
                    <div className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-center">
                      <div className="text-lg font-extrabold text-rose-700">{importResult.failed}</div>
                      <div className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide">Failed</div>
                    </div>
                  </div>

                  {importResult.failed > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {importResult.results.filter(r => !r.success).map(r => (
                        <div key={r.row} className="px-3 py-1.5 text-[11px] text-slate-600">
                          <span className="font-mono font-bold text-rose-600">Row {r.row}:</span> {r.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              {importResult ? (
                <Button
                  size="sm"
                  className="text-xs font-bold bg-brand hover:bg-brand/90 text-white"
                  onClick={resetImportDialog}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={resetImportDialog}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs font-bold bg-brand hover:bg-brand/90 text-white"
                    onClick={handleConfirmImport}
                    disabled={isImporting || !importRows.length}
                  >
                    {isImporting ? 'Importing...' : `Import ${importRows.length || ''} Trip${importRows.length === 1 ? '' : 's'}`}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={async () => {
            await confirmModal.onConfirm();
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
          }}
          title={confirmModal.title}
          message={confirmModal.message}
          isDestructive={true}
        />

        {/* ── Entity Profile Preview Modals ───────────────────────────────── */}
        <VehiclePreviewModal
          vehicle={previewVehicle}
          isOpen={!!previewVehicle}
          onClose={() => setPreviewVehicle(null)}
          onEdit={(v) => setEditVehicle(v)}
        />

        <CustomerPreviewModal
          customer={previewCustomer}
          isOpen={!!previewCustomer}
          onClose={() => setPreviewCustomer(null)}
          onEdit={(c) => setEditCustomer(c)}
        />

        <ThirdPartyPreviewModal
          provider={previewThirdParty}
          isOpen={!!previewThirdParty}
          onClose={() => setPreviewThirdParty(null)}
          onEdit={(p) => setEditThirdParty(p)}
        />

        <DriverPreviewModal
          driver={previewDriver}
          isOpen={!!previewDriver}
          onClose={() => setPreviewDriver(null)}
          onEdit={(d) => setEditDriver(d)}
        />

        {/* ── Entity Profile Edit Modals ────────────────────────────────── */}
        {editCustomer && (
          <EditCustomerModal
            isOpen={!!editCustomer}
            customer={editCustomer}
            onClose={() => setEditCustomer(null)}
          />
        )}

        {editThirdParty && (
          <EditThirdPartyModal
            isOpen={!!editThirdParty}
            provider={editThirdParty}
            onClose={() => setEditThirdParty(null)}
          />
        )}

        {editDriver && (
          <EditDriverModal
            isOpen={!!editDriver}
            driver={editDriver}
            onClose={() => setEditDriver(null)}
          />
        )}

        {editVehicle && (
          <EditVehicleModal
            isOpen={!!editVehicle}
            vehicle={editVehicle}
            onClose={() => setEditVehicle(null)}
          />
        )}

        {/* ── Entity Profile Creation Modals ──────────────────────────────── */}
        <CreateVehicleModal
          isOpen={isCreateVehicleOpen}
          onClose={() => setIsCreateVehicleOpen(false)}
        />

        <CreateCustomerModal
          isOpen={isCreateCustomerOpen}
          onClose={() => setIsCreateCustomerOpen(false)}
        />

        <CreateDriverModal
          isOpen={isCreateDriverOpen}
          onClose={() => setIsCreateDriverOpen(false)}
        />

        {/* ── Status Transition Confirmation Modal ──────────────────────────── */}
        <ConfirmModal
          isOpen={statusConfirmModal.isOpen}
          onClose={() => setStatusConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={handleConfirmKanbanStatusChange}
          title={statusConfirmModal.title}
          message={statusConfirmModal.message}
          confirmLabel={statusConfirmModal.confirmLabel}
          isLoading={statusConfirmModal.isLoading}
        />

        {/* ── Post-Trip Financial Settlement & Extra Charges Modal ─────────── */}
        <PostTripSettlementModal
          isOpen={!!settlementModalTrip}
          onClose={() => setSettlementModalTrip(null)}
          trip={settlementModalTrip}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
            toast.success('Financial settlement & charges updated successfully');
          }}
        />

        <PastDateTripConfirmModal
          open={pastDateModalOpen}
          onClose={() => setPastDateModalOpen(false)}
          onConfirm={handlePastDateImportConfirm}
          analysis={pastDateAnalysis}
          isSubmitting={isImporting}
        />
      </div>
    </DashboardLayout>

  );
}
