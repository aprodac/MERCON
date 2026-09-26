import { useMemo, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  User,
  Calendar,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Edit3,
  TableProperties,
} from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import type { MonthlyBoardCompany, MonthlyBoardTrip } from '@/services/tripService';
import { formatDayHeading, formatMoney, formatTime, initialsOf, isUnassigned, formatLocationClean } from './monthlyBoardUtils';
import { computeMonthlyTripSearchRelevance } from './MonthlyCompanyCard';
import MonthlyGroupLedgerModal from './MonthlyGroupLedgerModal';

interface MonthlyCompanyBoardProps {
  companies: MonthlyBoardCompany[];
  selectedTripIds?: string[];
  search?: string;
  onToggleTrip?: (id: string) => void;
  onToggleCompany?: (tripIds: string[]) => void;
  onSelectTrip?: (trip: MonthlyBoardTrip) => void;
  onRefresh?: () => void;
}

export default function MonthlyCompanyBoard({
  companies,
  selectedTripIds = [],
  search = '',
  onToggleTrip,
  onToggleCompany,
  onSelectTrip,
  onRefresh,
}: MonthlyCompanyBoardProps) {
  const [activeLedgerGroup, setActiveLedgerGroup] = useState<TemplateGroup | null>(null);
  const [activeCompanyName, setActiveCompanyName] = useState<string>('');
  const [activeCompanyLogo, setActiveCompanyLogo] = useState<string | null | undefined>(null);
  const [activeCompanyAllTrips, setActiveCompanyAllTrips] = useState<MonthlyBoardTrip[]>([]);

  const handleOpenLedger = (group: TemplateGroup, company: MonthlyBoardCompany, allTrips: MonthlyBoardTrip[]) => {
    setActiveLedgerGroup(group);
    setActiveCompanyName(company.customer.name);
    setActiveCompanyLogo(company.customer.logo_url);
    setActiveCompanyAllTrips(allTrips);
  };

  return (
    <>
      <div className="w-full overflow-x-auto pb-6">
        <div className="flex gap-4 min-w-max items-start">
          {companies.map((company) => (
            <CompanyColumn
              key={company.customer.id}
              company={company}
              selectedTripIds={selectedTripIds}
              search={search}
              onToggleTrip={onToggleTrip}
              onToggleCompany={onToggleCompany}
              onSelectTrip={onSelectTrip}
              onOpenLedger={(group, trips) => handleOpenLedger(group, company, trips)}
            />
          ))}
        </div>
      </div>

      <MonthlyGroupLedgerModal
        isOpen={Boolean(activeLedgerGroup)}
        onClose={() => setActiveLedgerGroup(null)}
        group={activeLedgerGroup}
        companyName={activeCompanyName}
        companyLogo={activeCompanyLogo}
        allCompanyTrips={activeCompanyAllTrips}
        onRefresh={onRefresh}
      />
    </>
  );
}

export interface TemplateGroup {
  key: string;
  lineType: string;
  vehicleClass: string;
  origin: string;
  destination: string;
  rateStr: string;
  trips: MonthlyBoardTrip[];
  threeDayTrips: MonthlyBoardTrip[];
  otherTrips: MonthlyBoardTrip[];
}

function getThreeDayDateStrings(): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function CompanyProfileLogo({ customer }: { customer: { name: string; logo_url?: string | null } }) {
  const logoUrl = customer.logo_url;
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={customer.name}
        className="h-8 w-8 shrink-0 rounded-lg object-contain border border-slate-200 dark:border-slate-800 bg-white p-0.5 shadow-3xs"
      />
    );
  }

  return (
    <span className="h-8 w-8 shrink-0 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 grid place-items-center text-xs font-extrabold shadow-3xs">
      {initialsOf(customer.name)}
    </span>
  );
}

