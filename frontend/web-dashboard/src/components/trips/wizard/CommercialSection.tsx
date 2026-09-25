import React from 'react';
import { DollarSign, CheckCircle2, Plus, Tag, AlertCircle, ChevronLeft, ChevronRight, Building2, Search, X, Calendar, Zap, Layers, Pencil, Lock as LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { getAllTaxonomyOptions, normalizeCode } from '@/utils/taxonomyRegistry';
import { normalizeRateCategory, normalizeVehicleClass, normalizeBillingType } from '@/utils/taxonomyRegistry';
import { LaneRateHistoryPopover } from './LaneRateHistoryPopover';
import { DefineQuotationInlineForm } from './DefineQuotationInlineForm';
import CustomerCardCarousel from './CustomerCardCarousel';
import QuotationCardCarousel from './QuotationCardCarousel';
import { getCardId } from './QuotationRateCard';

const CITY_ALIASES: Record<string, string[]> = {
  riyadh: ['ruh', 'ryd', 'riyad', 'الرياض', 'رياض'],
  dammam: ['dmm', 'damam', 'الدمام', 'دمام'],
  jeddah: ['jed', 'jdd', 'jiddah', 'جدة', 'جده'],
  jubail: ['jub', 'jbl', 'الجبيل', 'جبيل'],
  abha: ['abh', 'ahb', 'أبها', 'ابها'],
  khobar: ['khb', 'alkhobar', 'الخبر', 'خبر'],
  hufuf: ['huf', 'hofuf', 'al hasa', 'al-hasa', 'hasa', 'الهفوف', 'الأحساء', 'احساء'],
  medina: ['med', 'madinah', 'madina', 'المدينة', 'المدينة المنورة'],
  mecca: ['makkah', 'mecca', 'مكة', 'مكة المكرمة'],
  tabuk: ['tbk', 'tabouk', 'تبوك'],
  jizan: ['gzan', 'jizan', 'jazan', 'جيزان', 'جازان'],
  khamis: ['khamis mushait', 'khamis mushayt', 'خميس مشيط', 'خميس'],
  yanbu: ['yen', 'yanbo', 'ينبع'],
  buraidah: ['bur', 'qassim', 'القصيم', 'بريدة'],
  rabigh: ['rabigh', 'رابغ'],
  waad: ['waad al shamal', 'وعد الشمال'],
  ras: ['ras al khair', 'رأس الخير', 'راس الخير'],
};

function expandSearchTerm(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return [];

  const results = new Set<string>([normalized]);

  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    if (
      canonical === normalized ||
      aliases.includes(normalized) ||
      canonical.includes(normalized)
    ) {
      results.add(canonical);
      aliases.forEach((a) => results.add(a));
    }
  }

  return Array.from(results);
}

function matchesAnyTerm(targetText: string, searchTerms: string[]): boolean {
  if (!targetText || searchTerms.length === 0) return false;
  return searchTerms.some((term) => targetText.includes(term));
}

function parseBudgetFilter(rawQuery: string): ((price: number) => boolean) | null {
  const rangeMatch = rawQuery.match(/^([<>]=?)\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const op = rangeMatch[1];
    const val = parseFloat(rangeMatch[2]);
    if (op === '<') return (p) => p < val;
    if (op === '<=') return (p) => p <= val;
    if (op === '>') return (p) => p > val;
    if (op === '>=') return (p) => p >= val;
  }

  const bandMatch = rawQuery.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (bandMatch) {
    const min = parseFloat(bandMatch[1]);
    const max = parseFloat(bandMatch[2]);
    return (p) => p >= min && p <= max;
  }

  return null;
}

interface CommercialSectionProps {
  contractSlots: any[];
  contractRateCategory: string;
  contractBillingType: string;
  contractVehicleType: string;
  getAvailableRateCardsForLane: (slot: any) => any[];
  customerRateCards?: any[];
  handleOpenCreateQuotation?: () => void;
  setIsManualRateOverride?: (override: boolean) => void;
  handleUpdateTripSlot: (slotId: string, patch: any) => void;
  handleSlotLocationChange?: (slotId: string, field: 'origin' | 'destination', locName: string, locObj: any) => void;
  setContractRateCategory?: (cat: string) => void;
  setContractBillingType?: (bType: string) => void;
  setContractVehicleType?: (vType: string) => void;
  contractCustomer?: string;
  setContractCustomer?: (customerId: string) => void;
  customers?: any[];
  customerOptions?: ComboboxOption[];
  fieldErrors?: Record<string, boolean>;
  assignmentType?: string;
  isEditMode?: boolean;
}

