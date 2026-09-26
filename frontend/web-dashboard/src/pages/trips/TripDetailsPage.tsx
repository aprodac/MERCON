import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Copy, Check, CheckCircle2, XCircle, AlertTriangle, MoreHorizontal, MapPin, ArrowRight,
  CalendarClock, Repeat, Receipt, FileText, Clock, ChevronDown, Navigation, Image as ImageIcon,
  User as UserIcon, Truck, UploadCloud, SquarePen, X, Coins, ListOrdered,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import ConfirmModal from '@/components/ui/ConfirmModal';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useTripWhatsAppShare } from '@/hooks/useTripWhatsAppShare';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  tripService, TripStatus,
  type TripChargeInput, type Trip,
} from '@/services/tripService';
import TripChargeLineEditor from '@/components/trips/TripChargeLineEditor';
import { ReassignTripModal, ReassignMode } from '@/components/trips/ReassignTripModal';
import { documentService, type DocType } from '@/services/documentService';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { computeTripFinancials } from '@/utils/financialCalculations';

import TripMap from '@/components/maps/live/TripMap';
import TripStopsPanel from '@/components/trips/details/TripStopsPanel';
import { Banner, FinancialSummary, PaperworkSection, PreTripChecks, TripSummary, TruckDriverOverlay } from '@/components/trips/details/TripDetailsBits';
import { statusChip, tripPhaseOf } from '@/components/trips/details/tripStatus';
import { fleetLiveService } from '@/services/fleetLiveService';
import { buildEtaShareText, formatDuration, type EtaInfo } from '@/lib/fleetLive';
import { whatsAppLink } from '@/lib/share';
import { operatorInboxService, type DriverUpdate } from '@/services/operatorInboxService';
import { ShareUpdateDialog } from '@/components/dashboard/inbox/ShareUpdateDialog';
import { updateTitle } from '@/components/dashboard/inbox/inboxText';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';

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
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);

  // Central WhatsApp Share Hook
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
    queryFn: () => documentService.getAll({ entity_type: 'Trip', entity_id: tripEntityId, per_page: 200 }),
    enabled: !!tripEntityId && !!trip,
    refetchInterval: 5000,
  });
  const documents = docsRes?.data || [];

  // Same query (and cache) as the map — phase, pre-trip checks, distance driven.
  // ETA as the map worked it out, and this trip's driver photo batches — for the Share menu.
  const [mapEta, setMapEta] = useState<EtaInfo | null>(null);
  const [sharingUpdate, setSharingUpdate] = useState<DriverUpdate | null>(null);
  const { data: tripUpdatesRes } = useQuery({
    queryKey: ['operator-inbox', 'trip-driver-updates', tripEntityId],
    queryFn: () => operatorInboxService.getTripDriverUpdates(tripEntityId!),
    enabled: !!tripEntityId && !!trip,
  });
  const tripUpdates = tripUpdatesRes?.updates ?? [];

  const { data: overview } = useQuery({
    queryKey: ['trip-overview', tripEntityId],
    queryFn: () => fleetLiveService.getTripOverview(tripEntityId!),
    enabled: !!tripEntityId && !!trip,
  });

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

  const driverPayout = fin.primaryDriverPayout;
  const extraDriverPayment = Number(tAny.extra_driver_payment ?? 0);
  const totalAmount = fin.totalCustomerBilling;
  const paidAmount = Number(tAny.paid_amount ?? 0);
  const balanceDue = Number(tAny.balance_due ?? (totalAmount - paidAmount));
  const balanceMargin = fin.balanceMargin;
  const marginPercent = `${fin.marginPercent.toFixed(1)}`;

  // Trip Type (pure derivation — preserves invariant 22 hook count across all renders)
  const tripType = deriveTripType(trip);

  const stopsArr = trip.stops || [];

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

  const chip = statusChip(trip.status);
  const phase = overview?.phase ?? tripPhaseOf(trip.status);
  const formatTime = (iso: string) => formatInDeploymentTz(iso, tz, 'HH:mm');
  const formatDateTime = (iso: string) => formatInDeploymentTz(iso, tz, 'dd MMM, HH:mm');
  const formatDate = (iso: string) => formatInDeploymentTz(iso, tz, 'dd MMM yyyy');

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
  const createdDateStr = createdDateRaw ? formatInDeploymentTz(createdDateRaw, tz, 'MMM dd, yyyy') : '';

  const shareEta = () => {
    if (!overview?.unit || !mapEta) return;
    const text = buildEtaShareText(overview.unit, mapEta, (d) => formatTime(d.toISOString()));
    window.open(whatsAppLink(null, text), '_blank', 'noopener');
  };

  // One short phrase beside the status: what matters about the trip right now.
  const headingTo = stopsArr.find((s: any) => !s.actual_arrival);
  const delayReason = headingTo?.delay_note || (headingTo?.delay_reason ? String(headingTo.delay_reason).replace(/([a-z])([A-Z])/g, '$1 $2') : null);
  const statePhrase = (() => {
    if (phase === 'planned') {
      if (!trip.planned_start) return null;
      const ms = new Date(trip.planned_start).getTime() - Date.now();
      return ms > 0 ? `Starts in ${formatDuration(ms / 1000)}` : 'Start time has passed';
    }
    if (phase === 'active') return headingTo ? `Heading to ${resolveStopName(headingTo, 'the next stop')}` : 'At the last stop';
    if (phase === 'done') return trip.actual_end ? `Finished ${formatDateTime(trip.actual_end)}` : null;
    return null;
  })();

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
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4 px-3 pt-1 pb-24 sm:px-6">
        {/* Header: identity and key facts left; actions and the money right; stop progress along the bottom */}
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
            <div className="flex min-w-0 flex-col justify-between gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3.5">
                  <CustomerMark name={trip.customer?.name} logoUrl={trip.customer?.logo_url} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">{trip.ref_id || trip.id}</h1>
                      <button type="button" onClick={handleCopyId} aria-label="Copy trip number" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', chip.className)}>
                        <span className={cn('size-1.5 rounded-full', chip.dot)} />
                        {chip.label}
                      </span>
                      {statePhrase && <span className="text-sm text-muted-foreground">{statePhrase}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-foreground">{trip.customer?.name ?? 'No customer'}</p>
                    <RouteChain names={stopsArr.map((st: any, i: number) => resolveStopName(st, `Stop ${i + 1}`))} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-9 gap-1.5 rounded-xl bg-[#25D366] px-3 font-semibold text-white hover:bg-[#1ebe5b]">
                        <WhatsAppIcon className="size-4" /> Share <ChevronDown className="size-3.5 opacity-80" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem onClick={() => openWhatsappShare([trip])}>
                        <FileText size={14} className="mr-2 text-muted-foreground" /> Trip details
                      </DropdownMenuItem>
                      {phase === 'active' && (
                        <DropdownMenuItem onClick={shareEta} disabled={!mapEta?.arrival}>
                          <Navigation size={14} className="mr-2 text-muted-foreground" /> ETA{mapEta?.arrival ? ` · ${formatTime(mapEta.arrival.toISOString())}` : ' (working it out…)'}
                        </DropdownMenuItem>
                      )}
                      {tripUpdates.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <p className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">Driver photos and videos</p>
                          {tripUpdates.map((u) => (
                            <DropdownMenuItem key={u.key} onClick={() => setSharingUpdate(u)}>
                              <ImageIcon size={14} className="mr-2 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate">{updateTitle(u).replace(`${trip.ref_id} · `, '')}</span>
                              {u.unsent_count > 0
                                ? <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-700">{u.unsent_count} new</span>
                                : <Check size={12} className="ml-2 text-emerald-600" />}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/trips/${trip.id}/edit`)} className="h-9 gap-1.5 rounded-xl px-3">
                    <SquarePen className="size-4" /> Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-9 rounded-xl" aria-label="More actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {getNextStatus(trip.status) && (
                        <DropdownMenuItem onClick={() => { setNextStatus(nextStatusOption); setIsStatusModalOpen(true); }}>
                          <CheckCircle2 size={14} className="mr-2 text-emerald-600" /> Advance to {nextStatusOption}
                        </DropdownMenuItem>
                      )}
                      {/* A finished trip keeps its driver and truck — the server refuses a change too. */}
                      {canCancel && (
                        <>
                          <DropdownMenuItem onClick={() => handleOpenReassign('driver')}>
                            <UserIcon size={14} className="mr-2 text-muted-foreground" /> Reassign driver
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenReassign('truck')}>
                            <Truck size={14} className="mr-2 text-muted-foreground" /> Reassign truck
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onClick={() => setIsLaborModalOpen(true)}>
                        <Coins size={14} className="mr-2 text-muted-foreground" /> Additional charges
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setUploadDocType(undefined); setIsUploadModalOpen(true); }}>
                        <UploadCloud size={14} className="mr-2 text-muted-foreground" /> Upload document
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsActivityLogOpen(true)}>
                        <ListOrdered size={14} className="mr-2 text-muted-foreground" /> Activity log
                      </DropdownMenuItem>
                      {canCancel && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setIsCancelModalOpen(true)} className="text-rose-600">
                            <XCircle size={14} className="mr-2" /> Cancel trip
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-5 gap-y-2.5">
                <Fact icon={CalendarClock} tone="blue" label="Scheduled" value={`${fullScheduledDateText}, ${scheduledTimeStr}`} />
                <Fact icon={Repeat} tone="violet" label="Line type" value={tripType} />
                <Fact icon={Receipt} tone="amber" label="Billing" value={billingTypeLabel} />
                {trip.awb_number && <Fact icon={FileText} tone="slate" label="AWB" value={trip.awb_number} mono />}
                {createdDateStr && <Fact icon={Clock} tone="slate" label="Created" value={createdDateStr} />}
              </dl>
            </div>

            <div className="border-t border-black/[0.06] lg:border-t-0 lg:border-l dark:border-white/10">
              <FinancialSummary
                f={{
                billing: totalAmount,
                driverPayout,
                coDriverPayout: coDriverPayoutRaw,
                charges: chargesTotal,
                chargesCount: chargesList.length,
                margin: balanceMargin,
                marginPercent,
                paid: paidAmount,
                balanceDue,
                is3PL,
                isMonthly: fin.isMonthly,
                monthlyRate: fin.monthlyRate,
                quotationName: (trip as any).quotation?.name || (trip as any).rateCard?.name || tAny.quotation_name || null,
              }}
                onCharges={() => setIsLaborModalOpen(true)}
              />
            </div>
          </div>
          <StopProgress stops={stopsArr} phase={phase} names={stopsArr.map((st: any, i: number) => resolveStopName(st, `Stop ${i + 1}`))} />
        </div>

        {/* Everything important fits on one screen: map (with truck and driver on it) left;
            money and stops right. Both change with the trip's state. */}
        <div className="grid gap-4 lg:h-[calc(100vh-21rem)] lg:min-h-[420px] lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,1fr)]">
          <div className="h-[460px] overflow-hidden rounded-2xl border border-black/[0.06] shadow-sm lg:h-full dark:border-white/10">
            <TripMap
              tripId={trip.id}
              onEta={setMapEta}
              overlay={<TruckDriverOverlay trip={trip} overview={overview} truckLabel={truckDisplayLabel} onReassign={handleOpenReassign} />}
            />
          </div>
          <div className="min-h-0 lg:h-full">
            <div className="h-[520px] min-h-0 lg:h-full">
              <TripStopsPanel
                trip={trip}
                phase={phase}
                documents={documents}
                formatTime={formatTime}
                formatDateTime={formatDateTime}
                onEvidenceUpdated={() => {
                  refetch();
                  refetchDocuments();
                  queryClient.invalidateQueries({ queryKey: ['operator-inbox', 'trip-driver-updates', trip.id] });
                }}
                top={
                  phase === 'planned' ? (overview?.checks ? <PreTripChecks checks={overview.checks} formatDate={formatDate} /> : null)
                  : phase === 'done' ? <TripSummary trip={trip} overview={overview} formatDateTime={formatDateTime} />
                  : phase === 'cancelled' ? <Banner tone="muted">Cancelled{trip.updatedAt ? ` on ${formatDateTime(trip.updatedAt)}` : ''}. The planned route is shown for reference.</Banner>
                  : trip.status === 'Delayed' ? <Banner tone="danger"><strong>Delayed.</strong> {delayReason ?? 'No reason reported yet.'}</Banner>
                  : null
                }
                bottom={
                  <PaperworkSection
                    documents={documents}
                    onUpload={() => { setUploadDocType(undefined); setIsUploadModalOpen(true); }}
                    onActivity={() => setIsActivityLogOpen(true)}
                  />
                }
              />
            </div>
          </div>
        </div>
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-strong/50 backdrop-blur-xs p-4 animate-fade-in">
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

      {sharingUpdate && (
        <ShareUpdateDialog update={sharingUpdate} apiAvailable={!!tripUpdatesRes?.whatsapp_api_available} onClose={() => setSharingUpdate(null)} />
      )}

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
    </DashboardLayout>
  );
}

/** Customer logo, or their initials, beside the trip number. */
function CustomerMark({ name, logoUrl }: { name?: string | null; logoUrl?: string | null }) {
  const initials = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '—';
  return logoUrl ? (
    <img src={resolveFileUrl(logoUrl)} alt="" className="size-12 shrink-0 rounded-xl border border-black/[0.06] bg-white object-contain p-1 dark:border-white/10" />
  ) : (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-sm font-semibold text-brand">{initials}</span>
  );
}

/** "Airport → Medina → Jeddah", shortened to first → +N → last when long. */
function RouteChain({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.length <= 3 ? names : [names[0], `+${names.length - 2} stops`, names[names.length - 1]];
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <MapPin className="size-3.5 shrink-0 text-brand" />
      {shown.map((n, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ArrowRight className="size-3 shrink-0" />}
          <span className={cn('truncate', n.startsWith('+') ? 'rounded-md bg-muted px-1.5' : 'text-foreground')}>{n}</span>
        </span>
      ))}
    </div>
  );
}

const FACT_TONE = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
} as const;

function Fact({ icon: Icon, tone, label, value, mono }: { icon: typeof Clock; tone: keyof typeof FACT_TONE; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', FACT_TONE[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
        <dd className={cn('truncate text-[13px] leading-tight font-medium text-foreground', mono && 'font-mono')}>{value}</dd>
      </div>
    </div>
  );
}

/** One segment per stop along the header's bottom edge: done, next, still to go. */
function StopProgress({ stops, phase, names }: { stops: any[]; phase: 'planned' | 'active' | 'done' | 'cancelled'; names: string[] }) {
  if (stops.length === 0) return null;
  const nextIdx = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const done = stops.filter((s) => s.actual_arrival).length;
  const caption =
    phase === 'planned' ? `${stops.length} stops planned`
    : phase === 'cancelled' ? 'Cancelled'
    : phase === 'done' ? `All ${stops.length} stops done`
    : `${done} of ${stops.length} stops done${nextIdx >= 0 ? ` · next: ${names[nextIdx]}` : ''}`;
  return (
    <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-2.5 dark:border-white/10">
      <div className="flex flex-1 gap-1">
        {stops.map((s, i) => (
          <span
            key={s.id ?? i}
            title={names[i]}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              phase === 'cancelled' ? 'bg-stone-300 dark:bg-stone-700'
              : phase === 'planned' ? 'bg-violet-200 dark:bg-violet-900'
              : phase === 'done' || s.actual_arrival ? 'bg-emerald-500'
              : i === nextIdx ? 'animate-pulse bg-blue-500'
              : 'bg-slate-200 dark:bg-slate-700',
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}