const TEMPLATE_PALETTES = [
  {
    border: 'border-[#FA634E]/40 dark:border-[#FA634E]/30',
    badge: 'bg-[#FA634E]/10 text-[#FA634E] dark:bg-[#FA634E]/20 dark:text-[#FA634E] border-[#FA634E]/30',
  },
  {
    border: 'border-blue-300 dark:border-blue-800',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  {
    border: 'border-purple-300 dark:border-purple-800',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  {
    border: 'border-amber-300 dark:border-amber-800',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  {
    border: 'border-emerald-300 dark:border-emerald-800',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  {
    border: 'border-indigo-300 dark:border-indigo-800',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  {
    border: 'border-teal-300 dark:border-teal-800',
    badge: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  },
];

function getTemplatePalette(index: number) {
  return TEMPLATE_PALETTES[index % TEMPLATE_PALETTES.length];
}

const CompanyColumn = memo(function CompanyColumn({
  company,
  selectedTripIds = [],
  search = '',
  onToggleTrip,
  onToggleCompany,
  onSelectTrip,
  onOpenLedger,
}: {
  company: MonthlyBoardCompany;
  selectedTripIds?: string[];
  search?: string;
  onToggleTrip?: (id: string) => void;
  onToggleCompany?: (tripIds: string[]) => void;
  onSelectTrip?: (trip: MonthlyBoardTrip) => void;
  onOpenLedger?: (group: TemplateGroup, allTrips: MonthlyBoardTrip[]) => void;
}) {
  const navigate = useNavigate();
  const handleSelectTrip = onSelectTrip || ((t: MonthlyBoardTrip) => navigate(`/trips/${t.id}`));

  const allCompanyTrips = useMemo(() => {
    const list = company.days.flatMap((day) => day.trips);

    if (!search || !search.trim()) return list;
    return list.filter((t) => computeMonthlyTripSearchRelevance(t, search) > 0);
  }, [company, search]);

  const companyTripIds = useMemo(() => allCompanyTrips.map((t) => t.id), [allCompanyTrips]);
  const unassignedCount = useMemo(() => allCompanyTrips.filter((t) => isUnassigned(t)).length, [allCompanyTrips]);

  const allSelected =
    companyTripIds.length > 0 && companyTripIds.every((id) => selectedTripIds.includes(id));
  const someSelected =
    !allSelected && companyTripIds.some((id) => selectedTripIds.includes(id));

  const templateGroups = useMemo(() => {
    const threeDayDates = getThreeDayDateStrings();
    const map = new Map<string, TemplateGroup>();

    for (const trip of allCompanyTrips) {
      const lineType = trip.rate_category || trip.billing_type || 'Single Trip';
      const vehicleClass = trip.vehicle_type || 'Standard Truck';
      const origin = formatLocationClean(trip.origin);
      const destination = formatLocationClean(trip.destination);
      const rateStr = trip.billing_amount != null ? formatMoney(trip.billing_amount, trip.currency) : '—';
      const key = `${lineType}||${vehicleClass}||${origin}→${destination}||${rateStr}`;

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          lineType,
          vehicleClass,
          origin,
          destination,
          rateStr,
          trips: [],
          threeDayTrips: [],
          otherTrips: [],
        };
        map.set(key, group);
      }
      group.trips.push(trip);
    }

    const groups: TemplateGroup[] = [];
    map.forEach((g) => {
      g.trips.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.planned_start || '').localeCompare(b.planned_start || '');
      });

      const threeDayMatches = g.trips.filter((t) => threeDayDates.some((d) => t.date.startsWith(d)));

      if (threeDayMatches.length > 0) {
        g.threeDayTrips = threeDayMatches.slice(0, 3);
        const threeDaySet = new Set(g.threeDayTrips.map((t) => t.id));
        g.otherTrips = g.trips.filter((t) => !threeDaySet.has(t.id));
      } else {
        g.threeDayTrips = g.trips.slice(0, 3);
        g.otherTrips = g.trips.slice(3);
      }

      groups.push(g);
    });

    return groups.sort((a, b) => b.trips.length - a.trips.length);
  }, [allCompanyTrips]);

  return (
    <div className="w-[340px] sm:w-[350px] shrink-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col max-h-[820px] overflow-hidden">
      {/* ── Column Header ────────────────────────────────────────────── */}
      <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {onToggleCompany && (
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={() => onToggleCompany(companyTripIds)}
                className="h-4 w-4 rounded border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 shrink-0"
                aria-label={`Select all trips for ${company.customer.name}`}
              />
            )}
            <CompanyProfileLogo customer={company.customer} />
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100 truncate leading-tight uppercase tracking-tight" title={company.customer.name}>
                {company.customer.name}
              </h3>
              <p className="text-[10px] text-slate-500 truncate mt-0.5 font-semibold">
                {company.total_billed > 0 ? formatMoney(company.total_billed) : 'Monthly Account'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="w-6 h-6 rounded-full text-xs font-black bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center justify-center shadow-3xs">
              {allCompanyTrips.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── Column Body: Template Cards ───────────────────────────────── */}
      <div className="p-3 overflow-y-auto space-y-3.5 flex-1 bg-[#EEF1F6]/50 dark:bg-slate-950/50">
        {templateGroups.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
            No scheduled trips
          </div>
        ) : (
          templateGroups.map((group, idx) => (
            <TemplateBigCard
              key={group.key}
              group={group}
              index={idx}
              selectedTripIds={selectedTripIds}
              onToggleTrip={onToggleTrip}
              onSelectTrip={handleSelectTrip}
              onOpenLedger={(g) => onOpenLedger?.(g, allCompanyTrips)}
            />
          ))
        )}
      </div>
    </div>
  );
});

