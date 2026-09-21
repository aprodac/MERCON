import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronDown, Copy, Check, RefreshCcw,
  Navigation, CheckCircle2, XCircle, AlertTriangle,
  User as UserIcon, Truck, UploadCloud, SquarePen,
  X, Eye, Maximize2, Coins, ListOrdered, Map as MapIcon,
  MapPin, Repeat, Calendar, Clock, Building2, ArrowRight
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import ConfirmModal from '@/components/ui/ConfirmModal';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import TripLiveMapCard from '@/components/maps/TripLiveMapCard';
import {
  tripService, TripStatus,
  type TripChargeInput, type Trip,
} from '@/services/tripService';
import TripChargeLineEditor from '@/components/trips/TripChargeLineEditor';
import { ReassignTripModal, ReassignMode } from '@/components/trips/ReassignTripModal';
import { documentService, type DocType } from '@/services/documentService';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { computeTripFinancials } from '@/utils/financialCalculations';

// Subcomponents for the Image 2 Layout
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import TripOverviewBarCard from '@/components/trips/TripOverviewBarCard';
import ModernFinancialsCard from '@/components/trips/ModernFinancialsCard';
import TripPhotoEvidence, { PhotoPreviewItem } from '@/components/trips/TripPhotoEvidence';
import GeotagEvidenceCard from '@/components/trips/GeotagEvidenceCard';

const isUuidVal = (str?: string | null) =>
  str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false;

function resolveStopName(stop: any, fallback: string): string {
  if (!stop) return fallback;
  const locName = !isUuidVal(stop.location?.name) ? stop.location?.name?.trim() : null;
  const locAddress = !isUuidVal(stop.location?.address) ? stop.location?.address?.trim() : (!isUuidVal(stop.location_address) ? stop.location_address?.trim() : null);
  const locCity = !isUuidVal(stop.location?.city) ? stop.location?.city?.trim() : null;
  const rawLocName = !isUuidVal(stop.location_name) ? stop.location_name?.trim() : null;
  const rawSourceLabel = !isUuidVal(stop.source_label) ? stop.source_label?.trim() : null;
  const rawName = !isUuidVal(stop.name) ? stop.name?.trim() : null;
  const code = stop.location?.code?.trim();

  let base = locName || rawLocName || rawSourceLabel || rawName || code || fallback;
  base = String(base).replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').replace(/\s*\(\s*\)$/, '').trim() || fallback;

  let detail = (locCity && locCity !== base) ? locCity : (locAddress && locAddress !== base ? locAddress : null);
  if (detail && detail.length > 0 && !detail.startsWith('(')) {
    return `${base} (${detail})`;
  }
  return base;
}

const chargesToInputs = (charges: Trip['charges']): TripChargeInput[] =>
  (charges || []).map((c) => ({
    surchargeRuleId: c.surchargeRuleId,
    charge_type: c.charge_type,
    unit: c.unit,
    rate: c.rate,
    quantity: c.quantity,
    amount: c.amount,
  }));

