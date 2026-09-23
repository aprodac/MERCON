import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, User, Building2, Truck, Check, Wallet, Landmark, Info } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { FinancePageHeader, MoneyText } from '@/components/finance/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DatePicker } from '@/components/ui/date-picker';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

import { AdvanceReadinessRail } from '@/components/finance/advances/AdvanceReadinessRail';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { financeService } from '@/services/financeService';
import { customerService } from '@/services/customerService';
import { thirdPartyService } from '@/services/thirdPartyService';
import { driverService } from '@/services/driverService';
import { settingsService } from '@/services/settingsService';
import type { AdvancePartyType, AdvanceDirection, BankAccount, Account, AccountingPeriod } from '@mercon/shared-types';

export default function AdvanceEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const typeParam = searchParams.get('type')?.toLowerCase();
  const partyIdParam = searchParams.get('party_id');

  // Initial Party Type based on query parameter
  const initialType: AdvancePartyType =
    typeParam === 'provider' ? 'Provider' : typeParam === 'employee' ? 'Employee' : 'Customer';

  const [partyType, setPartyType] = useState<AdvancePartyType>(initialType);
  const [partyId, setPartyId] = useState<string>(partyIdParam || '');
  const [partyName, setPartyName] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [advanceDate, setAdvanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState<string>('');
  const [memo, setMemo] = useState<string>('');

  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Direction derived from partyType (engine rules: Customer -> Received, Provider/Employee -> Paid)
  const direction: AdvanceDirection = partyType === 'Customer' ? 'Received' : 'Paid';

  // Synchronize direction / settings defaults when partyType changes
  useEffect(() => {
    setPartyId('');
    setPartyName('');
  }, [partyType]);

  // Fetch Bank Accounts & Accounts
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => financeService.getBankAccounts(),
  });
  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => financeService.getAccounts(),
  });
  const accounts: Account[] = accountsRes?.data || [];

  // Auto-select first bank account if none selected
  useEffect(() => {
    if (!accountId && bankAccounts.length > 0) {
      setAccountId(bankAccounts[0].accountId);
    }
  }, [bankAccounts, accountId]);

  // Fetch Accounting Periods
  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: () => financeService.getAccountingPeriods(),
  });
  const periods = periodsRes?.data || [];

  // Fetch Settings for default advance accounts
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });

  // Fetch Party Options per partyType
  const { data: customersRes } = useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: () => customerService.getAll({ mode: 'lookup' }),
    enabled: partyType === 'Customer',
  });
  const customers = customersRes?.data || [];

  const { data: providersRes } = useQuery({
    queryKey: ['thirdPartyProviders'],
    queryFn: () => thirdPartyService.getAll(),
    enabled: partyType === 'Provider',
  });
  const providers = (providersRes as any)?.data?.data || (providersRes as any)?.data || [];

  const { data: driversRes } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: () => driverService.getAll({ mode: 'lookup' }),
    enabled: partyType === 'Employee',
  });
  const drivers = (driversRes as any)?.data || [];

  // Party stats for inline hint
  const { data: customerInvoicesRes } = useQuery({
    queryKey: ['invoices', 'unpaid', partyId],
    queryFn: () => financeService.getInvoices({ customer_id: partyId, status: 'unpaid' as any }),
    enabled: partyType === 'Customer' && Boolean(partyId),
  });

  const { data: providerBillsRes } = useQuery({
    queryKey: ['bills', 'unpaid', partyId],
    queryFn: () => financeService.getBills({ provider_id: partyId, status: 'unpaid' as any }),
    enabled: partyType === 'Provider' && Boolean(partyId),
  });

  const partyHint = useMemo(() => {
    if (!partyId) return null;

    if (partyType === 'Customer') {
      const invs = customerInvoicesRes?.data || [];
      const totalDue = invs.reduce((sum: number, i: any) => sum + Number(i.balance_due || 0), 0);
      return { count: invs.length, totalDue, typeLabel: 'invoices' };
    } else if (partyType === 'Provider') {
      const blls = providerBillsRes?.data || [];
      const totalDue = blls.reduce((sum: number, b: any) => sum + Number(b.balance_due || 0), 0);
      return { count: blls.length, totalDue, typeLabel: 'bills' };
    }
    return null;
  }, [partyType, partyId, customerInvoicesRes, providerBillsRes]);

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: financeService.createAdvance,
    onSuccess: (res, variables, context) => {
      toast.success('Advance created successfully');
      queryClient.invalidateQueries({ queryKey: ['advances'] });

      const newAdvance = res.data;
      const autoApply = (context as any)?.shouldApply;

      if (autoApply && newAdvance?.id) {
        navigate(`/finance/advances/${newAdvance.id}?apply=true`);
      } else if (newAdvance?.id) {
        navigate(`/finance/advances/${newAdvance.id}`);
      } else {
        navigate('/finance/advances');
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create advance';
      setApiError(msg);
      toast.error(msg);
    },
  });

  const handleSave = (shouldApply = false) => {
    setApiError(null);
    if (!accountId) {
      toast.error('Please select a Bank / Cash account');
      return;
    }
    if (amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    createMutation.mutate(
      {
        party_type: partyType,
        party_id: partyId || null,
        direction,
        amount,
        advance_date: advanceDate,
        accountId,
        memo,
        currency: 'SAR',
      },
      {
        context: { shouldApply },
      } as any
    );
  };

  // Readiness Check for Footer Button State
  const dateObj = new Date(advanceDate);
  const openPeriodCoversDate = periods.some(
    (p: any) => p.status === 'Open' && new Date(p.start_date) <= dateObj && new Date(p.end_date) >= dateObj
  );
  let defaultAdvAccountId: string | null | undefined = null;
  if (direction === 'Received' && partyType === 'Customer') {
    defaultAdvAccountId = settings?.defaultCustomerAdvanceAccountId;
  } else if (direction === 'Paid' && partyType === 'Provider') {
    defaultAdvAccountId = settings?.defaultProviderAdvanceAccountId;
  } else if (direction === 'Paid' && partyType === 'Employee') {
    defaultAdvAccountId = settings?.defaultEmployeeAdvanceAccountId;
  }

  const isFormValid = openPeriodCoversDate && Boolean(defaultAdvAccountId) && Boolean(accountId) && amount > 0;

  return (
    <DashboardLayout active="finance" title="New Advance">
      <div className="p-6 max-w-[1400px] mx-auto space-y-6 pb-24">
        {/* Header */}
        <FinancePageHeader
          crumbs={[
            { label: 'Finance', href: '/finance' },
            { label: 'Advances', href: '/finance/advances' },
            { label: 'New advance' },
          ]}
          title="New Advance"
          subtitle="Record money received ahead from a customer, or paid out to a provider or employee."
        />

        {/* 2-Column Layout */}
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Main Form (Left Column) */}
          <div className="flex-1 space-y-6 w-full">
            {/* Card 1: What kind of advance? */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  1. What kind of advance?
                </h2>
                <p className="text-xs text-slate-500">
                  Select the party and flow direction. Invalid combinations are automatically prevented.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Customer Advance */}
                <div
                  onClick={() => setPartyType('Customer')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-2 relative ${
                    partyType === 'Customer'
                      ? 'border-[#FA634E] bg-sky-50/40 dark:bg-sky-950/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 flex items-center justify-center font-bold">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 text-[10px] font-semibold">
                      ↓ Money in
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Customer Advance</h3>
                    <p className="text-[11.5px] text-slate-500 leading-snug">
                      Money received from a customer before invoicing.
                    </p>
                  </div>
                </div>

                {/* Provider Advance */}
                <div
                  onClick={() => setPartyType('Provider')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-2 relative ${
                    partyType === 'Provider'
                      ? 'border-[#FA634E] bg-purple-50/40 dark:bg-purple-950/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 text-[10px] font-semibold">
                      ↑ Money out
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Provider Advance</h3>
                    <p className="text-[11.5px] text-slate-500 leading-snug">
                      Money paid to a provider ahead of their bill.
                    </p>
                  </div>
                </div>

                {/* Employee Advance */}
                <div
                  onClick={() => setPartyType('Employee')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-2 relative ${
                    partyType === 'Employee'
                      ? 'border-[#FA634E] bg-teal-50/40 dark:bg-teal-950/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-300 flex items-center justify-center font-bold">
                      <User className="w-4 h-4" />
                    </div>
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 text-[10px] font-semibold">
                      ↑ Money out
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Employee Advance</h3>
                    <p className="text-[11.5px] text-slate-500 leading-snug">
                      Salary or trip advance paid to a driver.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Party & Advance Amount */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                2. Party & Advance Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Party Combobox Picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {partyType} Party
                  </Label>
                  <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isPartyPopoverOpen}
                        className="w-full justify-between h-10 text-xs font-medium border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900"
                      >
                        {partyName || 'General / not linked'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput placeholder={`Search ${partyType.toLowerCase()}s...`} />
                        <CommandList>
                          <CommandEmpty>No {partyType.toLowerCase()} found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setPartyId('');
                                setPartyName('General / not linked');
                                setIsPartyPopoverOpen(false);
                              }}
                            >
                              <span className="font-semibold text-slate-500">General / not linked</span>
                            </CommandItem>

                            {partyType === 'Customer' &&
                              customers.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  onSelect={() => {
                                    setPartyId(c.id);
                                    setPartyName(c.name);
                                    setIsPartyPopoverOpen(false);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold text-[10px] flex items-center justify-center">
                                    {c.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <span>{c.name}</span>
                                </CommandItem>
                              ))}

                            {partyType === 'Provider' &&
                              providers.map((p: any) => (
                                <CommandItem
                                  key={p.id}
                                  onSelect={() => {
                                    setPartyId(p.id);
                                    setPartyName(p.name);
                                    setIsPartyPopoverOpen(false);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center">
                                    {p.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <span>{p.name}</span>
                                </CommandItem>
                              ))}

                            {partyType === 'Employee' &&
                              drivers.map((d: any) => {
                                const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Driver';
                                return (
                                  <CommandItem
                                    key={d.id}
                                    onSelect={() => {
                                      setPartyId(d.id);
                                      setPartyName(fullName);
                                      setIsPartyPopoverOpen(false);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 font-bold text-[10px] flex items-center justify-center">
                                      {fullName.slice(0, 2).toUpperCase()}
                                    </div>
                                    <span>{fullName}</span>
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Inline Party Hint */}
                  {partyHint && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>Open {partyHint.typeLabel}: <strong>{partyHint.count}</strong></span>
                      <span>Total due: <MoneyText value={partyHint.totalDue} className="font-bold text-slate-900 dark:text-slate-100" /></span>
                    </div>
                  )}
                </div>

                {/* Advance Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Advance Date
                  </Label>
                  <DatePicker
                    value={advanceDate ? new Date(advanceDate) : undefined}
                    onChange={(d) => setAdvanceDate(d ? d.toISOString().split('T')[0] : '')}
                  />
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Advance Amount (SAR)
                </Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-sm text-slate-400">
                    SAR
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="pl-14 h-12 fin-num font-bold text-xl text-slate-900 dark:text-slate-100 focus-visible:ring-[#FA634E]"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Account Selection (Deposit to / Paid from) */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  3. {direction === 'Received' ? 'Deposit To (Money In)' : 'Paid From (Money Out)'}
                </h2>
                <p className="text-xs text-slate-500">
                  Choose the bank account or cash drawer where funds are deposited or paid from.
                </p>
              </div>

              {/* Radio cards for bank accounts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bankAccounts.map((b) => {
                  const selected = accountId === b.accountId;
                  const glAcc = accounts.find((a) => a.id === b.accountId);

                  return (
                    <div
                      key={b.id}
                      onClick={() => setAccountId(b.accountId)}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                        selected
                          ? 'border-[#FA634E] bg-orange-50/20 dark:bg-orange-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            b.is_cash
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          }`}
                        >
                          {b.is_cash ? <Wallet className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                            {b.is_cash ? 'Cash Drawer' : b.bank_name || 'Bank Account'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {b.account_number ? `•••• ${b.account_number.slice(-4)}` : 'Cash'} · {glAcc?.account_code || 'GL'}
                          </div>
                        </div>
                      </div>

                      {selected && (
                        <div className="w-5 h-5 rounded-full bg-[#FA634E] text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 4: Memo & Reference */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                4. Memo & Reference
              </h2>
              <Textarea
                rows={3}
                placeholder="Enter memo, payment terms, or reference notes..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="text-xs bg-slate-50/50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {/* Sticky Right Rail (~360px) */}
          <AdvanceReadinessRail
            partyType={partyType}
            direction={direction}
            amount={amount}
            advanceDate={advanceDate}
            accountId={accountId}
            bankAccounts={bankAccounts}
            accounts={accounts}
            periods={periods}
            settings={settings}
            apiError={apiError}
          />
        </div>

        {/* Sticky Footer Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-6 py-3 shadow-lg">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate('/finance/advances')}>
              Cancel
            </Button>

            <div className="flex items-center gap-3">
              {partyType !== 'Employee' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={!isFormValid || createMutation.isPending}
                  className="border-slate-300 dark:border-slate-700 font-semibold"
                >
                  Save & apply credits
                </Button>
              )}

              <Button
                type="button"
                onClick={() => handleSave(false)}
                disabled={!isFormValid || createMutation.isPending}
                className="bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold"
              >
                {createMutation.isPending ? 'Saving...' : 'Save advance'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
