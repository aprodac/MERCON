import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Truck,
  Building2,
  Calendar,
  Calculator,
  ReceiptText,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [taxRate, setTaxRate] = useState<number>(0);

  // Line item states
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [manualLines, setManualLines] = useState<InvoiceLineDTO[]>([]);

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
  const unbilledTrips = (unbilledTripsRes?.data || []).filter((t: any) => !t.invoiceId);

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

  // Trip selection helpers
  const toggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  const selectAllTrips = () => {
    if (selectedTripIds.length === unbilledTrips.length) {
      setSelectedTripIds([]);
    } else {
      setSelectedTripIds(unbilledTrips.map((t: any) => t.id));
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
      toast.error('Please select a customer');
      return;
    }
    if (selectedTripIds.length === 0 && manualLines.length === 0) {
      toast.error('Select at least one trip or add a manual line item');
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
      <div className="p-6 space-y-6 max-w-7xl mx-auto pb-16">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/finance/invoices')}
              className="h-9 text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-[#3E3C3D] dark:text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-[#FA634E]" />
                New Invoice (Draft)
              </h1>
              <p className="text-xs text-slate-500">
                Create a draft customer invoice from completed operational trips or custom charges.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/finance/invoices')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-semibold"
            >
              {createMutation.isPending ? 'Saving Draft...' : 'Save Draft Invoice'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area (Left 2 columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Header Details Card */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#FA634E]" />
                  Customer & Billing Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Customer Account *
                  </Label>
                  <Select
                    value={customerId}
                    onValueChange={(v) => {
                      setCustomerId(v);
                      setSelectedTripIds([]);
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select billing customer..." />
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

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Invoice Date *
                  </Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Payment Due Date
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    VAT Tax Rate (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm font-mono"
                    placeholder="15"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Completed Unbilled Trips Card */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#FA634E]" />
                    Completed & Unbilled Operational Trips
                  </CardTitle>
                </div>
                {customerId && unbilledTrips.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllTrips}
                    className="h-7 text-xs text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    {selectedTripIds.length === unbilledTrips.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {!customerId ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Please select a customer above to view their unbilled trips.
                  </div>
                ) : isLoadingTrips ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Loading unbilled trips for customer...
                  </div>
                ) : unbilledTrips.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No completed unbilled trips found for this customer.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                    {unbilledTrips.map((t: any) => {
                      const isSelected = selectedTripIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleTrip(t.id)}
                          className={`p-3.5 flex items-center justify-between gap-4 text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-rose-50/60 dark:bg-rose-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTrip(t.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded text-[#FA634E] h-4 w-4 border-slate-300 focus:ring-[#FA634E]"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#3E3C3D] dark:text-slate-200">
                                  {t.ref_id || `TRIP-${t.id.slice(0, 6)}`}
                                </span>
                                {t.vehicle_type && (
                                  <Badge variant="outline" className="text-[10px] text-slate-600">
                                    {t.vehicle_type}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {t.origin_city || t.origin_location?.name || 'Origin'} →{' '}
                                {t.destination_city || t.destination_location?.name || 'Destination'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm block">
                              SAR {(Number(t.billing_amount) || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Completed: {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Manual / Custom Line Items Card */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-[#FA634E]" />
                  Custom & Adjustment Line Items
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddManualLine}
                  className="h-7 text-xs text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Line Item
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                {manualLines.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No custom line items added yet. Click "Add Line Item" to include manual charges or surcharges.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {manualLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex-1">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Description</Label>
                          <Input
                            placeholder="e.g. Detention surcharge / Offloading fee"
                            value={line.description}
                            onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="w-24">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={line.quantity || 1}
                            onChange={(e) => handleManualLineChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="h-9 text-xs font-mono text-center"
                          />
                        </div>
                        <div className="w-32">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Unit Rate (SAR)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.rate || ''}
                            onChange={(e) => handleManualLineChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                            className="h-9 text-xs font-mono text-right"
                          />
                        </div>
                        <div className="w-32 text-right">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Total (SAR)</Label>
                          <span className="h-9 flex items-center justify-end font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {(Number(line.amount) || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="sm:pt-5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveManualLine(idx)}
                            className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Summary Sidebar (1 column) */}
          <div className="space-y-6">
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[#FA634E]" />
                  Invoice Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Selected Trips ({selectedTripIds.length}):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {tripsSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Manual Lines ({manualLines.length}):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {manualLinesSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                    <span>Subtotal (excl. VAT):</span>
                    <span className="font-mono font-bold">
                      SAR {estimatedSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>VAT Tax ({taxRate}%):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {estimatedTaxAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-3 border-t-2 border-slate-900 dark:border-slate-700 flex justify-between items-center text-sm font-black">
                    <span className="text-[#3E3C3D] dark:text-slate-100">Grand Total:</span>
                    <span className="font-mono text-base text-[#FA634E]">
                      SAR {estimatedGrandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={createMutation.isPending}
                    className="w-full bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-bold h-10"
                  >
                    {createMutation.isPending ? 'Saving...' : 'Save Draft Invoice'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/finance/invoices')}
                    className="w-full h-10"
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