function deriveTripType(trip: any): string {
  if (!trip) return 'Single Trip';
  const raw = trip.quotation_line_type || (trip as any).line_type || (trip as any).trip_type || trip.rateCard?.rate_category;
  if (raw) {
    const s = String(raw).trim();
    if (/round/i.test(s)) return 'Round Trip';
    if (/single/i.test(s) || /one.?way/i.test(s)) return 'Single Trip';
    if (/10.?hour/i.test(s)) return '10 Hours Duty';
    if (/12.?hour/i.test(s)) return '12 Hours Duty';
    return s;
  }
  const stops = Array.isArray(trip.stops) ? trip.stops : [];
  if (stops.length >= 3) {
    const firstCity = String(stops[0]?.location_name || stops[0]?.location?.name || '').toLowerCase().trim();
    const lastCity = String(stops[stops.length - 1]?.location_name || stops[stops.length - 1]?.location?.name || '').toLowerCase().trim();
    if (firstCity && lastCity && firstCity === lastCity) {
      return 'Round Trip';
    }
    if (stops.some((s: any) => s && (s.is_return || s.leg_index === 1))) {
      return 'Round Trip';
    }
  }
  return 'Single Trip';
}

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  // Modal States
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<TripStatus>('Draft');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<DocType | undefined>(undefined);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignMode, setReassignMode] = useState<ReassignMode>('driver');
  const [isExpandMapOpen, setIsExpandMapOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<PhotoPreviewItem | null>(null);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);

  // Fetch Trip
  const { data: trip, isLoading, isError, refetch } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => tripService.getById(id!),
    enabled: !!id && id !== 'undefined' && id !== 'null',
    refetchInterval: 10000,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404 || error?.response?.status === 400) return false;
      return failureCount < 1;
    },
  });

  const tripEntityId = trip?.id || id;

  // Trip documents
  const { data: docsRes, refetch: refetchDocuments } = useQuery({
    queryKey: ['documents', 'Trip', tripEntityId],
    queryFn: () => documentService.getAll({ entity_type: 'Trip', entity_id: tripEntityId, per_page: 50 }),
    enabled: !!tripEntityId && !!trip,
    refetchInterval: 5000,
  });
  const documents = docsRes?.data || [];

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: (status: TripStatus) => tripService.updateStatus(tripEntityId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripEntityId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setIsStatusModalOpen(false);
      setIsCancelModalOpen(false);
    },
  });

  const [chargeLines, setChargeLines] = useState<TripChargeInput[]>(chargesToInputs(trip?.charges));
  useEffect(() => {
    if (trip?.charges) {
      setChargeLines(chargesToInputs(trip.charges));
    }
  }, [trip?.charges, isLaborModalOpen]);

  const updateLaborMutation = useMutation({
    mutationFn: (payload: { charges: TripChargeInput[] }) =>
      tripService.updateFinancials(tripEntityId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripEntityId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setIsLaborModalOpen(false);
    },
  });

  const handleCopyId = async () => {
    if (!trip) return;
    try {
      await navigator.clipboard.writeText(trip.ref_id || trip.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleOpenReassign = (mode: ReassignMode) => {
    setReassignMode(mode);
    setIsReassignModalOpen(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout active="Trips" title="Trip Details">
        <div className="h-full flex flex-col justify-between p-4 space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
          <Skeleton className="flex-1 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !trip) {
    return (
      <DashboardLayout active="Trips" title="Trip Details">
        <div className="h-full flex flex-col items-center justify-center text-center gap-3 p-4">
          <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
          <h2 className="text-lg font-bold text-[#1F2937]">Trip Not Found</h2>
          <p className="text-xs text-slate-500 max-w-sm">
            The requested trip could not be loaded or does not exist.
          </p>
          <div className="flex items-center gap-2">
            <Link to="/trips">
              <Button size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white">
                Back to Trips
              </Button>
            </Link>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Helpers
  const getNextStatus = (current: TripStatus): TripStatus | null => {
    switch (current) {
      case 'Draft': return 'Dispatched';
      case 'Dispatched': return 'AtPickup';
      case 'AtPickup': return 'InTransit';
      case 'InTransit': return 'AtDelivery';
      case 'AtDelivery': return 'Completed';
      case 'Completed': return 'Invoiced';
      default: return null;
    }
  };

  const nextStatusOption = getNextStatus(trip.status) || 'AtDelivery';
  const canCancel = !['Completed', 'Invoiced', 'Cancelled'].includes(trip.status);

  // Financials & Economics (Single Source of Truth)
  const tAny = trip as any;
  const coDriverPayoutRaw = Number(tAny.co_driver_payout ?? 0);
  const rawBilling = Number(trip.billing_amount || trip.applied_rate || trip.rateCard?.base_price || tAny.quotation?.rate || 0);
  const rawDriverPayout = Number(tAny.primary_driver_payout ?? tAny.driver_payout ?? tAny.driver_charge ?? tAny.trip_charges ?? tAny.rateCard?.driver_payout ?? tAny.quotation?.driver_payout ?? coDriverPayoutRaw ?? 0);
  const chargesList = trip.charges || [];
  const chargesTotal = Number(tAny.charges_total ?? chargesList.reduce((sum, c: any) => sum + Number(c.amount || 0), 0));
  const is3PL = Boolean(trip.is_third_party);
  const subcontractCost = trip.third_party_cost;

  const fin = computeTripFinancials({
    customerBilling: rawBilling,
    monthlyRate: tAny.quotation?.rate,
    driverPayout: rawDriverPayout,
    coDriverPayout: coDriverPayoutRaw,
    quotationDriverPayout: tAny.quotation?.driver_payout,
    is3PL,
    subcontractCost,
    extraDriverPayment: tAny.extra_driver_payment,
    additionalCharges: chargesTotal,
    pricingBasis: tAny.quotation?.pricing_basis || tAny.pricing_basis,
  });

  const customerBilling = fin.resolvedBilling;
  const driverPayout = fin.primaryDriverPayout;
  const coDriverName = tAny.coDriver
    ? `${tAny.coDriver.first_name || ''} ${tAny.coDriver.last_name || ''}`.trim() || null
    : null;
  const extraDriverPayment = Number(tAny.extra_driver_payment ?? 0);
  const totalAmount = fin.totalCustomerBilling;
  const paidAmount = Number(tAny.paid_amount ?? 0);
  const balanceDue = Number(tAny.balance_due ?? (totalAmount - paidAmount));
  const balanceMargin = fin.balanceMargin;
  const marginPercent = `${fin.marginPercent.toFixed(1)}`;

  // Trip Type (pure derivation — preserves invariant 22 hook count across all renders)
  const tripType = deriveTripType(trip);

  const stopsArr = trip.stops || [];
  const pickup = stopsArr.length > 0 ? stopsArr[0] : undefined;
  const outboundStops = stopsArr.filter((s: any) => (s.leg_index ?? 0) === 0);

  const dropoff = outboundStops.length > 1
    ? outboundStops[outboundStops.length - 1]
    : (stopsArr.length > 1 ? stopsArr[stopsArr.length - 1] : undefined);

  const pickupCityName = pickup ? resolveStopName(pickup, 'Riyadh') : 'Riyadh';
  const dropoffCityName = dropoff ? resolveStopName(dropoff, 'Al Abha') : 'Al Abha';
  const routeLabel = tripType === 'Round Trip'
    ? `${pickupCityName} → ${dropoffCityName} · Round Trip`
    : `${pickupCityName} → ${dropoffCityName}`;

  // Derived Billing & Vehicle details for section-wise tag badges
  const rawBillingType = (trip as any).quotation?.pricing_basis || (trip as any).pricing_basis || (trip as any).billing_type;
  let billingTypeLabel = 'Single Trip Rate';
  if (fin.isMonthly) {
    billingTypeLabel = 'Monthly Contract';
  } else if (rawBillingType === 'Extra') {
    billingTypeLabel = 'Extra Trip Billing';
  } else if (trip.quotationId) {
    billingTypeLabel = 'Quotation Rate';
  }

  const truckPlate = trip.is_third_party
    ? trip.third_party_vehicle_plate
    : trip.vehicle?.plate_number;
  const rawTonClass = (trip as any).financials?.quotation_vehicle_class
    || (trip as any).quotation_vehicle_class
    || (trip.vehicle?.capacity_kg ? `${Math.round(trip.vehicle.capacity_kg / 1000)} TON` : null)
    || trip.rateCard?.vehicle_type
    || trip.vehicle_type;

  let truckDisplayLabel = 'Unassigned Vehicle';
  if (trip.is_third_party) {
    truckDisplayLabel = `3PL: ${truckPlate || 'Subcontractor'}`;
  } else if (truckPlate) {
    truckDisplayLabel = rawTonClass ? `${truckPlate} (${rawTonClass})` : truckPlate;
  } else if (rawTonClass) {
    truckDisplayLabel = `Class: ${rawTonClass}`;
  }

  // Status Badge Helper
  const getStatusBadgeProps = (statusRaw: string) => {
    const s = (statusRaw || '').trim().toLowerCase();
    if (s === 'draft' || s === 'scheduled') {
      return {
        label: 'SCHEDULED',
        badgeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
        dotClass: 'bg-indigo-600',
      };
    }
    if (s === 'loading' || s === 'atpickup') {
      return {
        label: 'LOADING',
        badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200/80',
        dotClass: 'bg-sky-600',
      };
    }
    if (s === 'intransit' || s === 'dispatched') {
      return {
        label: 'IN TRANSIT',
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200/80',
        dotClass: 'bg-amber-600',
      };
    }
    if (s === 'delayed') {
      return {
        label: 'DELAYED',
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200/80',
        dotClass: 'bg-rose-600',
      };
    }
    if (s === 'completed' || s === 'atdelivery') {
      return {
        label: 'COMPLETED',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
        dotClass: 'bg-emerald-600',
      };
    }
    if (s === 'invoiced' || s === 'paid') {
      return {
        label: 'INVOICED',
        badgeClass: 'bg-purple-50 text-purple-700 border border-purple-200/80',
        dotClass: 'bg-purple-600',
      };
    }
    if (s === 'cancelled') {
      return {
        label: 'CANCELLED',
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200/80',
        dotClass: 'bg-slate-500',
      };
    }
    return {
      label: statusRaw.toUpperCase(),
      badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200/80',
      dotClass: 'bg-slate-500',
    };
  };

  const statusProps = getStatusBadgeProps(trip.status);

  // Date metadata: Scheduled vs Created
  const scheduledDateRaw = trip.planned_start || (trip.stops && trip.stops.length > 0 ? trip.stops[0].planned_arrival : null) || trip.createdAt;

  const scheduledDayName = scheduledDateRaw
    ? formatInDeploymentTz(scheduledDateRaw, tz, 'EEE')
    : '';
  const scheduledDateStr = scheduledDateRaw
    ? formatInDeploymentTz(scheduledDateRaw, tz, 'MMM dd, yyyy')
    : 'Sep 12, 2026';
  const scheduledTimeStr = scheduledDateRaw
    ? formatInDeploymentTz(scheduledDateRaw, tz, 'hh:mm a')
    : '04:05 PM';

  const fullScheduledDateText = scheduledDayName
    ? `${scheduledDayName}, ${scheduledDateStr}`
    : scheduledDateStr;

  const createdDateRaw = trip.createdAt || (trip as any).created_at;
  const createdDayName = createdDateRaw ? formatInDeploymentTz(createdDateRaw, tz, 'EEE') : '';
  const createdDateStr = createdDateRaw ? formatInDeploymentTz(createdDateRaw, tz, 'MMM dd, yyyy') : '';
  const createdTimeStr = createdDateRaw ? formatInDeploymentTz(createdDateRaw, tz, 'hh:mm a') : '';
  const fullCreatedDateText = createdDayName ? `${createdDayName}, ${createdDateStr}` : createdDateStr;

  const handleShareWhatsApp = () => {
    if (!trip) return;
    const pickupLoc = pickup ? resolveStopName(pickup, 'Pickup') : 'Pickup';
    const dropoffLoc = dropoff ? resolveStopName(dropoff, 'Dropoff') : 'Dropoff';
    const driverName = trip.is_third_party
      ? trip.third_party_driver_name || 'Assigned Driver'
      : trip.driver
      ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim() || 'Assigned Driver'
      : 'Assigned Driver';
    const vehicleInfo = trip.is_third_party
      ? trip.third_party_vehicle_plate || 'Assigned Vehicle'
      : trip.vehicle
      ? trip.vehicle.plate_number
      : 'Assigned Vehicle';
    const etaText = trip.planned_end
      ? formatInDeploymentTz(trip.planned_end, tz, 'dd MMM yyyy, hh:mm a')
      : 'On Schedule';
    const createdText = trip.createdAt
      ? formatInDeploymentTz(trip.createdAt, tz, 'dd MMM yyyy, hh:mm a')
      : 'N/A';
    const scheduledText = `${fullScheduledDateText} | ${scheduledTimeStr}`;

    const text = [
      `*MERCON Logistics - Trip Status Update*`,
      ``,
      `*Trip ID:* ${trip.ref_id || trip.id}`,
      `*Customer:* ${trip.customer?.name || 'Customer'}`,
      `*Status:* ${(trip.status === 'Draft' || trip.status === 'Scheduled') ? 'SCHEDULED' : trip.status.toUpperCase()}`,
      `*Scheduled:* ${scheduledText}`,
      `*Created:* ${createdText}`,
      ``,
      `*Pickup:* ${pickupLoc}`,
      `*Drop-off:* ${dropoffLoc}`,
      `*ETA:* ${etaText}`,
      ``,
      `*Driver:* ${driverName}`,
      `*Vehicle:* ${vehicleInfo}`,
      ``,
      `Thank you for shipping with MERCON Logistics!`,
    ].join('\n');

    const cleanPhone = trip.customer?.contact_phone?.replace(/[^0-9]/g, '');
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Dynamically build real activity steps from trip metadata and actual stops
  const activitySteps: { label: string; time: string | null; done: boolean }[] = [
    {
      label: 'Trip created',
      time: trip.createdAt ? formatInDeploymentTz(trip.createdAt, tz, 'dd MMM yyyy, hh:mm a') : null,
      done: true,
    },
  ];

  if (trip.actual_start) {
    activitySteps.push({
      label: 'Trip started (In Transit)',
      time: formatInDeploymentTz(trip.actual_start, tz, 'dd MMM yyyy, hh:mm a'),
      done: true,
    });
  }

  (trip.stops || []).forEach((stop: any, idx: number) => {
    const stopName = resolveStopName(stop, `Stop ${idx + 1}`);
    const isArrived = !!stop.actual_arrival;
    const isDeparted = !!stop.actual_departure;

    activitySteps.push({
      label: isArrived ? `Arrived at ${stopName}` : `Planned arrival at ${stopName}`,
      time: isArrived
        ? formatInDeploymentTz(stop.actual_arrival, tz, 'dd MMM yyyy, hh:mm a')
        : stop.planned_arrival
        ? formatInDeploymentTz(stop.planned_arrival, tz, 'dd MMM yyyy, hh:mm a')
        : null,
      done: isArrived,
    });

    if (stop.delay_reason) {
      activitySteps.push({
        label: `Delay reported at ${stopName}: ${stop.delay_note || stop.delay_reason}`,
        time: stop.delay_logged_at
          ? formatInDeploymentTz(stop.delay_logged_at, tz, 'dd MMM yyyy, hh:mm a')
          : null,
        done: true,
      });
    }

    if (isDeparted) {
      activitySteps.push({
        label: `Departed ${stopName}`,
        time: formatInDeploymentTz(stop.actual_departure, tz, 'dd MMM yyyy, hh:mm a'),
        done: true,
      });
    }
  });

  activitySteps.push({
    label: trip.status === 'Completed' ? 'Trip completed' : 'Estimated trip completion',
    time: trip.actual_end
      ? formatInDeploymentTz(trip.actual_end, tz, 'dd MMM yyyy, hh:mm a')
      : trip.planned_end
      ? formatInDeploymentTz(trip.planned_end, tz, 'dd MMM yyyy, hh:mm a')
      : null,
    done: trip.status === 'Completed',
  });

  return (
    <DashboardLayout active="Trips" title="Trip Details">
      {/* Page Layout Container — Clean, fully visible, and scrollable when needed */}
      <div className="flex flex-col gap-3 px-3 sm:px-6 pb-24 pt-0.5 max-w-[1720px] mx-auto w-full bg-[#F8FAFC]">

        {/* ── 1. STANDALONE TRIP HEADER (Directly on page, no card wrapper) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 px-1 py-1">
          {/* Left: ID, Status, Route, Metadata */}
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-mono font-black text-2xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white tracking-tight">
                {trip.ref_id || trip.id || 'TRP-0235'}
              </h1>
              <button
                type="button"
                onClick={handleCopyId}
                aria-label="Copy trip ID"
                className="text-[#9CA3AF] hover:text-[#2563EB] transition-colors p-0.5 cursor-pointer"
              >
                {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
              </button>

              {/* Status Pill Badge (Dynamic: Indigo for Scheduled, Amber for InTransit, Emerald for Completed) */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black tracking-wide ${statusProps.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusProps.dotClass}`} />
                <span>{statusProps.label}</span>
              </div>
            </div>

            {/* 4 Tags under Trip ID Header — Light background colors & bold characters */}
            <div className="flex flex-col gap-2 pt-2.5">
              {/* Row 1: 📍 Route & 🔄 Line Type */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. 📍 Route Tag (Light Coral surface + bold dark text) */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-[#FA634E]/10 dark:bg-[#FA634E]/20 text-[#0F172A] dark:text-white border border-[#FA634E]/30">
                  <MapPin size={13} className="text-[#FA634E] shrink-0" />
                  <span>{pickupCityName}</span>
                  <ArrowRight size={11} className="text-slate-500 dark:text-slate-400" />
                  <span>{dropoffCityName}</span>
                </div>

                {/* 2. 🔄 Line Type Tag (Light Purple surface + bold text) */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-purple-50 dark:bg-purple-950/60 text-purple-950 dark:text-purple-200 border border-purple-200/90 dark:border-purple-800/90">
                  <Repeat size={12} className="text-purple-600 dark:text-purple-400 shrink-0 stroke-[2.5]" />
                  <span>Line Type: {tripType}</span>
                </div>
              </div>

              {/* Row 2: 📅 Scheduled & 🕒 Created */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 3. 📅 Scheduled Date Tag (Light Blue surface + bold text) */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 dark:bg-blue-950/60 text-blue-950 dark:text-blue-200 border border-blue-200/90 dark:border-blue-800/90">
                  <Calendar size={12} className="text-blue-600 dark:text-blue-400 shrink-0 stroke-[2.5]" />
                  <span>Scheduled: {fullScheduledDateText} ({scheduledTimeStr})</span>
                </div>

                {/* 4. 🕒 Created Date Tag (Light Slate surface + bold text) */}
                {createdDateRaw && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                    <Clock size={12} className="text-slate-500 dark:text-slate-400 shrink-0 stroke-[2.5]" />
                    <span>Created: {fullCreatedDateText} {createdTimeStr ? `(${createdTimeStr})` : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Share via WhatsApp */}
            <Button
              size="sm"
              onClick={handleShareWhatsApp}
              className="h-8.5 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer border-none"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
              <span>Share via WhatsApp</span>
            </Button>

            {/* Route Monitor Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpandMapOpen(true)}
              className="h-8.5 px-3 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold gap-1.5 shadow-none cursor-pointer bg-white"
            >
              <MapIcon size={14} className="text-blue-600" />
              <span>Route Monitor</span>
            </Button>

            {/* Edit Trip Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/trips/${trip.id}/edit`)}
              className="h-8.5 px-3 rounded-xl border-[#E5E7EB] text-[#374151] hover:bg-slate-50 text-xs font-semibold gap-1.5 shadow-none cursor-pointer bg-white"
            >
              <SquarePen size={13} className="text-[#6B7280]" />
              <span>Edit</span>
            </Button>

            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 px-3 rounded-xl border-[#E5E7EB] text-[#374151] hover:bg-slate-50 text-xs font-semibold gap-1 shadow-none cursor-pointer bg-white"
                >
                  <span>More Actions</span>
                  <ChevronDown size={13} className="text-[#9CA3AF]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => { setNextStatus(nextStatusOption); setIsStatusModalOpen(true); }}>
                  <CheckCircle2 size={13} className="mr-2 text-emerald-600" /> Advance to {nextStatusOption}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenReassign('driver')}>
                  <UserIcon size={13} className="mr-2 text-[#6B7280]" /> Reassign Driver
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenReassign('truck')}>
                  <Truck size={13} className="mr-2 text-[#6B7280]" /> Reassign Truck
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsActivityLogOpen(true)}>
                  <ListOrdered size={13} className="mr-2 text-[#6B7280]" /> View Full Activity Log
                </DropdownMenuItem>
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsCancelModalOpen(true)} className="text-rose-600">
                      <XCircle size={13} className="mr-2" /> Cancel Trip
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── 2. UNIFIED OVERVIEW CARD: TRUCK, DRIVER, COMPANY, ALERTS (ALL IN ONE CARD, SAME 25% SIZE) ── */}
        <div className="shrink-0">
          <TripOverviewBarCard
            trip={trip}
            documents={documents}
            onViewAllAlerts={() => setIsActivityLogOpen(true)}
            onPreviewImage={(img) => setPreviewImage(img)}
          />
        </div>

        {/* ── 3. VISUAL ROUTE PROGRESS (Panorama Highway Banner) ── */}
        <div className="shrink-0">
          <VisualRouteProgress stops={trip.stops || []} timeline={(trip as any).route_timeline} tz={tz} tripStatus={trip.status} />
        </div>

        {/* ── 4. BOTTOM ROW: TRIP PHOTO EVIDENCE (LEFT 9 COLS) + FINANCIALS (RIGHT 3 COLS) ── */}
        <div className="grid grid-cols-12 gap-3 items-stretch">
          {/* Left Column: Trip Photo Evidence Panel (~75% / 9 Cols) */}
          <div className="col-span-12 lg:col-span-9 flex flex-col h-full">
            <TripPhotoEvidence
              documents={documents}
              stops={trip.stops}
              trip={trip}
              onPreview={(img) => setPreviewImage(img)}
              onUpload={() => {
                setUploadDocType(undefined);
                setIsUploadModalOpen(true);
              }}
              onEvidenceUpdated={() => {
                refetch();
                refetchDocuments();
              }}
            />
          </div>

          {/* Right Column: Financials Card (~25% / 3 Cols) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col h-full">
            <ModernFinancialsCard
              customerBilling={customerBilling}
              baseRate={customerBilling}
              driverPayout={driverPayout}
              coDriverPayout={coDriverPayoutRaw}
              coDriverName={coDriverName}
              is3PL={is3PL}
              additionalCharges={chargesTotal}
              additionalChargesCount={chargesList.length}
              balanceMargin={balanceMargin}
              marginPercent={marginPercent}
              totalAmount={totalAmount}
              paidAmount={paidAmount}
              balanceDue={balanceDue}
              tripType={tripType}
              quotationName={(trip as any).quotation?.name || (trip as any).rateCard?.name || tAny.quotation_name || null}
              quotationId={(trip as any).quotation?.id || (trip as any).rateCard?.id || trip.quotationId || null}
              isMonthlyContract={fin.isMonthly}
              monthlyContractRate={fin.monthlyRate}
              pricingBasis={tAny.quotation?.pricing_basis || tAny.pricing_basis}
              onAddCharge={() => setIsLaborModalOpen(true)}
              onViewBreakdown={() => setIsLaborModalOpen(true)}
            />
          </div>
        </div>

        {/* ── 5. BOTTOM STATUS BAR (Ultra-compact footer bar) ── */}

      </div>

      {/* ── ROUTE MONITOR MODAL (Full Radar Live Map) ── */}
      <Dialog open={isExpandMapOpen} onOpenChange={setIsExpandMapOpen}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden rounded-2xl border border-[#E5E7EB] shadow-2xl">
          <DialogHeader className="p-4 border-b border-[#E5E7EB] bg-white flex flex-row items-center justify-between">
            <DialogTitle className="text-sm font-bold text-[#1F2937] flex items-center gap-2">
              <MapIcon size={16} className="text-blue-600" />
              Route Monitor & Live Radar — {trip.ref_id || trip.id} ({routeLabel})
            </DialogTitle>
          </DialogHeader>
          <div className="w-full h-[650px]">
            <TripLiveMapCard
              tripId={trip.id}
              refId={trip.ref_id || trip.id}
              pickupLat={pickup?.location_lat}
              pickupLng={pickup?.location_lng}
              dropoffLat={dropoff?.location_lat}
              dropoffLng={dropoff?.location_lng}
              pickupLabel={pickup?.location_name || undefined}
              dropoffLabel={dropoff?.location_name || undefined}
              resolvedLocation={trip.vehicle?.resolved_location}
              showHeader={false}
              showTelemetryBar={true}
              mapHeightClassName="h-[650px]"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Slide-Over Sheet Drawer: Full Activity Log ── */}
      <Sheet open={isActivityLogOpen} onOpenChange={setIsActivityLogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="p-4 border-b border-[#E5E7EB] bg-slate-50/50">
            <SheetTitle className="text-sm font-bold text-[#1F2937] flex items-center gap-2">
              <ListOrdered size={16} className="text-blue-600" />
              Full Activity Log
            </SheetTitle>
            <SheetDescription className="text-xs text-[#6B7280]">
              Chronological events and alerts for {trip.ref_id || trip.id}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activitySteps.map((step, idx) => (
              <div key={idx} className="relative flex items-start gap-3">
                <div className="relative flex flex-col items-center shrink-0 w-3.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1 ${
                      step.done ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  />
                  {idx !== activitySteps.length - 1 && (
                    <div className="w-[1px] bg-[#E5E7EB] absolute top-3 bottom-[-16px]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${step.done ? 'text-[#1F2937]' : 'text-[#6B7280]'}`}>
                    {step.label}
                  </p>
                  {step.time && (
                    <p className="text-[10.5px] font-mono text-[#6B7280]">{step.time}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Status Confirmation Modal ── */}
      <ConfirmModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Trip Status"
        message={`Are you sure you want to transition this trip status to ${nextStatus}?`}
        confirmLabel="Yes, Update"
        isLoading={updateStatusMutation.isPending}
        onConfirm={() => {
          updateStatusMutation.mutate(nextStatus);
        }}
      />

      {/* ── Cancel Trip Modal ── */}
      <ConfirmModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel This Trip?"
        message="This releases the assigned driver and vehicle back to Available. This cannot be undone."
        confirmLabel="Yes, Cancel Trip"
        isDestructive
        isLoading={updateStatusMutation.isPending}
        onConfirm={() => updateStatusMutation.mutate('Cancelled')}
      />

      {/* ── Upload Document Modal ── */}
      {trip && (
        <UploadDocumentModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          entityType="Trip"
          entityId={trip.id}
          docType={uploadDocType}
          onUploadSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['trip', id] });
            queryClient.invalidateQueries({ queryKey: ['documents', 'Trip', id] });
          }}
        />
      )}

      {/* ── Reassign Trip Modal ── */}
      {trip && (
        <ReassignTripModal
          isOpen={isReassignModalOpen}
          onClose={() => setIsReassignModalOpen(false)}
          trip={trip}
          initialMode={reassignMode}
        />
      )}

      {/* ── Additional Charges Modal ── */}
      {isLaborModalOpen && trip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-[#1F2937]">Add / Edit Additional Charges</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLaborModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateLaborMutation.mutate({ charges: chargeLines });
              }}
              className="flex flex-col flex-1"
            >
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <TripChargeLineEditor
                  customerId={trip.customer?.id}
                  rateCardId={trip.rateCardId}
                  value={chargeLines}
                  onChange={setChargeLines}
                />
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E5E7EB] bg-slate-50/40">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLaborModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateLaborMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {updateLaborMutation.isPending ? 'Saving...' : 'Save Charges'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Lightbox Image Preview Modal with GPS Geotag Evidence ── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E5E7EB] flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3 shrink-0 bg-white">
              <div>
                <h3 className="text-sm font-bold text-[#1F2937]">{previewImage.title}</h3>
                {previewImage.date && (
                  <p className="text-xs text-[#6B7280]">{previewImage.date}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                >
                  {previewImage.isVideo || /\.(mp4|mov|webm|avi|mkv|3gp)(\?.*)?$/i.test(previewImage.url) ? 'Open / Download Video' : 'Open Original'}
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Container with Photo/Video + Geotag Evidence */}
            <div className="overflow-y-auto p-4 space-y-3.5">
              {/* Media Viewport (Video or Image) */}
              <div className="flex items-center justify-center bg-black/95 rounded-xl overflow-hidden min-h-[260px] max-h-[50vh] p-2">
                {previewImage.isVideo || /\.(mp4|mov|webm|avi|mkv|3gp)(\?.*)?$/i.test(previewImage.url) ? (
                  <video
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[48vh] w-auto max-w-full rounded-lg shadow-2xl bg-black"
                  >
                    <source src={previewImage.url} type="video/mp4" />
                    <source src={previewImage.url} type="video/quicktime" />
                    <source src={previewImage.url} />
                    <div className="p-4 text-center text-white space-y-2">
                      <p className="text-xs text-slate-300">Video format preview not supported directly by this browser engine.</p>
                      <a
                        href={previewImage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1.5 bg-[#FA634E] text-white font-bold rounded-lg text-xs"
                      >
                        Download / Play in External Player
                      </a>
                    </div>
                  </video>
                ) : (
                  <img
                    src={previewImage.url}
                    alt={previewImage.title}
                    className="max-h-[44vh] w-auto max-w-full object-contain rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLElement).style.opacity = '0.5';
                    }}
                  />
                )}
              </div>

              {/* GPS Geotag Evidence Card (Location, Time, Coordinates, Map) */}
              <GeotagEvidenceCard
                geotag={previewImage.geotag}
                fallbackTitle={previewImage.title}
                fallbackLocation={previewImage.location}
                fallbackDate={previewImage.date}
              />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