/** Big Card for a specific Template (Line Type + Vehicle Class + Route + Rate) */
function TemplateBigCard({
  group,
  index = 0,
  selectedTripIds = [],
  onToggleTrip,
  onSelectTrip,
  onOpenLedger,
}: {
  group: TemplateGroup;
  index?: number;
  selectedTripIds?: string[];
  onToggleTrip?: (id: string) => void;
  onSelectTrip: (trip: MonthlyBoardTrip) => void;
  onOpenLedger?: (group: TemplateGroup) => void;
}) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const displayedTrips = isExpanded
    ? group.trips
    : group.threeDayTrips;

  const totalTrips = group.trips.length;
  const completedTrips = group.trips.filter(
    (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'invoiced'
  ).length;
  const remainingTrips = Math.max(0, totalTrips - completedTrips);
  const hiddenCount = Math.max(0, totalTrips - group.threeDayTrips.length);
  const hasMoreTrips = hiddenCount > 0;

  const lineTypeUpper = group.lineType.replace(/\s+/g, '_').toUpperCase();
  const palette = getTemplatePalette(index);

  return (
    <div className={`rounded-xl border ${palette.border} bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all flex flex-col p-2.5 gap-2`}>
      {/* ── 1. Top Row: Line Type Badge + Vehicle Class (Left) & Monthly Rate + Edit Button (Right) ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${palette.badge}`}>
            {lineTypeUpper}
          </span>
          <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            {group.vehicleClass}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Monthly Rate</p>
            <p className="text-xs font-black text-[#3E3C3D] dark:text-slate-100 mt-0.5">{group.rateStr}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenLedger?.(group)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-extrabold text-[#FA634E] bg-[#FA634E]/10 hover:bg-[#FA634E]/20 border border-[#FA634E]/30 transition-all cursor-pointer shadow-3xs"
            title="Open full ledger to edit drivers, vehicles and status"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* ── 2. Route & Stop Count ── */}
      <div className="flex flex-col gap-0.5 border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
        <div className="flex items-center gap-1.5 text-xs font-black text-[#3E3C3D] dark:text-slate-100">
          <span className="truncate max-w-[130px]" title={group.origin}>
            {formatLocationClean(group.origin)}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate max-w-[130px]" title={group.destination}>
            {formatLocationClean(group.destination)}
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">
          {group.lineType.toLowerCase().includes('round') ? '2 Stops' : '1 Stop'}
        </span>
      </div>

      {/* ── 3. Summary Metrics Bar ── */}
      <div className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 font-extrabold">
        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
          <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
          <span>{totalTrips} Trips</span>
        </span>
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>{completedTrips} Completed</span>
        </span>
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>{remainingTrips} Remaining</span>
        </span>
      </div>

      {/* ── 5. Operational Trip Preview Rows ── */}
      {displayedTrips.length > 0 && (
        <div className="flex flex-col gap-2">
          {displayedTrips.map((trip) => (
            <TripPreviewRow
              key={trip.id}
              trip={trip}
              isSelected={selectedTripIds.includes(trip.id)}
              onToggle={onToggleTrip ? () => onToggleTrip(trip.id) : undefined}
              onOpen={() => onSelectTrip(trip)}
            />
          ))}
        </div>
      )}

      {/* ── 6. Bottom Footer Link ── */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
        {hasMoreTrips ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-left text-xs font-extrabold text-purple-700 dark:text-purple-300 hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>{isExpanded ? 'Show less ▴' : `+ ${hiddenCount} more trips`}</span>
          </button>
        ) : (
          <span className="text-[10px] font-semibold text-slate-400">All trips shown</span>
        )}

        <button
          type="button"
          onClick={() => onOpenLedger?.(group)}
          className="text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:text-[#FA634E] dark:hover:text-[#FA634E] hover:underline cursor-pointer flex items-center gap-1 ml-auto"
        >
          <TableProperties className="w-3.5 h-3.5 text-slate-400" />
          <span>Edit Ledger ↗</span>
        </button>
      </div>
    </div>
  );
}

