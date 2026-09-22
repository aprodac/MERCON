import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  Trash2,
  ArrowLeft,
  Building2,
  Receipt,
  Calculator,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

import { financeService, CreateBillDTO, BillLineDTO } from '@/services/financeService';
import { thirdPartyService } from '@/services/thirdPartyService';
import { expenseService } from '@/services/expenseService';
import type { Account } from '@mercon/shared-types';

export default function BillCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Header state
  const [providerId, setProviderId] = useState<string>('');
  const [payeeName, setPayeeName] = useState('');
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [taxAmount, setTaxAmount] = useState<number>(0);

  // Line item states
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [manualLines, setManualLines] = useState<BillLineDTO[]>([]);

  // Fetch third-party providers
  const { data: providersRes, isLoading: isLoadingProviders } = useQuery({
    queryKey: ['third-party-providers', 'all'],
    queryFn: () => thirdPartyService.getAll({ is_active: true, per_page: 500 }),
  });

  // Fetch unbilled operational expenses
  const { data: unbilledExpensesRes, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['expenses', 'unbilled'],
    queryFn: () => expenseService.getAll({ per_page: 200 }),
  });

  // Fetch GL accounts for manual lines
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const providers = providersRes?.data?.data || [];
  const unbilledExpenses = unbilledExpensesRes?.data || [];
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);
  const expenseAccounts = postableAccounts.filter((a) => a.account_type === 'Expense');

  // Mutation
  const createMutation = useMutation({
    mutationFn: financeService.createDraftBill,
    onSuccess: () => {
      toast.success('Draft bill created successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      navigate('/finance/bills');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create bill');
    },
  });

  // Expense selection helpers
  const toggleExpense = (id: string) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllExpenses = () => {
    if (selectedExpenseIds.length === unbilledExpenses.length) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(unbilledExpenses.map((e: any) => e.id));
    }
  };

  // Manual line helpers
  const handleAddManualLine = () => {
    setManualLines([
      ...manualLines,
      { description: '', amount: 0, accountId: null, source_type: 'Manual' },
    ]);
  };

  const handleManualLineChange = (index: number, field: keyof BillLineDTO, value: any) => {
    const updated = [...manualLines];
    updated[index] = { ...updated[index], [field]: value };
    setManualLines(updated);
  };

  const handleRemoveManualLine = (index: number) => {
    setManualLines(manualLines.filter((_, i) => i !== index));
  };

  // Calculations
  const expensesSubtotal = useMemo(() => {
    return unbilledExpenses
      .filter((e: any) => selectedExpenseIds.includes(e.id))
      .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }, [unbilledExpenses, selectedExpenseIds]);

  const manualLinesSubtotal = useMemo(() => {
    return manualLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }, [manualLines]);

  const estimatedSubtotal = expensesSubtotal + manualLinesSubtotal;
  const estimatedGrandTotal = estimatedSubtotal + (Number(taxAmount) || 0);

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId && !payeeName.trim()) {
      toast.error('Select a provider or enter a payee name');
      return;
    }
    if (selectedExpenseIds.length === 0 && manualLines.length === 0) {
      toast.error('Select at least one expense or add a manual line item');
      return;
    }

    const payload: CreateBillDTO = {
      providerId: providerId || null,
      payee_name: payeeName.trim() || null,
      bill_date: billDate,
      due_date: dueDate || null,
      tax_amount: Number(taxAmount) || 0,
      expenseIds: selectedExpenseIds,
      lines: manualLines.filter((l) => l.description.trim() && l.amount >= 0),
    };

    createMutation.mutate(payload);
  };

  return (
    <DashboardLayout active="finance" title="New Draft Bill">
      <div className="p-6 space-y-6 max-w-7xl mx-auto pb-16">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/finance/bills')}
              className="h-9 text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-[#3E3C3D] dark:text-white flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-[#FA634E]" />
                New Bill (Draft)
              </h1>
              <p className="text-xs text-slate-500">
                Record vendor/provider costs and Accounts Payable (AP) before final approval.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/finance/bills')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-semibold"
            >
              {createMutation.isPending ? 'Saving Draft...' : 'Save Draft Bill'}
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
                  Vendor / Provider & Date Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Provider (Third-Party Fleet / Vendor)
                  </Label>
                  <Select
                    value={providerId || 'none'}
                    onValueChange={(v) => setProviderId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select registered provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No registered provider —</SelectItem>
                      {isLoadingProviders ? (
                        <SelectItem value="loading" disabled>Loading providers...</SelectItem>
                      ) : (
                        providers.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Or Ad-hoc Payee Name
                  </Label>
                  <Input
                    placeholder="e.g. Local Maintenance Shop"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    disabled={!!providerId}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Bill Date *
                  </Label>
                  <Input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
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

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tax / VAT Amount (SAR)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm font-mono w-full md:w-1/2"
                    placeholder="0.00"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Operational Expenses Selection Card */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#FA634E]" />
                    Operational Expenses
                  </CardTitle>
                </div>
                {unbilledExpenses.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllExpenses}
                    className="h-7 text-xs text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    {selectedExpenseIds.length === unbilledExpenses.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {isLoadingExpenses ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Loading operational expenses...
                  </div>
                ) : unbilledExpenses.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No operational expenses found.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                    {unbilledExpenses.map((exp: any) => {
                      const isSelected = selectedExpenseIds.includes(exp.id);
                      return (
                        <div
                          key={exp.id}
                          onClick={() => toggleExpense(exp.id)}
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
                              onChange={() => toggleExpense(exp.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded text-[#FA634E] h-4 w-4 border-slate-300 focus:ring-[#FA634E]"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#3E3C3D] dark:text-slate-200">
                                  {exp.ref_id || `EXP-${exp.id.slice(0, 6)}`}
                                </span>
                                {exp.category && (
                                  <Badge variant="outline" className="text-[10px] text-slate-600">
                                    {exp.category}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {exp.description || 'Operational Expense Item'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm block">
                              SAR {(Number(exp.amount) || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Manual Line Items Card (Requires GL Expense Account) */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#3E3C3D] dark:text-slate-200 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#FA634E]" />
                  Manual Expense Lines (GL Account Mapping)
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddManualLine}
                  className="h-7 text-xs text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Manual Line
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                {manualLines.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No manual bill lines added. Click "Add Manual Line" to map charges directly to GL Expense accounts.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {manualLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex-1">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Description</Label>
                          <Input
                            placeholder="e.g. Subcontracted transport service"
                            value={line.description}
                            onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="w-full md:w-64">
                          <Label className="text-[10px] text-slate-500 mb-1 block">GL Expense Account</Label>
                          <Select
                            value={line.accountId || ''}
                            onValueChange={(v) => handleManualLineChange(idx, 'accountId', v)}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select GL expense account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.account_code} - {acc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-full md:w-36">
                          <Label className="text-[10px] text-slate-500 mb-1 block">Amount (SAR)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.amount || ''}
                            onChange={(e) => handleManualLineChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                            className="h-9 text-xs font-mono text-right"
                          />
                        </div>
                        <div className="md:pt-5">
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
                  Bill Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Selected Expenses ({selectedExpenseIds.length}):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {expensesSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Manual Lines ({manualLines.length}):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {manualLinesSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold">
                      SAR {estimatedSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>VAT / Tax Amount:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      SAR {(Number(taxAmount) || 0).toFixed(2)}
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
                    {createMutation.isPending ? 'Saving...' : 'Save Draft Bill'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/finance/bills')}
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
