import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Trash2,
  Truck,
  Building2,
  Calendar,
  Calculator,
  ReceiptText,
  Search,
  CheckSquare,
  Square,
  Percent,
  MessageSquare,
  ShieldCheck,
  Globe,
  Filter,
  ArrowUpDown,
  User,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

import { financeService, CreateInvoiceDTO, InvoiceLineDTO } from '@/services/financeService';
import { customerService } from '@/services/customerService';
import { tripService } from '@/services/tripService';

export default function InvoiceCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Header state
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [taxRate, setTaxRate] = useState<number>(15); // Default 15% VAT
  const [paymentTerms, setPaymentTerms] = useState<string>('net30');

  // Customer Notes & Terms
  const [customerNotes, setCustomerNotes] = useState('Thank you for your business!');
  const [termsConditions, setTermsConditions] = useState('Payment is due within agreed credit terms. Late payments subject to standard service terms.');

  // Trip filter & selection state
  const [tripSearch, setTripSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [lineTypeFilter, setLineTypeFilter] = useState<string>('all');
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>('all');
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [manualLines, setManualLines] = useState<InvoiceLineDTO[]>([]);

  // Helper for location resolution
  const isUuidVal = (str?: string | null) => (str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false);
  const cleanLocName = (name?: string | null) => {
    if (!name || isUuidVal(name)) return null;
    const cleaned = name.replace(/🔁\s*/g, '').trim();
    return cleaned.length > 0 && cleaned !== 'Origin' && cleaned !== 'Destination' ? cleaned : null;
  };

  const resolveTripOrigin = (t: any): string => {
    const pickupStop = t.stops?.find((s: any) => s.stop_type === 'Pickup') || t.stops?.[0];
    const stopLoc = pickupStop ? (
      pickupStop.location?.city ||
      pickupStop.location?.codes?.[0] ||
      (!isUuidVal(pickupStop.location_name) ? pickupStop.location_name : null) ||
      pickupStop.location?.name ||
      pickupStop.location_address ||
      pickupStop.source_label
    ) : null;

    const candidate = (
      cleanLocName(t.origin_city) ||
      cleanLocName(t.origin_location?.name) ||
      cleanLocName(t.origin_location_name) ||
      cleanLocName(t.pickup_city) ||
      cleanLocName(t.pickup_location_name) ||
      cleanLocName(t.pickup) ||
      cleanLocName(stopLoc) ||
      cleanLocName(t.rateCard?.route_origin) ||
      (t.route ? cleanLocName(t.route.split(/[→➔\-]/)[0]) : null)
    );

    return candidate || '—';
  };

  const resolveTripDestination = (t: any): string => {
    const dropoffStop = t.stops?.find((s: any) => s.stop_type === 'Dropoff') || 
      (t.stops && t.stops.length > 1 ? t.stops[t.stops.length - 1] : undefined);
    const stopLoc = dropoffStop ? (
      dropoffStop.location?.city ||
      dropoffStop.location?.codes?.[0] ||
      (!isUuidVal(dropoffStop.location_name) ? dropoffStop.location_name : null) ||
      dropoffStop.location?.name ||
      dropoffStop.location_address ||
      dropoffStop.source_label
    ) : null;

    const candidate = (
      cleanLocName(t.destination_city) ||
      cleanLocName(t.destination_location?.name) ||
      cleanLocName(t.destination_location_name) ||
      cleanLocName(t.dropoff_city) ||
      cleanLocName(t.dropoff_location_name) ||
      cleanLocName(t.dropoff) ||
      cleanLocName(stopLoc) ||
      cleanLocName(t.rateCard?.route_destination) ||
      (t.route ? cleanLocName(t.route.split(/[→➔\-]/)[1]) : null)
    );

    return candidate || '—';
  };

  // Fetch customers
  const { data: customersRes, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customerService.getAll({ per_page: 500 } as any),
  });

  // Fetch completed, unbilled trips for selected customer
  const { data: unbilledTripsRes, isLoading: isLoadingTrips } = useQuery({
    queryKey: ['trips', 'completed-unbilled', customerId],
    queryFn: () => tripService.getAll({ customer_id: customerId, status: 'Completed', per_page: 200 }),
    enabled: !!customerId,
  });

  const customers = customersRes?.data || [];
  const selectedCustomer = useMemo(() => customers.find((c: any) => c.id === customerId), [customers, customerId]);

  const unbilledTrips = useMemo(() => {
    return (unbilledTripsRes?.data || []).filter((t: any) => !t.invoiceId);
  }, [unbilledTripsRes]);

  // Extract unique filter options
  const availableVehicles = useMemo(() => {
    const set = new Set<string>();
    unbilledTrips.forEach((t: any) => {
      if (t.vehicle_type) set.add(t.vehicle_type);
    });
    return Array.from(set);
  }, [unbilledTrips]);

  const availableLineTypes = useMemo(() => {
    const set = new Set<string>();
    unbilledTrips.forEach((t: any) => {
      const lt = t.rate_category || t.line_type?.name || t.quotation_line_type || t.financials?.quotation_line_type || t.rateCard?.rate_category;
      if (lt) set.add(lt);
    });
    return Array.from(set);
  }, [unbilledTrips]);

  const availableOperationTypes = useMemo(() => {
    const set = new Set<string>();
    unbilledTrips.forEach((t: any) => {
      const op = t.operation_type || t.billing_type || t.quotation_billing_type || t.financials?.quotation_billing_type || t.rateCard?.billing_type;
      if (op) set.add(op);
    });
    return Array.from(set);
  }, [unbilledTrips]);

  // Filtered unbilled trips
  const filteredTrips = useMemo(() => {
    let result = [...unbilledTrips];

    // Vehicle filter
    if (vehicleFilter !== 'all') {
      result = result.filter((t: any) => t.vehicle_type === vehicleFilter);
    }

    // Line Type filter
    if (lineTypeFilter !== 'all') {
      result = result.filter((t: any) => {
        const lt = t.rate_category || t.line_type?.name || t.quotation_line_type || t.financials?.quotation_line_type || t.rateCard?.rate_category;
        return lt === lineTypeFilter;
      });
    }

    // Operation Type filter
    if (operationTypeFilter !== 'all') {
      result = result.filter((t: any) => {
        const op = t.operation_type || t.billing_type || t.quotation_billing_type || t.financials?.quotation_billing_type || t.rateCard?.billing_type;
        return op === operationTypeFilter;
      });
    }

    // Search filter
    if (tripSearch.trim()) {
      const q = tripSearch.toLowerCase();
      result = result.filter((t: any) => {
        const ref = (t.ref_id || `TRIP-${t.id}`).toLowerCase();
        const origin = resolveTripOrigin(t).toLowerCase();
        const dest = resolveTripDestination(t).toLowerCase();
        const vehicle = (t.vehicle_type || '').toLowerCase();
        const driver = (t.driver?.name || t.driver_name || `${t.driver?.first_name || ''} ${t.driver?.last_name || ''}`).toLowerCase();
        const lineType = (t.rate_category || t.line_type?.name || '').toLowerCase();
        const opType = (t.operation_type || t.billing_type || '').toLowerCase();
        return ref.includes(q) || origin.includes(q) || dest.includes(q) || vehicle.includes(q) || driver.includes(q) || lineType.includes(q) || opType.includes(q);
      });
    }

    return result;
  }, [unbilledTrips, tripSearch, vehicleFilter, lineTypeFilter, operationTypeFilter]);

  // Mutation
  const createMutation = useMutation({
    mutationFn: financeService.createDraftInvoice,
    onSuccess: () => {
      toast.success('Draft invoice created successfully');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/finance/invoices');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create invoice');
    },
  });

  // Payment terms change handler
  const handleTermsChange = (term: string) => {
    setPaymentTerms(term);
    const baseDate = new Date(invoiceDate || new Date());
    if (term === 'due_on_receipt') {
      setDueDate(baseDate.toISOString().split('T')[0]);
    } else if (term === 'net15') {
      baseDate.setDate(baseDate.getDate() + 15);
      setDueDate(baseDate.toISOString().split('T')[0]);
    } else if (term === 'net30') {
      baseDate.setDate(baseDate.getDate() + 30);
      setDueDate(baseDate.toISOString().split('T')[0]);
    } else if (term === 'net60') {
      baseDate.setDate(baseDate.getDate() + 60);
      setDueDate(baseDate.toISOString().split('T')[0]);
    }
  };

  // Trip selection helpers
  const toggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  const selectAllTrips = () => {
    if (selectedTripIds.length === filteredTrips.length) {
      setSelectedTripIds([]);
    } else {
      setSelectedTripIds(filteredTrips.map((t: any) => t.id));
    }
  };

  // Manual line helpers
  const handleAddManualLine = () => {
    setManualLines([
      ...manualLines,
      { description: '', rate: 0, amount: 0, quantity: 1 },
    ]);
  };

  const handleManualLineChange = (index: number, field: keyof InvoiceLineDTO, value: any) => {
    const updated = [...manualLines];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'rate' || field === 'quantity') {
      const qty = field === 'quantity' ? Number(value) : Number(updated[index].quantity || 1);
      const rate = field === 'rate' ? Number(value) : Number(updated[index].rate || 0);
      updated[index].amount = qty * rate;
    }
    setManualLines(updated);
  };

  const handleRemoveManualLine = (index: number) => {
    setManualLines(manualLines.filter((_, i) => i !== index));
  };

  // Subtotal and tax calculation
  const tripsSubtotal = useMemo(() => {
    return unbilledTrips
      .filter((t: any) => selectedTripIds.includes(t.id))
      .reduce((sum: number, t: any) => sum + (Number(t.billing_amount) || 0), 0);
  }, [unbilledTrips, selectedTripIds]);

  const manualLinesSubtotal = useMemo(() => {
    return manualLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }, [manualLines]);

  const estimatedSubtotal = tripsSubtotal + manualLinesSubtotal;
  const estimatedTaxAmount = (estimatedSubtotal * (Number(taxRate) || 0)) / 100;
  const estimatedGrandTotal = estimatedSubtotal + estimatedTaxAmount;

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error('Please select a customer account');
      return;
    }
    if (selectedTripIds.length === 0 && manualLines.length === 0) {
      toast.error('Select at least one trip or add a custom line item');
      return;
    }

    const payload: CreateInvoiceDTO = {
      customerId,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      tax_rate: Number(taxRate) || 0,
      tripIds: selectedTripIds,
      lines: manualLines.filter((l) => l.description.trim() && l.amount >= 0),
    };

    createMutation.mutate(payload);
  };

  return (
    <DashboardLayout active="finance" title="New Draft Invoice">
      <div className="bg-[#F8FAFC] px-4 sm:px-6 py-4 space-y-4 max-w-[1400px] mx-auto pb-16 min-h-full">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Main Form Content (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* 1. Customer & Billing Card (Zoho Books Design) */}
            <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-3 px-4 border-b border-border dark:border-border bg-muted/50 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#FA634E]" />
                  Customer & Billing Context
                </CardTitle>

                {selectedCustomer && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium">
                      <Globe className="w-3 h-3 mr-1 text-emerald-600 inline" /> Currency: SAR
                    </Badge>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
                {/* Customer Select */}
                <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Customer Account *
                  </Label>
                  <Select
                    value={customerId}
                    onValueChange={(v) => {
                      setCustomerId(v);
                      setSelectedTripIds([]);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs bg-muted/30 border-border">
                      <SelectValue placeholder="Select billing customer account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingCustomers ? (
                        <SelectItem value="loading" disabled>Loading customers...</SelectItem>
                      ) : (
                        customers.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Terms Selector */}
                <div className="sm:col-span-1 lg:col-span-3 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Payment Terms
                  </Label>
                  <Select value={paymentTerms} onValueChange={handleTermsChange}>
                    <SelectTrigger className="h-9 text-xs bg-muted/30 border-border">
                      <SelectValue placeholder="Terms..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                      <SelectItem value="net15">Net 15 Days</SelectItem>
                      <SelectItem value="net30">Net 30 Days</SelectItem>
                      <SelectItem value="net60">Net 60 Days</SelectItem>
                      <SelectItem value="custom">Custom Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dates & VAT */}
                <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Invoice Date *
                  </Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Payment Due Date
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Percent className="w-3 h-3 text-muted-foreground" /> VAT Rate (%)
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-mono pr-7"
                      placeholder="15"
                    />
                    <span className="absolute right-2.5 top-2 text-xs font-semibold text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. Unbilled Operational Trips Card (Upgraded Operational Component) */}
            <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-2.5 px-4 border-b border-border dark:border-border bg-muted/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-[#FA634E]" />
                    Unbilled Trips
                  </CardTitle>
                  {customerId && unbilledTrips.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] bg-muted text-foreground border-none font-medium">
                        {unbilledTrips.length} Available
                      </Badge>
                      <Badge className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-[#FA634E] border border-rose-200 dark:bg-rose-950/40 font-bold">
                        {selectedTripIds.length} Selected (SAR {tripsSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                      </Badge>
                    </div>
                  )}
                </div>

                {customerId && unbilledTrips.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllTrips}
                    className="h-7 text-xs font-bold text-[#FA634E] hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:hover:bg-rose-950/30 px-2"
                  >
                    {selectedTripIds.length === filteredTrips.length && filteredTrips.length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {!customerId ? (
                  <div className="py-12 px-4 text-center">
                    <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Select a customer account to view unbilled trips</p>
                  </div>
                ) : isLoadingTrips ? (
                  <div className="py-12 px-4 text-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FA634E] mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Loading completed unbilled trips...</p>
                  </div>
                ) : unbilledTrips.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">No completed unbilled trips for this customer</p>
                  </div>
                ) : (
                  <div>
                    {/* Advanced Multi-Filter Bar */}
                    <div className="p-2.5 border-b border-border dark:border-border bg-muted/40 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-3 relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                        <Input
                          placeholder="Search trip..."
                          value={tripSearch}
                          onChange={(e) => setTripSearch(e.target.value)}
                          className="h-8 text-xs pl-8 bg-card"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                          <SelectTrigger className="h-8 text-xs bg-card">
                            <Filter className="w-3 h-3 mr-1 text-muted-foreground inline" />
                            <SelectValue placeholder="Vehicle Class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Vehicles ({unbilledTrips.length})</SelectItem>
                            {availableVehicles.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="sm:col-span-3">
                        <Select value={lineTypeFilter} onValueChange={setLineTypeFilter}>
                          <SelectTrigger className="h-8 text-xs bg-card">
                            <Filter className="w-3 h-3 mr-1 text-muted-foreground inline" />
                            <SelectValue placeholder="Line Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Line Types ({availableLineTypes.length})</SelectItem>
                            {availableLineTypes.map((lt) => (
                              <SelectItem key={lt} value={lt}>
                                {lt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="sm:col-span-3">
                        <Select value={operationTypeFilter} onValueChange={setOperationTypeFilter}>
                          <SelectTrigger className="h-8 text-xs bg-card">
                            <Filter className="w-3 h-3 mr-1 text-muted-foreground inline" />
                            <SelectValue placeholder="Operation Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Operation Types ({availableOperationTypes.length})</SelectItem>
                            {availableOperationTypes.map((op) => (
                              <SelectItem key={op} value={op}>
                                {op}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Trips list */}
                    <div className="divide-y divide-border/60 dark:divide-border/60 max-h-[360px] overflow-y-auto">
                      {filteredTrips.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          No trips match current filters
                        </div>
                      ) : (
                        filteredTrips.map((t: any) => {
                          const isSelected = selectedTripIds.includes(t.id);
                          const originName = resolveTripOrigin(t);
                          const destName = resolveTripDestination(t);
                          const driverName = t.driver ? `${t.driver.first_name || ''} ${t.driver.last_name || ''}`.trim() : (t.driver_name || null);
                          const lineTypeVal = t.rate_category || t.line_type?.name || t.quotation_line_type || t.financials?.quotation_line_type || t.rateCard?.rate_category;
                          const opTypeVal = t.operation_type || t.billing_type || t.quotation_billing_type || t.financials?.quotation_billing_type || t.rateCard?.billing_type;

                          return (
                            <div
                              key={t.id}
                              onClick={() => toggleTrip(t.id)}
                              className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20/60 dark:bg-rose-950/20 border-l-3 border-l-[#FA634E]'
                                  : 'hover:bg-muted/80 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="shrink-0 text-muted-foreground hover:text-[#FA634E]">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-[#FA634E]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-foreground">
                                      {t.ref_id || `TRIP-${t.id.slice(0, 6)}`}
                                    </span>
                                    {t.vehicle_type && (
                                      <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground dark:text-muted-foreground px-1.5 py-0">
                                        {t.vehicle_type}
                                      </Badge>
                                    )}
                                    {lineTypeVal && (
                                      <Badge variant="outline" className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 px-1.5 py-0">
                                        {lineTypeVal}
                                      </Badge>
                                    )}
                                    {opTypeVal && (
                                      <Badge variant="outline" className="text-[10px] font-semibold text-emerald-700 bg-emerald-500/10 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 px-1.5 py-0">
                                        {opTypeVal}
                                      </Badge>
                                    )}
                                    {driverName && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <User className="w-2.5 h-2.5 text-muted-foreground" /> {driverName}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#FA634E] shrink-0" />
                                    <span className="font-medium text-foreground">{originName}</span>
                                    <span className="text-muted-foreground font-bold">➔</span>
                                    <span className="font-medium text-foreground">{destName}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-mono font-bold text-foreground text-xs block">
                                  SAR {(Number(t.billing_amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : 'Completed'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Custom Charges Card */}
            <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-2.5 px-4 border-b border-border dark:border-border bg-muted/50 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 text-[#FA634E]" />
                  Custom Charges
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddManualLine}
                  className="h-7 text-xs font-semibold text-[#FA634E] hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:hover:bg-rose-950/30 px-2"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Charge Line
                </Button>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                {manualLines.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No custom charge lines added. Click "Add Charge Line" for detention fees, labor, or extra services.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div className="col-span-5">Description</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Rate (SAR)</div>
                      <div className="col-span-2 text-right">Total (SAR)</div>
                      <div className="col-span-1 text-center">Action</div>
                    </div>

                    {manualLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 sm:p-1.5 bg-muted/70 rounded-lg border border-border dark:border-border items-center"
                      >
                        <div className="sm:col-span-5">
                          <Label className="sm:hidden text-[10px] text-muted-foreground mb-1 block">Description</Label>
                          <Input
                            placeholder="e.g. Detention fee / Offloading charge"
                            value={line.description}
                            onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)}
                            className="h-8 text-xs bg-card"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="sm:hidden text-[10px] text-muted-foreground mb-1 block">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={line.quantity || 1}
                            onChange={(e) => handleManualLineChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="h-8 text-xs font-mono text-center bg-card"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="sm:hidden text-[10px] text-muted-foreground mb-1 block">Rate (SAR)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.rate || ''}
                            onChange={(e) => handleManualLineChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono text-right bg-card"
                          />
                        </div>
                        <div className="sm:col-span-2 flex sm:block justify-between items-center text-right py-1 sm:py-0">
                          <span className="sm:hidden text-[10px] text-muted-foreground">Total:</span>
                          <span className="font-mono font-bold text-foreground text-xs">
                            {(Number(line.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="sm:col-span-1 text-right sm:text-center pt-1 sm:pt-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveManualLine(idx)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Customer Notes & Terms (Zoho Books Footer Style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs">
                <CardHeader className="py-2 px-3.5 border-b border-border dark:border-border bg-muted/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-[#FA634E]" /> Customer Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <Textarea
                    rows={2}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Notes visible to customer on invoice..."
                    className="text-xs resize-none border-border focus:border-[#FA634E]"
                  />
                </CardContent>
              </Card>

              <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs">
                <CardHeader className="py-2 px-3.5 border-b border-border dark:border-border bg-muted/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-[#FA634E]" /> Terms & Conditions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <Textarea
                    rows={2}
                    value={termsConditions}
                    onChange={(e) => setTermsConditions(e.target.value)}
                    placeholder="Terms and payment rules..."
                    className="text-xs resize-none border-border focus:border-[#FA634E]"
                  />
                </CardContent>
              </Card>
            </div>

          </div>

          {/* Right Summary Sidebar (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="py-0 gap-0 border border-border dark:border-border bg-card rounded-xl shadow-xs sticky top-4">
              <CardHeader className="py-2.5 px-4 border-b border-border dark:border-border bg-muted/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-[#FA634E]" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center text-muted-foreground dark:text-muted-foreground">
                    <span>Selected Trips ({selectedTripIds.length})</span>
                    <span className="font-mono font-semibold text-foreground">
                      SAR {tripsSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-muted-foreground dark:text-muted-foreground">
                    <span>Custom Charges ({manualLines.length})</span>
                    <span className="font-mono font-semibold text-foreground">
                      SAR {manualLinesSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border dark:border-border flex justify-between items-center font-semibold text-foreground">
                    <span>Subtotal (excl. VAT)</span>
                    <span className="font-mono font-bold text-foreground">
                      SAR {estimatedSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-muted-foreground dark:text-muted-foreground">
                    <span>VAT ({taxRate}%)</span>
                    <span className="font-mono font-semibold text-foreground">
                      SAR {estimatedTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="pt-3 border-t-2 border-border dark:border-border flex justify-between items-center text-sm font-black">
                    <span className="text-[#3E3C3D]">Grand Total</span>
                    <span className="font-mono text-base text-[#FA634E]">
                      SAR {estimatedGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="pt-3 space-y-2">
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={createMutation.isPending}
                    className="w-full bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-xs font-bold h-9 text-xs"
                  >
                    {createMutation.isPending ? 'Saving...' : 'Save Draft Invoice'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/finance/invoices')}
                    className="w-full h-8 text-xs font-medium"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        </form>
      </div>
    </DashboardLayout>
  );
}

