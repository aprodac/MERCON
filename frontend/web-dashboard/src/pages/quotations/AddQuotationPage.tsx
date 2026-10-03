import { DatePicker } from '@/components/ui/date-picker';
import { resolveTaxonomyOption } from '@/utils/taxonomyRegistry';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Calculator,
  MapPin,
  Plus,
  Trash2,
  Copy,
  Calendar,
  Banknote,
  Loader2,
  Sparkles,
  AlertCircle,
  Hash,
  CheckCircle2,
  Layers,
  X,
  FileCheck2,
  TrendingUp,
  Receipt,
  Printer,
  Coins,
  Clock
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import LocationCombobox from '@/components/quotations/LocationCombobox';
import { CustomerSelectionCard } from '@/components/quotations/CustomerSelectionCard';
import { QuotationPrintModal } from '@/components/quotations/QuotationPrintModal';
import { QuotationReviewDialog } from '@/components/quotations/QuotationReviewDialog';
import { TaxonomySelect } from '@/components/common/TaxonomySelect';
import { quotationService, surchargeRuleService, CreateQuotationPayload } from '@/services/quotationService';
import { customerService } from '@/services/customerService';
import { locationService } from '@/services/locationService';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface QuotationLineItem {
  id: string;
  originLocationId: string;
  destinationLocationId: string;
  originName?: string;
  destinationName?: string;
  vehicleClass: string;
  lineType: string;
  pricingBasis: 'PER_TRIP' | 'PER_MONTH' | 'NULL';
  rate: string;
  driverPayout: string;
  currency: string;
  sourceVehicleLabel: string;
  viaStops: Array<{ id: string; locationId: string; locationName?: string }>;
}

export interface QuotationSurchargeRule {
  id: string;
  name: string;
  amount: string;
  unit: string;
}

const COMMON_SURCHARGE_PRESETS = [
  { name: 'Within City Same Day Delivery', amount: '75', unit: 'Per Delivery', label: '+ Same Day (75 SAR)' },
  { name: 'Labor Charges', amount: '125', unit: 'Per Person', label: '+ Labor (125 SAR)' },
  { name: 'Jack Trolley', amount: '100', unit: 'Per Trip', label: '+ Jack Trolley (100 SAR)' },
  { name: 'Waiting Hour Charge', amount: '50', unit: 'Per Hour', label: '+ Waiting Hour (50 SAR)' },
];

const VEHICLE_CLASSES = ['3-4 TON', '5 TON', '10 TON', '20 TON', '40 FEET'];

const createEmptyLine = (overrides?: Partial<QuotationLineItem>): QuotationLineItem => ({
  id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  originLocationId: '',
  destinationLocationId: '',
  vehicleClass: '10 TON',
  lineType: 'SINGLE_TRIP',
  pricingBasis: 'PER_TRIP',
  rate: '',
  driverPayout: '',
  currency: 'SAR',
  sourceVehicleLabel: '',
  viaStops: [],
  ...overrides,
});