export const CommercialSection: React.FC<CommercialSectionProps> = ({
  contractSlots,
  contractRateCategory,
  contractBillingType,
  contractVehicleType,
  getAvailableRateCardsForLane,
  customerRateCards = [],
  handleOpenCreateQuotation,
  handleUpdateTripSlot,
  handleSlotLocationChange,
  setContractRateCategory,
  setContractBillingType,
  setContractVehicleType,
  contractCustomer = '',
  setContractCustomer,
  customers = [],
  customerOptions = [],
  fieldErrors = {},
  assignmentType = 'own',
  isEditMode = false,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [isInlineMode, setIsInlineMode] = React.useState(false);
  const [quotationSearchQuery, setQuotationSearchQuery] = React.useState('');

  // Global '/' keyboard shortcut to focus quotation search input
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true');

      if (e.key === '/' && !isInputFocused && contractCustomer && !isInlineMode) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [contractCustomer, isInlineMode]);

  const vehicleClassOptions = React.useMemo(() => getAllTaxonomyOptions('VEHICLE_CLASS'), []);
  const lineTypeOptions = React.useMemo(() => getAllTaxonomyOptions('LINE_TYPE'), []);

  const primarySlot = contractSlots[0] || {};
  const availableRateCards = getAvailableRateCardsForLane(primarySlot) || [];

  const [inlinePricingBasis, setInlinePricingBasis] = React.useState<'Per Trip' | 'Per Month'>(
    primarySlot.pricingBasis || 'Per Trip'
  );

  const effectiveRateCards = React.useMemo(() => {
    if (customerRateCards && customerRateCards.length > 0) {
      return customerRateCards;
    }
    return primarySlot ? getAvailableRateCardsForLane(primarySlot) || [] : [];
  }, [customerRateCards, getAvailableRateCardsForLane, primarySlot]);

  const matchedRateCard = (primarySlot.rateMatched || primarySlot.matchedRateCard) ? primarySlot.matchedRateCard : null;
  const activeSelectedId = (primarySlot.rateMatched || primarySlot.matchedRateCard)
    ? getCardId(primarySlot.matchedRateCard || { id: primarySlot.rateCardId })
    : null;

  const isSelectedQuotation = Boolean(
    (primarySlot.rateMatched || primarySlot.matchedRateCard) && (primarySlot.matchedRateCard || primarySlot.rateCardId)
  );

  // Return all rate cards for the customer
  const matchingCardsForSpec = React.useMemo(() => {
    if (!effectiveRateCards || effectiveRateCards.length === 0) return [];

    return [...effectiveRateCards].sort((a, b) => {
      const aNum = (a as any).quotation_number != null ? Number((a as any).quotation_number) : Infinity;
      const bNum = (b as any).quotation_number != null ? Number((b as any).quotation_number) : Infinity;
      if (aNum !== bNum) return aNum - bNum;
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
  }, [effectiveRateCards]);

  // Check if locations are entered and whether any quotation matches the lane
  const hasOrigin = Boolean(primarySlot.origin && String(primarySlot.origin).trim());
  const hasDestination = Boolean(primarySlot.destination && String(primarySlot.destination).trim());
  const hasLocationsEntered = hasOrigin || hasDestination;
  const hasMatchingCardsForLane = availableRateCards.length > 0;
  const isMatchedQuotation = Boolean(primarySlot.rateMatched || primarySlot.matchedRateCard);

  // If locations are entered but NO quotation matches this lane and none is selected, auto-trigger Define Quotation
  const isLaneUnmatched = hasLocationsEntered && !hasMatchingCardsForLane && !isMatchedQuotation;

  // Show inline form if explicitly toggled, if lane is unmatched, or if customer has 0 cards
  const showInlineForm = isInlineMode || isLaneUnmatched || (effectiveRateCards.length === 0 && !quotationSearchQuery);

  const derivedCustomerOptions = React.useMemo(() => {
    if (customerOptions && customerOptions.length > 0) return customerOptions;
    return customers.map((c) => ({
      value: c.id,
      label: c.name,
      keywords: `${c.code || ''} ${c.city || ''} ${c.name}`,
    }));
  }, [customerOptions, customers]);

  // Sort customers: Selected customer pinned FIRST to position 0 (leftmost), then by total trip count descending, then name
  const sortedCustomers = React.useMemo(() => {
    if (!customers) return [];
    return [...customers].sort((a, b) => {
      const aIsSelected = a.id === contractCustomer;
      const bIsSelected = b.id === contractCustomer;
      if (aIsSelected && !bIsSelected) return -1;
      if (!aIsSelected && bIsSelected) return 1;

      const aTrips = a._count?.trips ?? a.trip_count ?? a.tripsCount ?? 0;
      const bTrips = b._count?.trips ?? b.trip_count ?? b.tripsCount ?? 0;
      if (bTrips !== aTrips) return bTrips - aTrips;

      return (a.name || '').localeCompare(b.name || '');
    });
  }, [customers, contractCustomer]);

  // Sort quotations: Active selected quotation pinned FIRST to position 0 (leftmost)
  const sortedRateCards = React.useMemo(() => {
    if (!effectiveRateCards || effectiveRateCards.length === 0) return [];

    return [...effectiveRateCards]
      .sort((a, b) => {
        const aIsSelected = a.id === activeSelectedId;
        const bIsSelected = b.id === activeSelectedId;
        if (aIsSelected && !bIsSelected) return -1;
        if (!aIsSelected && bIsSelected) return 1;

        const aUsage = Number(a.usage_count || 0) + (a.driver_name || a.recent_driver ? 10 : 0);
        const bUsage = Number(b.usage_count || 0) + (b.driver_name || b.recent_driver ? 10 : 0);

        if (aUsage !== bUsage) return bUsage - aUsage;
        return String(a.quotation_number || a.id).localeCompare(String(b.quotation_number || b.id));
      })
      .slice(0, 50);
  }, [effectiveRateCards, activeSelectedId]);

  const displayedRateCards = React.useMemo(() => {
    const cards = matchingCardsForSpec;

    if (!quotationSearchQuery.trim()) return cards;
    const rawQuery = quotationSearchQuery.toLowerCase().trim();

    // 1. Budget Filter Match (< 2000, > 1500, 1500-2500)
    const budgetEvaluator = parseBudgetFilter(rawQuery);

    // 2. Directional Route Query ("riyadh to al abha", "ruh -> dmm", "riyadh - abha")
    const directionalRegex = /\s*(?:\bto\b|->|–|-|>)\s*/i;
    const isDirectional = directionalRegex.test(rawQuery);

    let originSubquery = '';
    let destSubquery = '';

    if (isDirectional) {
      const parts = rawQuery.split(directionalRegex);
      if (parts.length >= 2) {
        originSubquery = parts[0].trim();
        destSubquery = parts.slice(1).join(' ').trim();
      }
    }

    const expandedOrig = expandSearchTerm(originSubquery);
    const expandedDest = expandSearchTerm(destSubquery);
    const expandedSingleQuery = expandSearchTerm(rawQuery);

    // 3. Multi-word Token Match
    const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

    return cards.filter((rc) => {
      const qNum = String(rc.quotation_number || '').toLowerCase();
      const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
      const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

      const orig = String(
        firstStop?.source_label ||
        firstStop?.location?.name ||
        (firstStop as any)?.location_name ||
        rc.route_origin ||
        rc.origin_name ||
        rc.originLocation?.name ||
        rc.origin_city ||
        rc.origin ||
        rc.from ||
        ''
      ).toLowerCase();

      const dest = String(
        lastStop?.source_label ||
        lastStop?.location?.name ||
        (lastStop as any)?.location_name ||
        rc.route_destination ||
        rc.destination_name ||
        rc.destinationLocation?.name ||
        rc.destination_city ||
        rc.destination ||
        rc.to ||
        ''
      ).toLowerCase();

      const vClass = String(rc.vehicle_class || rc.vehicle_type || '').toLowerCase();
      const rCat = String(rc.rate_category || rc.line_type || '').toLowerCase();
      const numRate = Number(rc.rate ?? rc.base_price ?? 0);
      const rateStr = String(numRate).toLowerCase();

      const fullSearchableText = `${qNum} ${orig} ${dest} ${vClass} ${rCat} ${rateStr}`;

      // A) Price / Budget Evaluator
      if (budgetEvaluator) {
        return budgetEvaluator(numRate);
      }

      // B) Directional Lane & Return / Round-Trip Auto-Match
      if (isDirectional && (originSubquery || destSubquery)) {
        // Forward Match: Origin matches originSubquery AND Dest matches destSubquery
        const forwardOrigMatch = !originSubquery || matchesAnyTerm(orig, expandedOrig);
        const forwardDestMatch = !destSubquery || matchesAnyTerm(dest, expandedDest);
        if (forwardOrigMatch && forwardDestMatch) return true;

        // Return / Round-Trip Auto-Match: If card is Round-Trip or reverse lane
        const isRoundTripCard = rCat.includes('round') || Boolean((rc as any).is_round_trip);
        const reverseOrigMatch = !destSubquery || matchesAnyTerm(orig, expandedDest);
        const reverseDestMatch = !originSubquery || matchesAnyTerm(dest, expandedOrig);
        if ((isRoundTripCard || reverseOrigMatch) && reverseOrigMatch && reverseDestMatch) return true;

        // Directional queries MUST NOT fall through to loose single-term OR matching
        return false;
      }

      // C) City Aliases / Airport Codes / Arabic Name Matching
      if (matchesAnyTerm(orig, expandedSingleQuery) || matchesAnyTerm(dest, expandedSingleQuery)) {
        return true;
      }

      // D) Standard Substring Match across metadata
      if (qNum.includes(rawQuery) || orig.includes(rawQuery) || dest.includes(rawQuery) || vClass.includes(rawQuery) || rCat.includes(rawQuery) || rateStr.includes(rawQuery)) {
        return true;
      }

      // E) Multi-word token match
      if (queryTokens.length > 1) {
        return queryTokens.every((token) => {
          const expandedToken = expandSearchTerm(token);
          return matchesAnyTerm(fullSearchableText, expandedToken);
        });
      }

      return false;
    });
  }, [matchingCardsForSpec, quotationSearchQuery]);

  const selectedCust = customers.find((c) => c.id === contractCustomer);

  return (
    <div className="p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2.5 text-[#3E3C3D]">
      {/* UNIFIED SINGLE HEADER: CUSTOMER ACCOUNT */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        {/* LEFT: LOGO + CUSTOMER DISPLAY + MATCHED RATE BADGE */}
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
          {/* COMPANY PROFILE PICTURE */}
          {selectedCust ? (
            selectedCust.logo_url ? (
              <img
                src={selectedCust.logo_url}
                alt={selectedCust.name}
                className="w-8.5 h-8.5 rounded-xl object-cover border border-brand/40 shadow-2xs shrink-0"
                title={selectedCust.name}
              />
            ) : (
              <div
                className="w-8.5 h-8.5 rounded-xl bg-brand text-white font-black text-xs grid place-items-center shrink-0 shadow-2xs border border-brand/20"
                title={selectedCust.name}
              >
                {selectedCust.name.substring(0, 2).toUpperCase()}
              </div>
            )
          ) : (
            <div className="w-8.5 h-8.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold text-xs grid place-items-center shrink-0 border border-slate-200 dark:border-slate-700">
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
          )}

          {/* CUSTOMER DISPLAY: COMBOBOX IF CREATE MODE, READ-ONLY GRAYED OUT CARD IF EDIT MODE */}
          {isEditMode ? (
            <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed select-none">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 truncate max-w-[320px]">
                {selectedCust?.name || 'Assigned Customer'}
              </span>
            </div>
          ) : setContractCustomer ? (
            <div id="field-customer" className="w-full sm:w-[320px] shrink-0">
              <Combobox
                options={derivedCustomerOptions}
                value={contractCustomer}
                hasError={Boolean(fieldErrors?.['customer'])}
                onChange={(val) => setContractCustomer?.(val)}
                placeholder="Select customer account..."
                searchPlaceholder="Search customer name or code..."
                triggerClassName="h-8.5 rounded-xl border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs w-full focus:ring-2 focus:ring-brand"
              />
              {fieldErrors?.['customer'] && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Please select customer account</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* RIGHT: CREATE / EDIT QUOTATION BUTTON TOGGLE */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isEditMode && contractCustomer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInlineMode(!showInlineForm)}
              className="h-8 text-xs font-bold border-brand text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40 gap-1.5 cursor-pointer shrink-0 rounded-lg px-2.5"
            >
              {showInlineForm ? (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  {effectiveRateCards.length > 0 ? `Saved Cards (${effectiveRateCards.length})` : 'View Cards'}
                </>
              ) : isSelectedQuotation ? (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Quotation
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Define Quotation
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* STAGE 1 & 2: CREATE MODE VS EDIT MODE COMMERCIAL WORKSPACE */}
      {isEditMode ? (
        <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 font-black text-slate-800 dark:text-slate-100">
              <Tag className="w-3.5 h-3.5 text-[#FA634E]" />
              <span>Quotation Ref:</span>
              <span className="font-mono text-brand font-black">
                {primarySlot.matchedRateCard?.quotation_number ? `Q-${primarySlot.matchedRateCard.quotation_number}` : 'Fixed Commercial Rate'}
              </span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <div className="flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300">
              <span>Customer Rate: <strong className="text-slate-900 dark:text-slate-100 font-mono font-black">SAR {Number(primarySlot.billingAmount || 0).toLocaleString()}</strong></span>
              <span>•</span>
              <span>Class: <strong className="text-slate-800 dark:text-slate-200">{contractVehicleType}</strong></span>
              <span>•</span>
              <span>Line: <strong className="text-slate-800 dark:text-slate-200">{contractRateCategory}</strong></span>
            </div>
          </div>
        </div>
      ) : !contractCustomer ? (
        <CustomerCardCarousel
          customers={sortedCustomers}
          onSelectCustomer={(id) => setContractCustomer?.(id)}
        />
      ) : (
        <div className="space-y-2.5">
          {/* SEARCH INPUT TOOLBAR */}
          {!showInlineForm && (
            <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
              {/* STANDALONE SEARCH ICON BOX (MATCHES LOGO BOX ALIGNMENT) */}
              <div className="w-8.5 h-8.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold text-xs grid place-items-center shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <Search className="w-4 h-4 text-slate-400" />
              </div>

              {/* SEARCH INPUT FIELD (ALIGNING WITH CUSTOMER COMBOBOX) */}
              <div className="relative w-full sm:w-[320px] shrink-0 flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={quotationSearchQuery}
                  onChange={(e) => setQuotationSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setQuotationSearchQuery('');
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Search route, city code, rate... (Press /)"
                  className="h-8.5 w-full px-3 pr-16 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand shadow-2xs transition-all"
                />
                {quotationSearchQuery && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <span className="text-[10px] font-black text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0 select-none">
                      {displayedRateCards.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuotationSearchQuery('')}
                      className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear search (Esc)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {showInlineForm ? (
            <DefineQuotationInlineForm
              primarySlot={primarySlot}
              selectedCustName={selectedCust?.name}
              contractCustomer={contractCustomer}
              contractVehicleType={contractVehicleType}
              contractRateCategory={contractRateCategory}
              contractBillingType={contractBillingType}
              inlinePricingBasis={inlinePricingBasis}
              setInlinePricingBasis={setInlinePricingBasis}
              setContractBillingType={setContractBillingType}
              setContractVehicleType={setContractVehicleType}
              setContractRateCategory={setContractRateCategory}
              handleUpdateTripSlot={handleUpdateTripSlot}
              fieldErrors={fieldErrors}
              assignmentType={assignmentType}
            />
          ) : displayedRateCards.length > 0 ? (
            <QuotationCardCarousel
              rateCards={displayedRateCards}
              activeSelectedId={activeSelectedId}
              primarySlotMatchedId={primarySlot.matchedRateCard?.id}
              contractRateCategory={contractRateCategory}
              contractVehicleType={contractVehicleType}
              onApplyRateCard={(rc, targetCategory, targetVehicleClass, origName, destName, rateVal, isCurrentlySelected) => {
                const clickedId = getCardId(rc);
                const activeId = (primarySlot.rateMatched || primarySlot.matchedRateCard)
                  ? getCardId(primarySlot.matchedRateCard || { id: primarySlot.rateCardId })
                  : null;
                const isAlreadySelected = isCurrentlySelected || Boolean(clickedId && activeId && clickedId === activeId);

                React.startTransition(() => {
                  if (isAlreadySelected) {
                    // Deselect / Clear card on second click
                    handleUpdateTripSlot(primarySlot.id, {
                      matchedRateCard: null,
                      rateCardId: undefined,
                      rateMatched: false,
                      billingAmount: '',
                      driverPayout: '',
                      saveAsQuotation: false,
                      saveAsRateCard: false,
                    });
                    return;
                  }

                  const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
                  const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

                  // Take the quotation's whole route (every stop, both legs) so the slot's
                  // route matches the card exactly. Leaving stale names / stops behind made
                  // the route-change watcher drop the selection → "Define Quotation".
                  const [qOut, qRet] = quotationRouteLegs(rc);
                  const hasCardRoute = Boolean(qOut && qOut.length >= 2);
                  const originId = rc.originLocation?.id || firstStop?.location?.id || firstStop?.location_id || primarySlot.originLocationId;
                  const destinationId = rc.destinationLocation?.id || lastStop?.location?.id || lastStop?.location_id || primarySlot.destinationLocationId;
                  const originLabel = origName || primarySlot.origin;
                  const destinationLabel = destName || primarySlot.destination;
                  const outMids = hasCardRoute ? qOut.slice(1, -1) : [];
                  const retMids = qRet && qRet.length >= 2 ? qRet.slice(1, -1) : [];
                  const routePatch = hasCardRoute
                    ? {
                        intermediateLocations: outMids.map((s) => s.name || ''),
                        intermediateLocationIds: outMids.map((s) => s.id || null),
                        intermediateStopFees: outMids.map(() => ''),
                        returnOrigin: qRet && qRet.length >= 2 ? qRet[0].name || '' : '',
                        returnOriginLocationId: qRet && qRet.length >= 2 ? qRet[0].id || null : null,
                        returnDestination: qRet && qRet.length >= 2 ? qRet[qRet.length - 1].name || '' : '',
                        returnDestinationLocationId: qRet && qRet.length >= 2 ? qRet[qRet.length - 1].id || null : null,
                        returnIntermediateLocations: retMids.map((s) => s.name || ''),
                        returnIntermediateLocationIds: retMids.map((s) => s.id || null),
                      }
                    : {};
                  const originChanged = originId !== primarySlot.originLocationId;
                  const destinationChanged = destinationId !== primarySlot.destinationLocationId;

                  if (targetCategory && setContractRateCategory) {
                    setContractRateCategory(targetCategory);
                  }
                  if (targetVehicleClass && setContractVehicleType) {
                    setContractVehicleType(targetVehicleClass);
                  }

                  // Single unified slot patch to prevent multi-render race conditions
                  handleUpdateTripSlot(primarySlot.id, {
                    rateMatched: true,
                    matchedRateCard: rc,
                    rateCardId: clickedId || undefined,
                    billingAmount: String(rateVal),
                    driverPayout: rc.driver_payout != null ? String(rc.driver_payout) : '0',
                    driverPayoutModified: false,
                    updateQuotationPayout: false,
                    rateCategory: targetCategory,
                    vehicleType: targetVehicleClass,
                    pricingBasis: rc.pricing_basis || (normalizeBillingType(rc.operation_type || rc.billing_type) === 'Monthly' ? 'Per Month' : 'Per Trip'),
                    origin: origName || primarySlot.origin,
                    destination: destName || primarySlot.destination,
                    originLocationId: rc.originLocation?.id || firstStop?.location?.id || firstStop?.location_id || primarySlot.originLocationId,
                    destinationLocationId: rc.destinationLocation?.id || lastStop?.location?.id || lastStop?.location_id || primarySlot.destinationLocationId,
                  });
                });
              }}
            />
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 text-center space-y-1.5">
              {quotationSearchQuery ? (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    No quotation rate cards match <span className="font-bold text-slate-800 dark:text-slate-100">"{quotationSearchQuery}"</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuotationSearchQuery('')}
                    className="text-xs font-bold text-brand hover:underline cursor-pointer"
                  >
                    Clear quotation search filter
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    No active commercial quotation rates found for <span className="font-bold text-slate-800 dark:text-slate-100">{selectedCust?.name || 'this customer'}</span>.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsInlineMode(true)}
                    className="h-7 text-xs font-bold border-[#FA634E] text-[#FA634E] hover:bg-orange-50 dark:hover:bg-orange-950/30 gap-1 mx-auto cursor-pointer rounded-lg shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Define Quotation for {selectedCust?.name?.split(' ')[0] || 'Customer'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