const TripPreviewRow = memo(function TripPreviewRow({
  trip,
  isSelected = false,
  onToggle,
  onOpen,
}: {
  trip: MonthlyBoardTrip;
  isSelected?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const gap = isUnassigned(trip);

  const statusLower = (trip.status || '').toLowerCase();
  let statusBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200/90 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
  if (statusLower === 'completed' || statusLower === 'invoiced') {
    statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  } else if (statusLower === 'intransit' || statusLower === 'dispatched') {
    statusBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200/90 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
  } else if (statusLower === 'cancelled' || statusLower === 'failed') {
    statusBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200/90 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
  }

  return (
    <div
      onClick={onOpen}
      className={`rounded-xl border p-2.5 bg-slate-50/90 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 shadow-3xs hover:shadow-xs transition-all cursor-pointer flex flex-col gap-1.5 ${
        isSelected
          ? 'border-purple-500 ring-1 ring-purple-500/30'
          : gap
          ? 'border-amber-200 bg-amber-50/20'
          : 'border-slate-200/90 dark:border-slate-700/80'
      }`}
    >
      {/* Top Line: Date + Time (Left) ...... TRP-0164 (Right) */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggle}
                className="h-3.5 w-3.5 rounded border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              />
            </div>
          )}
          <span className="flex items-center gap-1 font-bold text-slate-900 dark:text-slate-100">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{formatDayHeading(trip.date)}</span>
            <span className="text-slate-400 font-semibold text-[11px] ml-0.5">· {formatTime(trip.planned_start)}</span>
          </span>
        </div>

        <span className="text-xs font-mono font-extrabold text-slate-700 dark:text-slate-200 tracking-tight">
          {trip.ref_id || 'TRIP'}
        </span>
      </div>

      {/* Bottom Line: Driver Avatar + Name (Left) ...... Truck + Plate + Status Badge (Right) */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/50 gap-2">
        {/* Left: Driver Avatar + Driver Full Name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {trip.driver?.avatar_url ? (
            <img
              src={trip.driver.avatar_url}
              alt={trip.driver.name}
              className="h-5 w-5 shrink-0 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-3xs"
            />
          ) : (
            <div className="h-5 w-5 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 grid place-items-center text-[9px] font-extrabold text-slate-700 dark:text-slate-200">
              {trip.driver ? initialsOf(trip.driver.name) : 'N/A'}
            </div>
          )}
          <span
            className={`truncate font-bold ${
              trip.driver ? 'text-slate-800 dark:text-slate-200' : 'text-amber-700 dark:text-amber-400'
            }`}
            title={trip.driver?.name}
          >
            {trip.driver?.name ?? 'No Driver'}
          </span>
        </div>

        {/* Right: Truck Icon + Vehicle Plate + Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
            <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>{trip.vehicle?.plate_number ?? 'No Truck'}</span>
          </div>

          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${statusBadgeClass}`}>
            {trip.status}
          </span>
        </div>
      </div>
    </div>
  );
});