export default function AddQuotationPage({ isEdit = false }: { isEdit?: boolean }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const prefilledCustomerId = searchParams.get('customer_id') || '';

  // Master Agreement Form State
  const [customerId, setCustomerId] = useState(prefilledCustomerId);
  const [operationType, setOperationType] = useState<'MONTHLY' | 'EXTRA'>('EXTRA');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  const applyValidityPreset = (months: number) => {
    if (months === 0) {
      setValidFrom('');
      setValidTo('');
      return;
    }
    const today = new Date();
    const fromStr = today.toISOString().split('T')[0];
    const targetDate = new Date(today);
    targetDate.setMonth(targetDate.getMonth() + months);
    const toStr = targetDate.toISOString().split('T')[0];

    setValidFrom(fromStr);
    setValidTo(toStr);
    const labelText = months >= 12 ? `${months / 12} Year${months > 12 ? 's' : ''}` : `${months} Months`;
    toast.success(`Set contract term: Today → +${labelText}`);
  };

  const activePresetMonths = useMemo(() => {
    if (!validFrom || !validTo) return null;
    const d1 = new Date(validFrom);
    const d2 = new Date(validTo);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
    if (diffDays >= 85 && diffDays <= 95) return 3;
    if (diffDays >= 175 && diffDays <= 186) return 6;
    if (diffDays >= 360 && diffDays <= 366) return 12;
    if (diffDays >= 725 && diffDays <= 732) return 24;
    return null;
  }, [validFrom, validTo]);

  // Multi-Line Rate Items Array
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);

  // Commercial Surcharge Rules Array
  const [surchargeRules, setSurchargeRules] = useState<QuotationSurchargeRule[]>([]);

  const handleAddSurchargeRule = () => {
    setSurchargeRules((prev) => [
      ...prev,
      {
        id: `sur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: '',
        amount: '',
        unit: 'Per Delivery',
      },
    ]);
  };

  const handleUpdateSurchargeRule = (id: string, field: keyof QuotationSurchargeRule, value: string) => {
    setSurchargeRules((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveSurchargeRule = (id: string) => {
    setSurchargeRules((prev) => prev.filter((item) => item.id !== id));
  };

  const [formError, setFormError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Fetch Customers lookup
  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll({ per_page: 200, mode: 'lookup' }),
  });
  const customers = customersRes?.data || [];
  const selectedCustomerObj = customers.find((c) => c.id === customerId);

  // Fetch Locations lookup for route labels
  const { data: locationsRes } = useQuery({
    queryKey: ['locations-lookup-all'],
    queryFn: () => locationService.getAll(),
  });

  const locationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (locationsRes?.data || []).forEach((l) => map.set(l.id, l.name));
    return map;
  }, [locationsRes?.data]);

  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    (locationsRes?.data || []).forEach((l) => {
      map.set(l.id, `${l.code} — ${l.name}`);
    });
    return map;
  }, [locationsRes?.data]);

  // Formatted line items for official document print preview
  const printLineItems = useMemo(() => {
    return lineItems.map((line) => {
      const rawOrigin = locationMap.get(line.originLocationId) || '';
      const rawDest = locationMap.get(line.destinationLocationId) || '';
      const originName = rawOrigin.includes('—') ? rawOrigin.split('—')[1].trim() : rawOrigin || 'Origin';
      const destinationName = rawDest.includes('—') ? rawDest.split('—')[1].trim() : rawDest || 'Destination';
      return {
        originName,
        destinationName,
        vehicleClass: line.vehicleClass,
        rate: line.rate,
        driverPayout: line.driverPayout,
        lineType: line.lineType,
      };
    });
  }, [lineItems, locationMap]);

  // Fetch existing quotation if editing
  const { data: existingQuotation } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => quotationService.getById(id!),
    enabled: isEdit && !!id,
  });

  // Quotation Reference ID (Auto-generated or existing)
  const quotationRefId = useMemo(() => {
    if (isEdit && existingQuotation) {
      const no = (existingQuotation as any).quotation_number;
      return no != null ? `QT-${no}` : existingQuotation.agreement_ref || `QT-${existingQuotation.id.substring(0, 8).toUpperCase()}`;
    }
    // The number is given when it's saved (QT-526 …); a made-up one here
    // (QT-2026-5527) never matched the saved quotation.
    return 'New';
  }, [isEdit, existingQuotation]);

  // Populate state from existing quotation when editing
  useEffect(() => {
    if (!isEdit || !existingQuotation) return;
    setCustomerId(existingQuotation.customerId || '');
    setOperationType(((existingQuotation.operation_type || existingQuotation.billing_type) as 'MONTHLY' | 'EXTRA') || 'EXTRA');
    setValidFrom(existingQuotation.valid_from ? existingQuotation.valid_from.substring(0, 10) : '');
    setValidTo(existingQuotation.valid_to ? existingQuotation.valid_to.substring(0, 10) : '');

    const stopsArr = existingQuotation.stops || [];
    const pickupStop = stopsArr.find((s: any) => s.stop_type === 'Pickup' || s.sequence === 1) || stopsArr[0];
    const dropoffStops = stopsArr.filter((s: any) => s.stop_type === 'Dropoff');
    const dropoffStop = dropoffStops.length > 0 ? dropoffStops[dropoffStops.length - 1] : (stopsArr.length > 1 ? stopsArr[stopsArr.length - 1] : null);

    const originId = pickupStop?.locationId || (pickupStop as any)?.location_id || existingQuotation.originLocationId || (existingQuotation as any).origin_location_id || '';
    const destId = dropoffStop?.locationId || (dropoffStop as any)?.location_id || existingQuotation.destinationLocationId || (existingQuotation as any).destination_location_id || '';

    const origName = pickupStop?.source_label || (pickupStop as any)?.location?.name || existingQuotation.origin_name || existingQuotation.route_origin || '';
    const destName = dropoffStop?.source_label || (dropoffStop as any)?.location?.name || existingQuotation.destination_name || existingQuotation.route_destination || '';

    // Extract intermediate stops
    const restStops = stopsArr
      .filter((s: any) => s !== pickupStop && s !== dropoffStop)
      .map((s: any, idx: number) => ({
        id: `via-${idx}`,
        locationId: s.locationId || (s as any).location_id || '',
        locationName: s.source_label || s.location?.name || '',
      }));

    setLineItems([
      {
        id: `edit-${existingQuotation.id}`,
        originLocationId: originId,
        destinationLocationId: destId,
        originName: origName,
        destinationName: destName,
        vehicleClass: existingQuotation.vehicle_class || '10 TON',
        lineType: existingQuotation.line_type || 'SINGLE_TRIP',
        pricingBasis: (existingQuotation.pricing_basis as any) || 'NULL',
        rate: String(existingQuotation.rate || ''),
        driverPayout: existingQuotation.driver_payout != null ? String(existingQuotation.driver_payout) : '',
        currency: existingQuotation.currency || 'SAR',
        sourceVehicleLabel: existingQuotation.source_vehicle_label || '',
        viaStops: restStops,
      },
    ]);
  }, [isEdit, existingQuotation]);

  const isReturnToTrip = searchParams.get('return_to_trip') === 'true';
  const hasInitializedRef = useRef(false);

  // Populate state from search params if passed from /trips/new or /quotations
  useEffect(() => {
    if (isEdit || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const custId = searchParams.get('customer_id');
    const origId = searchParams.get('origin_id');
    const destId = searchParams.get('destination_id');
    const origName = searchParams.get('origin_name');
    const destName = searchParams.get('destination_name');
    const vClass = searchParams.get('vehicle_class');
    const lType = searchParams.get('line_type');
    const bType = searchParams.get('billing_type');
    const priceVal = searchParams.get('price');

    if (custId) setCustomerId(custId);
    if (bType) {
      const normB = bType.toUpperCase().includes('MONTHLY') ? 'MONTHLY' : 'EXTRA';
      setOperationType(normB);
    }

    if (origId || destId || origName || destName || vClass || lType || priceVal) {
      setLineItems([
        createEmptyLine({
          originLocationId: origId || '',
          destinationLocationId: destId || '',
          originName: origName || '',
          destinationName: destName || '',
          vehicleClass: vClass || '10 TON',
          lineType: lType || 'SINGLE_TRIP',
          rate: priceVal || '',
        }),
      ]);
    }
  }, [isEdit, searchParams]);

  // Line Item Handlers
  const handleAddLine = () => {
    setLineItems((prev) => [...prev, createEmptyLine()]);
  };

  const handleDuplicateLine = (index: number) => {
    const lineToCopy = lineItems[index];
    const duplicatedLine = createEmptyLine({
      ...lineToCopy,
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      viaStops: lineToCopy.viaStops.map((v) => ({ ...v, id: `via-${Date.now()}-${Math.random()}` })),
    });
    setLineItems((prev) => [...prev.slice(0, index + 1), duplicatedLine, ...prev.slice(index + 1)]);
    toast.success(`Duplicated Line #${index + 1}`);
  };

  const handleRemoveLine = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLine = (index: number, key: keyof QuotationLineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  };

  // Intermediate Via-Stop Handlers per Line (Strictly Immutable to prevent double-adds)
  const handleAddViaStop = (lineIndex: number) => {
    setLineItems((prev) =>
      prev.map((line, idx) =>
        idx === lineIndex
          ? {
              ...line,
              viaStops: [
                ...line.viaStops,
                { id: `via-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, locationId: '' },
              ],
            }
          : line
      )
    );
  };

  const handleRemoveViaStop = (lineIndex: number, viaIndex: number) => {
    setLineItems((prev) =>
      prev.map((line, idx) =>
        idx === lineIndex
          ? {
              ...line,
              viaStops: line.viaStops.filter((_, i) => i !== viaIndex),
            }
          : line
      )
    );
  };

  const handleUpdateViaStop = (lineIndex: number, viaIndex: number, locationId: string, locationName?: string) => {
    setLineItems((prev) =>
      prev.map((line, idx) =>
        idx === lineIndex
          ? {
              ...line,
              viaStops: line.viaStops.map((via, i) => (i === viaIndex ? { ...via, locationId, locationName: locationName || via.locationName || locationId } : via)),
            }
          : line
      )
    );
  };

  // Financial Metrics Calculation across all lines
  const financialTotals = useMemo(() => {
    let totalRate = 0;
    let totalPayout = 0;
    let validLinesCount = 0;

    lineItems.forEach((item) => {
      const r = parseFloat(item.rate) || 0;
      const p = parseFloat(item.driverPayout) || 0;
      if (r > 0) validLinesCount++;
      totalRate += r;
      totalPayout += p;
    });

    const netMargin = totalRate - totalPayout;
    const avgRate = lineItems.length > 0 ? totalRate / lineItems.length : 0;

    return { totalRate, totalPayout, netMargin, avgRate, validLinesCount };
  }, [lineItems]);

  // Commercial Agreement Setup Metrics
  const agreementSummaryMetrics = useMemo(() => {
    const lineTypeLabels: Record<string, string> = {
      SINGLE_TRIP: 'Single Trip',
      ROUND_TRIP: 'Round Trip',
      SHIFT_10H: '10h Shift',
      SHIFT_12H: '12h Shift',
    };

    const vehicleClassesList = Array.from(new Set(lineItems.map((l) => l.vehicleClass).filter(Boolean)));
    const lineTypesList = Array.from(new Set(lineItems.map((l) => lineTypeLabels[l.lineType] || l.lineType).filter(Boolean)));

    let validityText = 'Immediate / Open';
    if (validFrom && validTo) {
      const d1 = new Date(validFrom);
      const d2 = new Date(validTo);
      const diffDays = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
      if (diffDays > 0) validityText = `${diffDays} Days Term`;
      else validityText = 'Custom Dates';
    } else if (validFrom) {
      validityText = `From ${validFrom}`;
    } else if (validTo) {
      validityText = `Until ${validTo}`;
    }

    return {
      routesCount: lineItems.length,
      vehicleClassesCount: vehicleClassesList.length,
      vehicleClassesLabel: vehicleClassesList.length > 0 ? vehicleClassesList.join(', ') : 'None selected',
      lineTypesCount: lineTypesList.length,
      lineTypesLabel: lineTypesList.length > 0 ? lineTypesList.join(', ') : 'Single Trip',
      validityText,
    };
  }, [lineItems, validFrom, validTo]);

  // Form Validation
  const validateForm = () => {
    if (!customerId) {
      setFormError('Please select a customer for this agreement.');
      return false;
    }

    if (lineItems.length === 0 && surchargeRules.length === 0) {
      setFormError('Add at least one route or one surcharge.');
      return false;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.originLocationId && !item.originName) {
        setFormError(`Line #${i + 1}: Origin pickup location is required.`);
        return false;
      }
      if (!item.destinationLocationId && !item.destinationName) {
        setFormError(`Line #${i + 1}: Destination dropoff location is required.`);
        return false;
      }
      const numRate = parseFloat(item.rate);
      if (isNaN(numRate) || !isFinite(numRate) || numRate <= 0 || numRate > 999999999.99) {
        setFormError(`Line #${i + 1}: Enter a valid agreed rate between 0 and 999,999,999.`);
        return false;
      }
      if (item.driverPayout) {
        const numPayout = parseFloat(item.driverPayout);
        if (isNaN(numPayout) || !isFinite(numPayout) || numPayout < 0 || numPayout > 999999999.99) {
          setFormError(`Line #${i + 1}: Enter a valid driver payout amount.`);
          return false;
        }
      }
    }

    for (let i = 0; i < surchargeRules.length; i++) {
      const rule = surchargeRules[i];
      if (!rule.name.trim()) {
        setFormError(`Surcharge #${i + 1}: Surcharge title / charge type is required.`);
        return false;
      }
      const numAmt = parseFloat(rule.amount);
      if (isNaN(numAmt) || !isFinite(numAmt) || numAmt <= 0 || numAmt > 999999999.99) {
        setFormError(`Surcharge #${i + 1}: Enter a valid amount greater than 0.`);
        return false;
      }
    }

    setFormError(null);
    return true;
  };

  // Batch Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const parseSafeDecimal = (val?: string | number | null): number | null => {
        if (val === null || val === undefined || val === '' || val === 'NULL') return null;
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (isNaN(num) || !isFinite(num) || num < 0) return null;
        return Math.min(num, 999999999.99);
      };

      let createdQuotations: any[] = [];

      if (lineItems.length > 0) {
        if (isEdit && id) {
          // Single quotation update
          const line = lineItems[0];
          const rawOrigin = locationMap.get(line.originLocationId) || '';
          const rawDest = locationMap.get(line.destinationLocationId) || '';
          const origName = line.originName || (rawOrigin.includes('—') ? rawOrigin.split('—')[1].trim() : rawOrigin) || undefined;
          const destName = line.destinationName || (rawDest.includes('—') ? rawDest.split('—')[1].trim() : rawDest) || undefined;

          const payload: CreateQuotationPayload = {
            customerId,
            origin_location_id: line.originLocationId || null,
            destination_location_id: line.destinationLocationId || null,
            origin_name: origName,
            destination_name: destName,
            vehicle_class: line.vehicleClass,
            operation_type: operationType,
            billing_type: operationType,
            line_type: line.lineType,
            pricing_basis: line.pricingBasis !== 'NULL' ? line.pricingBasis : undefined,
            rate: parseSafeDecimal(line.rate) ?? 0,
            driver_payout: parseSafeDecimal(line.driverPayout),
            currency: line.currency,
            source_vehicle_label: line.sourceVehicleLabel || line.vehicleClass,
            valid_from: validFrom || undefined,
            valid_to: validTo || undefined,
            stops: [
              ...(line.originLocationId || origName ? [{ sequence: 1, locationId: line.originLocationId || null, location_id: line.originLocationId || null, source_label: origName || null, stop_type: 'Pickup' as const }] : []),
              ...line.viaStops.map((v, i) => ({ sequence: i + 2, locationId: v.locationId || null, location_id: v.locationId || null, source_label: v.locationName || null, stop_type: 'Rest' as const })),
              ...(line.destinationLocationId || destName ? [{ sequence: line.viaStops.length + 2, locationId: line.destinationLocationId || null, location_id: line.destinationLocationId || null, source_label: destName || null, stop_type: 'Dropoff' as const }] : []),
            ],
          };
          const updated = await quotationService.update(id, payload);
          createdQuotations = [updated];
        } else {
          // Create multiple rate lines in parallel for customer
          const requests = lineItems.map((line) => {
            const rawOrigin = locationMap.get(line.originLocationId) || '';
            const rawDest = locationMap.get(line.destinationLocationId) || '';
            const origName = line.originName || (rawOrigin.includes('—') ? rawOrigin.split('—')[1].trim() : rawOrigin) || undefined;
            const destName = line.destinationName || (rawDest.includes('—') ? rawDest.split('—')[1].trim() : rawDest) || undefined;

            const payload: CreateQuotationPayload = {
              customerId,
              origin_location_id: line.originLocationId || null,
              destination_location_id: line.destinationLocationId || null,
              origin_name: origName,
              destination_name: destName,
              vehicle_class: line.vehicleClass,
              operation_type: operationType,
              billing_type: operationType,
              line_type: line.lineType,
              pricing_basis: line.pricingBasis !== 'NULL' ? line.pricingBasis : undefined,
              rate: parseSafeDecimal(line.rate) ?? 0,
              driver_payout: parseSafeDecimal(line.driverPayout),
              currency: line.currency,
              source_vehicle_label: line.sourceVehicleLabel || line.vehicleClass,
              valid_from: validFrom || undefined,
              valid_to: validTo || undefined,
              stops: [
                ...(line.originLocationId || origName ? [{ sequence: 1, locationId: line.originLocationId || null, location_id: line.originLocationId || null, source_label: origName || null, stop_type: 'Pickup' as const }] : []),
                ...line.viaStops.map((v, i) => ({ sequence: i + 2, locationId: v.locationId || null, location_id: v.locationId || null, source_label: v.locationName || null, stop_type: 'Rest' as const })),
                ...(line.destinationLocationId || destName ? [{ sequence: line.viaStops.length + 2, locationId: line.destinationLocationId || null, location_id: line.destinationLocationId || null, source_label: destName || null, stop_type: 'Dropoff' as const }] : []),
              ],
            };
            return quotationService.create(payload);
          });

          createdQuotations = await Promise.all(requests);
        }
      }

      if (surchargeRules.length > 0) {
        const targetQuotationId = createdQuotations.length === 1 ? createdQuotations[0].id : undefined;
        const surchargeRequests = surchargeRules.map((rule) => {
          return surchargeRuleService.create({
            customerId,
            quotationId: targetQuotationId,
            charge_type: rule.name.trim(),
            rate: parseFloat(rule.amount) || 0,
            unit: rule.unit || 'Per Delivery',
            currency: 'SAR',
            is_active: true,
          });
        });
        await Promise.all(surchargeRequests);
      }

      return { createdQuotationsCount: createdQuotations.length, surchargesCount: surchargeRules.length };
    },
    onSuccess: (data) => {
      // Invalidate and reset all quotation queries so unmounted list pages fetch fresh data on navigate
      queryClient.invalidateQueries({ queryKey: ['quotations'], refetchType: 'all' });
      queryClient.resetQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['rate-cards'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['quotations-select'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['quotations-select-all'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['quotations-all'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['quotation-lookup'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['surcharge-rules'], refetchType: 'all' });
      setIsPreviewOpen(false);

      if (isReturnToTrip) {
        const returnStep = searchParams.get('return_step') || '3';
        toast.success('Quotation saved. Back to the trip…');
        setTimeout(() => {
          navigate(`/trips/new?step=${returnStep}`);
        }, 500);
      } else {
        const parts: string[] = [];
        if (data.createdQuotationsCount > 0) {
          parts.push(`${data.createdQuotationsCount} route line${data.createdQuotationsCount > 1 ? 's' : ''}`);
        }
        if (data.surchargesCount > 0) {
          parts.push(`${data.surchargesCount} surcharge rule${data.surchargesCount > 1 ? 's' : ''}`);
        }
        const successMsg = isEdit
          ? 'Quotation updated successfully'
          : `Successfully saved ${parts.length > 0 ? parts.join(' and ') : 'commercial agreement'}`;
        toast.success(successMsg);
        // Delay navigation slightly so refetch can populate the cache before the list page mounts
        setTimeout(() => {
          navigate(customerId ? `/quotations?customer_id=${customerId}` : '/quotations');
        }, 400);
      }
    },
    onError: (err: any) => {
      console.error('❌ [AddQuotationPage] Save failed:', {
        status: err.response?.status,
        errorData: err.response?.data,
        message: err.message,
      });
      const errData = err.response?.data?.error;
      const msg = errData?.message || err.message || 'Failed to save agreement rates';
      const detail = errData?.code ? ` (${errData.code})` : '';
      setFormError(msg + detail);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsPreviewOpen(true);
  };

  // Keyboard shortcut Ctrl + Enter to open preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (validateForm()) {
          setIsPreviewOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customerId, operationType, lineItems, validFrom, validTo]);

  return (
    <DashboardLayout active="Quotations" title={isEdit ? 'Edit quotation' : 'New quotation'} hideBackButton={true}>
      <form onSubmit={handleSubmit} className="px-3 sm:px-6 pb-10 w-full max-w-[1600px] mx-auto animate-fade-in space-y-3.5">
        
        {/* Page Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Calculator className="w-6 h-6 text-[#FA634E] shrink-0" />
              <span>{isEdit ? 'Edit quotation' : 'New quotation'}</span>
            </h1>

            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#2D2B2C] text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg font-mono font-black text-xs shadow-2xs">
              <Hash className="w-3.5 h-3.5 text-[#FA634E]" />
              <span>{quotationRefId}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(isEdit && id ? `/quotations/${id}` : '/quotations')}
              className="h-8.5 text-xs font-bold border-slate-200 dark:border-slate-800 rounded-xl px-4"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPrintModalOpen(true)}
              className="h-8.5 text-xs font-bold border-slate-200 dark:border-slate-800 rounded-xl px-3.5 gap-1.5 cursor-pointer bg-white dark:bg-slate-900 text-[#3E3C3D] hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5 text-[#FA634E]" />
              <span>Print / PDF Document</span>
            </Button>
            
            <Button
              type="submit"
              size="sm"
              className="h-8.5 px-4.5 text-xs font-black text-white bg-[#FA634E] hover:bg-[#DF4834] shadow-md shadow-[#FA634E]/20 rounded-xl transition-all hover:scale-[1.01] active:scale-95 gap-1.5 cursor-pointer border-0"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {isReturnToTrip ? 'Save quotation & back to trip →' : 'Save quotation'}
              </span>
            </Button>
          </div>
        </div>

        {isReturnToTrip && (
          <div className="p-3.5 rounded-xl bg-orange-50/90 border border-[#FA634E]/30 flex items-center justify-between gap-3 text-xs font-bold text-[#3E3C3D] animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-[#FA634E] shrink-0" />
              <span>Creating commercial quotation to apply to your current trip creation workflow.</span>
            </div>
            <Badge className="bg-[#FA634E] text-white font-extrabold text-[10px] uppercase px-2.5 py-0.5 rounded-md">
              Trip Creation Context
            </Badge>
          </div>
        )}

        {formError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900/60 flex items-center gap-2 shadow-2xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Split View Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* LEFT PANEL (5 Columns): Master Contract Setup & Integrated Financial Summary */}
          <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
            
            <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden bg-white dark:bg-[#2D2B2C] p-0 gap-0">
              <CardContent className="p-3.5 space-y-3">
                
                {/* Customer Selection Component */}
                <CustomerSelectionCard
                  value={customerId}
                  onChange={setCustomerId}
                  customers={customers as any}
                  label=""
                  required={false}
                />

                {/* Contract Parameters Row: Operation Type + Valid From + Valid Until */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">Operation Type *</Label>
                    <TaxonomySelect
                      category="OPERATION_TYPE"
                      value={operationType}
                      onValueChange={(val: string) => setOperationType(val as any)}
                      placeholder="Select Operation Type"
                      size="sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Valid From</Label>
                    <DatePicker value={validFrom || null} onChange={(_, str) => setValidFrom(str)} clearable placeholder="Today" formatString="d MMM yyyy" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Valid Until</Label>
                    <DatePicker value={validTo || null} onChange={(_, str) => setValidTo(str)} clearable placeholder="No end date" formatString="d MMM yyyy" />
                  </div>
                </div>

                {/* Term Validity Presets Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mr-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#FA634E]" /> Term Presets:
                    </span>
                    {[
                      { label: '+3 Months', months: 3 },
                      { label: '+6 Months', months: 6 },
                      { label: '+1 Year', months: 12 },
                      { label: '+2 Years', months: 24 },
                    ].map((p) => {
                      const isActive = activePresetMonths === p.months;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => applyValidityPreset(p.months)}
                          className={cn(
                            'h-7 px-2.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer border shadow-2xs',
                            isActive
                              ? 'bg-[#FA634E] text-white border-[#FA634E] shadow-sm shadow-[#FA634E]/20 scale-[1.02]'
                              : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#FA634E]/60 hover:text-[#FA634E] hover:bg-orange-50/50'
                          )}
                        >
                          {isActive && <CheckCircle2 className="w-3 h-3 text-white shrink-0" />}
                          <span>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(validFrom || validTo) && (
                    <button
                      type="button"
                      onClick={() => applyValidityPreset(0)}
                      className="h-7 px-2 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer flex items-center gap-1"
                      title="Clear validity dates"
                    >
                      <X className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {/* Executive Summary Panel */}
                <div className="pt-2">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 text-[#3E3C3D] dark:text-slate-300 font-bold">
                        <Receipt className="w-3.5 h-3.5 text-[#FA634E]" />
                        Summary
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* 1. Routes Defined */}
                      <div className="p-2.5 bg-white dark:bg-[#2D2B2C] rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Routes</div>
                        <div className="text-xs font-bold text-[#3E3C3D] dark:text-white">
                          {agreementSummaryMetrics.routesCount} {agreementSummaryMetrics.routesCount === 1 ? 'Route' : 'Routes'}
                        </div>
                      </div>

                      {/* 2. Vehicle Classes */}
                      <div className="p-2.5 bg-white dark:bg-[#2D2B2C] rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Vehicle Classes</div>
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate">
                          {agreementSummaryMetrics.vehicleClassesLabel}
                        </div>
                      </div>

                      {/* 3. Line Types */}
                      <div className="p-2.5 bg-white dark:bg-[#2D2B2C] rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Line Types</div>
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                          {agreementSummaryMetrics.lineTypesLabel}
                        </div>
                      </div>

                      {/* 4. Contract Term / Validity */}
                      <div className="p-2.5 bg-white dark:bg-[#2D2B2C] rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Validity</div>
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate">
                          {agreementSummaryMetrics.validityText}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

          </div>

          {/* RIGHT PANEL (7 Columns): Commercial Rate Lines Matrix Builder */}
          <div className="lg:col-span-7 space-y-3">
            
            <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden bg-white dark:bg-[#2D2B2C] p-0 gap-0">
              <CardHeader className="bg-slate-50/70 dark:bg-slate-800/40 py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-[#FA634E]" />
                  Route Lines ({lineItems.length})
                </CardTitle>
                
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddLine}
                  className="h-7.5 px-3 text-xs font-bold text-[#FA634E] bg-[#FA634E]/10 hover:bg-[#FA634E]/20 border border-[#FA634E]/30 rounded-xl gap-1 cursor-pointer transition-all"
                >
                  <Plus size={13} /> Add Route
                </Button>
              </CardHeader>

              <CardContent className="p-3.5 space-y-3">

            {/* Rate Line Cards Stack */}
            {lineItems.length === 0 ? (
              <div className="p-5 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-400 space-y-2">
                <p className="font-bold text-slate-600 dark:text-slate-300">No Route Lines Added</p>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddLine}
                    className="h-8 px-3.5 text-xs font-bold text-[#FA634E] bg-[#FA634E]/10 hover:bg-[#FA634E]/20 border border-[#FA634E]/30 rounded-xl gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Add Route Line
                  </Button>
                </div>
              </div>
            ) : (
              lineItems.map((line, index) => {
                const numRate = parseFloat(line.rate) || 0;

                return (
                  <div
                    key={line.id}
                    className="p-3.5 bg-white dark:bg-[#2D2B2C] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3 transition-all hover:border-[#FA634E]/30"
                  >
                    {/* Line Item Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[#3E3C3D] text-white text-[11px] font-mono font-black">
                          #{index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Route #{index + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddViaStop(index)}
                          className="h-7 text-xs font-bold border-dashed border-[#FA634E]/40 text-[#FA634E] hover:bg-[#FA634E]/10 px-2.5 rounded-lg gap-1 cursor-pointer"
                        >
                          <Plus size={12} /> Add Stop
                        </Button>

                        <button
                          type="button"
                          onClick={() => handleDuplicateLine(index)}
                          title="Duplicate Line"
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1 transition-all"
                        >
                          <Copy size={12} />
                          <span>Duplicate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          title="Remove Line"
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded-lg cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                  {/* Route & Specifications Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    
                    {/* Origin */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                        Origin *
                      </span>
                      <LocationCombobox
                        customerId={customerId}
                        value={line.originLocationId}
                        onChange={(val, loc) => {
                          handleUpdateLine(index, 'originLocationId', val);
                          if (loc?.name) handleUpdateLine(index, 'originName', loc.name);
                          else if (val) handleUpdateLine(index, 'originName', val);
                          if (loc?.customerId && !customerId) setCustomerId(loc.customerId);
                        }}
                        placeholder="Select origin location..."
                      />
                    </div>

                    {/* Destination */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                        Destination *
                      </span>
                      <LocationCombobox
                        customerId={customerId}
                        value={line.destinationLocationId}
                        onChange={(val, loc) => {
                          handleUpdateLine(index, 'destinationLocationId', val);
                          if (loc?.name) handleUpdateLine(index, 'destinationName', loc.name);
                          else if (val) handleUpdateLine(index, 'destinationName', val);
                          if (loc?.customerId && !customerId) setCustomerId(loc.customerId);
                        }}
                        placeholder="Select destination location..."
                      />
                    </div>

                  </div>

                  {/* Specifications & Financials Single Row: Vehicle Class (3) + Line Type (3) + Agreed Rate (4) + Driver Payout (2) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-2.5 pt-1">
                    {/* Vehicle Class Dropdown */}
                    <div className="space-y-1 xl:col-span-3">
                      <Label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Vehicle Class *</Label>
                      <TaxonomySelect
                        category="VEHICLE_CLASS"
                        value={line.vehicleClass}
                        onValueChange={(val: string) => handleUpdateLine(index, 'vehicleClass', val)}
                        size="sm"
                        placeholder="Select Vehicle Class"
                      />
                    </div>

                    {/* Line Type */}
                    <div className="space-y-1 xl:col-span-3">
                      <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Line Type *</Label>
                      <TaxonomySelect
                        category="LINE_TYPE"
                        value={line.lineType}
                        onValueChange={(val: string) => handleUpdateLine(index, 'lineType', val)}
                        size="sm"
                        placeholder="Select Line Type"
                      />
                    </div>

                    {/* Agreed Rate + Pricing Basis Inline (Wider 4/12) */}
                    <div className="space-y-1 xl:col-span-4">
                      <Label className="text-[11px] font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Banknote className="h-3.5 w-3.5 text-[#FA634E]" /> Agreed Rate *
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">SAR</span>
                      </Label>
                      <div className="relative flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#2D2B2C] focus-within:ring-2 focus-within:ring-[#FA634E] overflow-hidden h-8.5 shadow-2xs">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.rate}
                          onChange={(e) => handleUpdateLine(index, 'rate', e.target.value)}
                          placeholder="Enter rate..."
                          className="h-full text-xs font-black border-0 bg-transparent focus-visible:ring-0 focus-visible:outline-none shadow-none flex-1 px-3 min-w-0"
                        />
                        <div className="h-full border-l border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-center shrink-0">
                          <Select
                            value={line.pricingBasis || 'PER_TRIP'}
                            onValueChange={(val) => handleUpdateLine(index, 'pricingBasis', val as any)}
                          >
                            <SelectTrigger className="h-full text-[11px] font-bold text-slate-800 dark:text-slate-200 border-0 bg-transparent focus:ring-0 focus:outline-none shadow-none px-2 rounded-none whitespace-nowrap">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[9999] min-w-[115px]">
                              <SelectItem value="PER_TRIP" className="text-xs font-semibold whitespace-nowrap">Per Trip</SelectItem>
                              <SelectItem value="PER_MONTH" className="text-xs font-semibold whitespace-nowrap">Per Month</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Driver Charge / Payout (Narrower 2/12) */}
                    <div className="space-y-1 xl:col-span-2">
                      <Label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span>Driver Payout</span>
                        <span className="text-[10px] font-bold text-slate-400">SAR</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={line.driverPayout}
                        onChange={(e) => handleUpdateLine(index, 'driverPayout', e.target.value)}
                        placeholder="Payout..."
                        className="h-8.5 text-xs bg-white dark:bg-[#2D2B2C] font-extrabold rounded-xl border-slate-200 dark:border-slate-800"
                      />
                    </div>
                  </div>

                  {/* Dynamic Intermediate Via-Stops */}
                  {line.viaStops.length > 0 && (
                    <div className="space-y-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <div className="flex items-center justify-between text-[10px] font-extrabold text-[#FA634E] uppercase">
                        <span>Intermediate Stops ({line.viaStops.length} stops)</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddViaStop(index)}
                          className="h-6 text-[10px] font-bold text-[#FA634E] hover:bg-[#FA634E]/10 px-2 rounded-lg gap-1"
                        >
                          <Plus size={10} /> Add Stop
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {line.viaStops.map((via, viaIdx) => (
                          <div key={via.id} className="flex items-center gap-2 bg-white dark:bg-[#2D2B2C] p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-[#FA634E] shrink-0">Via #{viaIdx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <LocationCombobox
                                customerId={customerId}
                                value={via.locationId}
                                onChange={(val, loc) => {
                                  handleUpdateViaStop(index, viaIdx, val, loc?.name || val);
                                  if (loc?.customerId && !customerId) setCustomerId(loc.customerId);
                                }}
                                placeholder="Select intermediate stop..."
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveViaStop(index, viaIdx)}
                              className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}

            {/* Bottom Keyboard Shortcut Bar */}
            <div className="pt-1 flex items-center justify-end">
              <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                <span>Press</span>
                <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono font-bold border border-slate-200 dark:border-slate-700">Ctrl + Enter</kbd>
                <span>to preview agreement</span>
              </div>
            </div>

            {/* 3. COMMERCIAL SURCHARGES CARD */}
            <div className="bg-white dark:bg-[#2D2B2C] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3 shadow-2xs mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Surcharges
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-mono font-bold px-1.5 py-0 text-slate-600 dark:text-slate-300">
                    {surchargeRules.length}
                  </Badge>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSurchargeRule}
                  className="h-7.5 text-xs font-bold border-dashed border-[#FA634E]/50 text-[#FA634E] hover:bg-[#FA634E]/10 rounded-xl gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus size={13} /> Add Surcharge Rule
                </Button>
              </div>

              {/* Quick Add Presets Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mr-1">
                  Quick Presets:
                </span>
                {COMMON_SURCHARGE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      setSurchargeRules((prev) => [
                        ...prev,
                        {
                          id: `sur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                          name: preset.name,
                          amount: preset.amount,
                          unit: preset.unit,
                        },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-[#FA634E]/10 hover:text-[#FA634E] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {surchargeRules.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-400">
                  <p className="font-bold text-slate-600 dark:text-slate-300">No surcharges configured</p>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {surchargeRules.map((rule, idx) => (
                    <div key={rule.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-3 bg-slate-50/80 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 transition-all">
                      
                      <div className="sm:col-span-5 space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Surcharge Title</span>
                        </Label>
                        <Input
                          value={rule.name}
                          onChange={(e) => handleUpdateSurchargeRule(rule.id, 'name', e.target.value)}
                          placeholder="e.g. Within City Same Day Delivery"
                          className="h-8.5 text-xs bg-white dark:bg-[#2D2B2C] font-extrabold rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-1 focus-visible:ring-[#FA634E]"
                        />
                      </div>

                      <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Amount (SAR)
                        </Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            value={rule.amount}
                            onChange={(e) => handleUpdateSurchargeRule(rule.id, 'amount', e.target.value)}
                            placeholder="75"
                            className="h-8.5 text-xs bg-white dark:bg-[#2D2B2C] font-black rounded-xl border-slate-200 dark:border-slate-800 pr-12 focus-visible:ring-1 focus-visible:ring-[#FA634E]"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                            SAR
                          </span>
                        </div>
                      </div>

                      <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Unit / Frequency
                        </Label>
                        <Select
                          value={rule.unit}
                          onValueChange={(val) => handleUpdateSurchargeRule(rule.id, 'unit', val)}
                        >
                          <SelectTrigger className="h-8.5 text-xs bg-white dark:bg-[#2D2B2C] font-bold border-slate-200 dark:border-slate-800 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[9999]">
                            <SelectItem value="Per Delivery" className="text-xs font-semibold">Per Delivery</SelectItem>
                            <SelectItem value="Per Person" className="text-xs font-semibold">Per Person</SelectItem>
                            <SelectItem value="Per Trip" className="text-xs font-semibold">Per Trip</SelectItem>
                            <SelectItem value="Fixed" className="text-xs font-semibold">Fixed Fee</SelectItem>
                            <SelectItem value="Per Hour" className="text-xs font-semibold">Per Hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="sm:col-span-1 flex justify-end pt-2 sm:pt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSurchargeRule(rule.id)}
                          className="h-8.5 w-8.5 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                          title="Remove surcharge"
                        >
                          <X size={15} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

              </CardContent>
            </Card>

          </div>

        </div>

      </form>

      <QuotationReviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        customerId={customerId}
        customerName={selectedCustomerObj?.name || ''}
        operationType={operationType}
        validFrom={validFrom}
        validTo={validTo}
        lineItems={lineItems}
        surchargeRules={surchargeRules}
        locationNames={locationNameMap}
        editingId={isEdit ? id : undefined}
        saving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
      />

      {/* Official MERCON Commercial Quotation Printable Document Modal */}
      <QuotationPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        customerName={selectedCustomerObj?.name || 'Valued Customer'}
        customerAddress={(selectedCustomerObj as any)?.address || (selectedCustomerObj as any)?.city || 'Riyadh, Saudi Arabia'}
        attnName={(selectedCustomerObj as any)?.contact_person || (selectedCustomerObj as any)?.contact_phone || 'Procurement Department'}
        quoteNo={quotationRefId}
        validFromDate={validFrom ? new Date(validFrom).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}
        validToDate={validTo ? new Date(validTo).toLocaleDateString('en-GB') : '30/04/2026'}
        lineItems={printLineItems}
        surchargeRules={surchargeRules.map((s) => ({ name: s.name, amount: Number(s.amount) || 0, unit: s.unit }))}
      />
    </DashboardLayout>
  );
}
