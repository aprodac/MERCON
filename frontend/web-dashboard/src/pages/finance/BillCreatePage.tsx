import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  Trash2,
  Building2,
  Receipt,
  Calculator,
  BookOpen,
  Search,
  CheckSquare,
  Square,
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

  // Expense filter & selection
  const [expenseSearch, setExpenseSearch] = useState('');
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
  const unbilledExpenses = useMemo(() => unbilledExpensesRes?.data || [], [unbilledExpensesRes]);
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);
  const expenseAccounts = postableAccounts.filter((a) => a.account_type === 'Expense');

  // Filtered expenses based on search
  const filteredExpenses = useMemo(() => {
    if (!expenseSearch.trim()) return unbilledExpenses;
    const q = expenseSearch.toLowerCase();
    return unbilledExpenses.filter((e: any) => {
      const ref = (e.ref_id || `EXP-${e.id}`).toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const desc = (e.description || '').toLowerCase();
      return ref.includes(q) || cat.includes(q) || desc.includes(q);
    });
  }, [unbilledExpenses, expenseSearch]);

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
    if (selectedExpenseIds.length === filteredExpenses.length) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(filteredExpenses.map((e: any) => e.id));
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
      toast.error('Select a provider or enter an ad-hoc payee name');
      return;
    }
    if (selectedExpenseIds.length === 0 && manualLines.length === 0) {
      toast.error('Select at least one expense or add a manual expense line');
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
      <div className="bg-[#F8FAFC] dark:bg-slate-950 px-4 sm:px-6 py-4 space-y-4 max-w-[1400px] mx-auto pb-16 min-h-full">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Main Content Area (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* 1. Provider & Billing Details Card */}
            <Card className="py-0 gap-0 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#FA634E]" />
                  Vendor / Provider & Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Provider (Vendor Account)
                  </Label>
                  <Select
                    value={providerId || 'none'}
                    onValueChange={(v) => setProviderId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
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

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Or Ad-hoc Payee Name
                  </Label>
                  <Input
                    placeholder="e.g. Local Maintenance Workshop"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    disabled={!!providerId}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Bill Date *
                  </Label>
                  <Input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Payment Due Date
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="space-y-1 max-w-xs">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      VAT / Tax Amount (SAR)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. Operational Expenses Card */}
            <Card className="py-0 gap-0 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-[#FA634E]" />
                    Operational Expenses
                  </CardTitle>
                  {unbilledExpenses.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none font-semibold">
                      {selectedExpenseIds.length} of {unbilledExpenses.length} selected
                    </Badge>
                  )}
                </div>

                {unbilledExpenses.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllExpenses}
                    className="h-7 text-xs font-semibold text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2"
                  >
                    {selectedExpenseIds.length === filteredExpenses.length && filteredExpenses.length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {isLoadingExpenses ? (
                  <div className="py-12 px-4 text-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FA634E] mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">Loading unbilled operational expenses...</p>
                  </div>
                ) : unbilledExpenses.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">No operational expenses pending bill recording</p>
                  </div>
                ) : (
                  <div>
                    {/* Search bar if > 3 expenses */}
                    {unbilledExpenses.length > 3 && (
                      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <Input
                            placeholder="Filter expenses by Ref ID, category, or description..."
                            value={expenseSearch}
                            onChange={(e) => setExpenseSearch(e.target.value)}
                            className="h-8 text-xs pl-8 bg-white dark:bg-slate-900"
                          />
                        </div>
                      </div>
                    )}

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[340px] overflow-y-auto">
                      {filteredExpenses.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          No operational expenses match filter "{expenseSearch}"
                        </div>
                      ) : (
                        filteredExpenses.map((exp: any) => {
                          const isSelected = selectedExpenseIds.includes(exp.id);
                          return (
                            <div
                              key={exp.id}
                              onClick={() => toggleExpense(exp.id)}
                              className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-rose-50/60 dark:bg-rose-950/20 border-l-3 border-l-[#FA634E]'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="shrink-0 text-slate-400 hover:text-[#FA634E]">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-[#FA634E]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                      {exp.ref_id || `EXP-${exp.id.slice(0, 6)}`}
                                    </span>
                                    {exp.category && (
                                      <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 px-1.5 py-0">
                                        {exp.category}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {exp.description || 'Operational Expense Item'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs block">
                                  SAR {(Number(exp.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : '—'}
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

            {/* 3. Manual Line Items Card */}
            <Card className="py-0 gap-0 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader className="py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#FA634E]" />
                  Manual Expense Lines
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddManualLine}
                  className="h-7 text-xs font-semibold text-[#FA634E] hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Manual Line
                </Button>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                {manualLines.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No manual bill lines added. Click "Add Manual Line" to map charges directly to GL Expense accounts.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2.5 sm:p-1.5 bg-slate-50/70 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-800 items-center"
                      >
                        <div className="md:col-span-5">
                          <Label className="md:hidden text-[10px] text-slate-400 mb-1 block">Description</Label>
                          <Input
                            placeholder="e.g. Subcontracted transport service"
                            value={line.description}
                            onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)}
                            className="h-8 text-xs bg-white dark:bg-slate-900"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <Label className="md:hidden text-[10px] text-slate-400 mb-1 block">GL Account</Label>
                          <Select
                            value={line.accountId || ''}
                            onValueChange={(v) => handleManualLineChange(idx, 'accountId', v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900">
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
                        <div className="md:col-span-2">
                          <Label className="md:hidden text-[10px] text-slate-400 mb-1 block">Amount (SAR)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.amount || ''}
                            onChange={(e) => handleManualLineChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono text-right bg-white dark:bg-slate-900"
                          />
                        </div>
                        <div className="md:col-span-1 text-right md:text-center pt-1 md:pt-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveManualLine(idx)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
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

          </div>

          {/* Right Summary Sidebar (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="py-0 gap-0 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm sticky top-4">
              <CardHeader className="py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-[#FA634E]" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Selected Expenses ({selectedExpenseIds.length})</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      SAR {expensesSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Manual Lines ({manualLines.length})</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      SAR {manualLinesSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center font-semibold text-slate-700 dark:text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      SAR {estimatedSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>VAT / Tax Amount</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      SAR {(Number(taxAmount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="pt-3 border-t-2 border-slate-900 dark:border-slate-700 flex justify-between items-center text-sm font-black">
                    <span className="text-[#3E3C3D] dark:text-slate-100">Grand Total</span>
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
                    {createMutation.isPending ? 'Saving...' : 'Save Draft Bill'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/finance/bills')}
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

