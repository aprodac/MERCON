import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Landmark,
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowLeft,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getBankTint,
  getBankInitials,
  maskAccountNumber,
} from '@/components/finance/banking/TransferSheet';
import { formatMoney, formatIban, validateSaudiIban } from '@/lib/finance';
import { financeService } from '@/services/financeService';
import type { BankAccount, Account } from '@mercon/shared-types';

const BANK_SUGGESTIONS = [
  'Al Rajhi Bank',
  'Saudi National Bank',
  'Riyad Bank',
  'SAB',
  'Alinma Bank',
  'Banque Saudi Fransi',
  'Arab National Bank',
  'Bank Albilad',
  'Bank AlJazira',
];

export default function BankAccountEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCash, setIsCash] = useState<boolean>(false);
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [iban, setIban] = useState<string>('');
  const [swiftCode, setSwiftCode] = useState<string>('');
  const [currency, setCurrency] = useState<string>('SAR');
  const [accountId, setAccountId] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [openingDate, setOpeningDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Fetch existing BankAccount if editing
  const { data: existingRes, isLoading: isExistingLoading } = useQuery({
    queryKey: ['bankAccount', id],
    queryFn: () => (id ? financeService.getBankAccountById(id) : null),
    enabled: isEditing,
  });

  const existingAccount = existingRes?.data;

  // Fetch Asset GL Accounts for combobox
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'Asset'],
    queryFn: () => financeService.getAccounts({ type: 'Asset' }),
  });

  // Fetch existing Bank Accounts to filter out already linked GL accounts
  const { data: allBankAccountsRes } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const availableAssetAccounts = useMemo(() => {
    const allAsset = (accountsRes?.data || []).filter(
      (a: Account) => a.account_type === 'Asset' && a.is_postable && a.isActive && !a.deletedAt
    );

    const linkedGlIds = new Set(
      (allBankAccountsRes?.data || [])
        .filter((ba: BankAccount) => (!isEditing || ba.id !== id) && !ba.deletedAt)
        .map((ba: BankAccount) => ba.accountId)
    );

    return allAsset.filter((a: Account) => !linkedGlIds.has(a.id));
  }, [accountsRes, allBankAccountsRes, isEditing, id]);

  // Populate state when editing
  useEffect(() => {
    if (isEditing && existingAccount) {
      setIsCash(Boolean(existingAccount.is_cash));
      setBankName(existingAccount.bank_name || '');
      setAccountNumber(existingAccount.account_number || '');
      setIban(existingAccount.iban ? formatIban(existingAccount.iban) : '');
      setSwiftCode(existingAccount.swift_code || '');
      setCurrency(existingAccount.currency || 'SAR');
      setAccountId(existingAccount.accountId);
      setOpeningBalance(String(existingAccount.opening_balance || 0));
      if (existingAccount.opening_date) {
        setOpeningDate(existingAccount.opening_date.split('T')[0]);
      }
    }
  }, [isEditing, existingAccount]);

  // IBAN Validation state
  const ibanValidation = useMemo(() => {
    if (isCash || !iban.trim()) return { isValid: true };
    return validateSaudiIban(iban);
  }, [isCash, iban]);

  // Selected GL Account object
  const selectedGlAccount = useMemo(() => {
    const list = accountsRes?.data || [];
    return list.find((a: Account) => a.id === accountId) || existingAccount?.account || null;
  }, [accountsRes, accountId, existingAccount]);

  // Readiness Checklist
  const readiness = useMemo(() => {
    const glOk = Boolean(accountId);
    const nameOk = isCash || Boolean(bankName.trim());
    const ibanOk = isCash || (!iban.trim() || ibanValidation.isValid);
    const isReady = glOk && nameOk && ibanOk;
    return { glOk, nameOk, ibanOk, isReady };
  }, [accountId, isCash, bankName, iban, ibanValidation]);

  // Handle IBAN input formatting
  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setIban(formatIban(raw));
  };

  // Create / Edit Mutations
  const createMutation = useMutation({
    mutationFn: financeService.createBankAccount,
    onSuccess: (res) => {
      toast.success('Bank Account created successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      const createdId = res?.data?.id;
      if (createdId) {
        navigate(`/finance/bank-accounts/${createdId}`);
      } else {
        navigate('/finance/bank-accounts');
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create bank account';
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => (id ? financeService.updateBankAccount(id, data) : Promise.reject('No ID')),
    onSuccess: () => {
      toast.success('Bank Account updated successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccount', id] });
      navigate(`/finance/bank-accounts/${id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update bank account';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!readiness.isReady) {
      toast.error('Please resolve all readiness requirements before saving');
      return;
    }

    const payload = {
      accountId,
      bank_name: isCash ? null : bankName.trim(),
      account_number: isCash ? null : accountNumber.replace(/\s+/g, ''),
      iban: isCash ? null : iban.replace(/\s+/g, '').toUpperCase(),
      swift_code: isCash ? null : swiftCode.trim().toUpperCase(),
      is_cash: isCash,
      opening_balance: parseFloat(openingBalance) || 0,
      opening_date: openingDate || null,
      currency: currency || 'SAR',
    };

    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isExistingLoading) {
    return (
      <DashboardLayout active="finance" title="Edit Bank Account">
        <div className="p-6 max-w-[1200px] mx-auto space-y-4">
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const tint = getBankTint(bankName, isCash);
  const previewOpeningNum = parseFloat(openingBalance) || 0;

  return (
    <DashboardLayout active="finance" title={isEditing ? 'Edit Bank Account' : 'New Bank Account'}>
      <div className="p-4 max-w-[1300px] mx-auto pb-24 animate-fade-in space-y-4">
        {/* Main Grid: Form on Left (8 cols) + Right Sticky Rail (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Main Form */}
          <form id="bank-account-form" onSubmit={handleSubmit} className="lg:col-span-8 space-y-6">
            {/* Section 1: Account Type */}
            <div className="bg-card rounded-[20px] border border-border dark:border-border p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  Account Type
                </h3>
                <p className="text-xs text-muted-foreground">
                  Select whether this is an institutional bank account or a physical cash vault/drawer.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bank Account Card */}
                <button
                  type="button"
                  onClick={() => setIsCash(false)}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    !isCash
                      ? 'bg-card  border-[#FA634E] ring-2 ring-[#FA634E]/20 shadow-xs'
                      : 'bg-muted/50  border-border dark:border-border hover:border-border'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${!isCash ? 'bg-orange-50 text-[#FA634E]' : 'bg-muted text-muted-foreground'}`}>
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Bank Account</h4>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Commercial bank account with IBAN and statement reconciliations.</p>
                  </div>
                </button>

                {/* Cash Account Card */}
                <button
                  type="button"
                  onClick={() => setIsCash(true)}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    isCash
                      ? 'bg-card  border-[#FA634E] ring-2 ring-[#FA634E]/20 shadow-xs'
                      : 'bg-muted/50  border-border dark:border-border hover:border-border'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isCash ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Cash Account</h4>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Physical cash drawer, petty cash vault, or on-hand float.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Section 2: Account Identity */}
            <div className="bg-card rounded-[20px] border border-border dark:border-border p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Identity & Bank Details
              </h3>

              {!isCash && (
                <>
                  {/* Bank Name input with suggestions */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">
                      Bank Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Al Rajhi Bank, Saudi National Bank..."
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="h-10 text-xs bg-card border-border dark:border-border"
                    />

                    {/* Bank Suggestion Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[11px] text-muted-foreground font-medium mr-1">Suggestions:</span>
                      {BANK_SUGGESTIONS.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setBankName(name)}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                            bankName === name
                              ? 'bg-orange-50 text-[#FA634E] border-orange-200'
                              : 'bg-muted text-muted-foreground border-border hover:bg-muted   dark:border-border'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Account Number */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Account Number</Label>
                      <Input
                        placeholder="e.g. 1000000123456"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="h-10 text-xs font-mono bg-card border-border dark:border-border"
                      />
                    </div>

                    {/* SWIFT Code */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">SWIFT / BIC Code</Label>
                      <Input
                        placeholder="e.g. RJHI001"
                        value={swiftCode}
                        onChange={(e) => setSwiftCode(e.target.value.toUpperCase())}
                        className="h-10 text-xs font-mono uppercase bg-card border-border dark:border-border"
                      />
                    </div>

                    {/* IBAN */}
                    <div className="sm:col-span-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground">IBAN (Saudi ISO 13616 Format)</Label>
                        {iban.trim() && (
                          <span className={`text-[11px] font-bold ${ibanValidation.isValid ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {ibanValidation.isValid ? '✓ Valid Saudi IBAN' : ibanValidation.error}
                          </span>
                        )}
                      </div>
                      <Input
                        placeholder="SA12 3456 7890 1234 5678 9012"
                        value={iban}
                        onChange={handleIbanChange}
                        className={`h-10 text-xs font-mono uppercase bg-card  ${
                          iban.trim() && !ibanValidation.isValid
                            ? 'border-rose-500 focus-visible:ring-rose-500'
                            : 'border-border dark:border-border'
                        }`}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Currency Select */}
              <div className="w-full sm:w-1/2 space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Base Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-10 text-xs font-semibold bg-card border-border dark:border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAR">SAR — Saudi Riyal</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section 3: Linked GL Account */}
            <div className="bg-card rounded-[20px] border border-border dark:border-border p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                    Linked General Ledger Account
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Postings to this bank account will update this Asset account on the General Ledger.
                  </p>
                </div>
                <Link
                  to="/finance/chart-of-accounts"
                  target="_blank"
                  className="text-xs font-bold text-[#FA634E] hover:underline flex items-center gap-1"
                >
                  <span>Create GL Account</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {isEditing ? (
                <div className="p-3.5 bg-muted rounded-xl border border-border dark:border-border space-y-1">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs font-bold text-foreground">
                      {existingAccount?.account?.account_code} — {existingAccount?.account?.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-5">
                    Linked GL account cannot be changed after creation to maintain ledger audit trail.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Linked Asset GL Account <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="h-10 text-xs bg-card border-border dark:border-border">
                      <SelectValue placeholder="Select Asset Account (1010, 1020...)" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAssetAccounts.map((acc: Account) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="fin-num font-semibold mr-2 text-foreground">{acc.account_code}</span>
                          <span>{acc.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Section 4: Opening Balance */}
            <div className="bg-card rounded-[20px] border border-border dark:border-border p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  Opening Balance Setup
                </h3>
                <p className="text-xs text-muted-foreground">Initial balance on hand prior to active journal entries.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Opening Balance ({currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="h-10 text-xs font-extrabold fin-num bg-card border-border dark:border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Opening Date</Label>
                  <Input
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="h-10 text-xs bg-card border-border dark:border-border"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/70 dark:border-amber-900/40 text-amber-800 text-xs">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11.5px] leading-normal">
                  <span className="font-bold">Important:</span> The opening balance is used for bank statement reconciliation and cash flow calculations, but is <span className="font-bold text-amber-900 dark:text-amber-200">not posted to the General Ledger</span>. Your Balance Sheet will not include this opening balance unless recorded in an opening journal entry.
                </p>
              </div>
            </div>
          </form>

          {/* RIGHT COLUMN: Live Card Preview & Readiness Sticky Rail (4 cols) */}
          <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-4">
            {/* LIVE CARD PREVIEW */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block px-1">
                Live Card Preview
              </span>

              <div className={`rounded-[20px] bg-card  border border-border dark:border-border p-5 shadow-xs space-y-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${tint.bg} ${tint.text} border ${tint.border} shadow-xs`}>
                      {isCash ? <Wallet className="w-5 h-5" /> : getBankInitials(bankName)}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-foreground truncate max-w-[150px]">
                        {isCash ? 'Cash Drawer' : bankName || 'Bank Name'}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                        <span>{isCash ? 'Cash Account' : maskAccountNumber(accountNumber)}</span>
                        {selectedGlAccount && (
                          <span className="bg-muted text-foreground px-1.5 py-0.2 rounded font-bold">
                            GL {selectedGlAccount.account_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opening Balance</span>
                  <div className="text-2xl font-extrabold fin-num text-foreground">
                    {formatMoney(previewOpeningNum, { currency })}
                  </div>
                </div>

                <div className="pt-2 border-t border-border dark:border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px] font-semibold">
                    Never reconciled
                  </Badge>
                  <span>Preview</span>
                </div>
              </div>
            </div>

            {/* READINESS CHECKLIST */}
            <div className="rounded-[20px] bg-card border border-border dark:border-border p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Readiness Checklist
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Linked GL Account selected</span>
                  {readiness.glOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  )}
                </div>

                {!isCash && (
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Bank Name provided</span>
                    {readiness.nameOk ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                  </div>
                )}

                {!isCash && iban.trim() && (
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Valid Saudi IBAN format</span>
                    {readiness.ibanOk ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* STICKY FOOTER BAR */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border dark:border-border p-4 shadow-lg">
          <div className="max-w-[1300px] mx-auto flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(isEditing ? `/finance/bank-accounts/${id}` : '/finance/bank-accounts')}
              className="h-9 text-xs font-semibold px-4 border-border dark:border-border"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              form="bank-account-form"
              disabled={isSaving || !readiness.isReady}
              className="h-9 text-xs font-bold px-6 bg-[#FA634E] hover:bg-[#EE553F] text-white shadow-xs"
            >
              {isSaving ? 'Saving Account...' : isEditing ? 'Save Changes' : 'Create Bank Account'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
