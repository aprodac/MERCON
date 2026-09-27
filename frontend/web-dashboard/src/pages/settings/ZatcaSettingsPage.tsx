import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Building2, CheckCircle2, ClipboardCheck, ExternalLink, FileCheck2, KeyRound, Lock, Loader2,
  PlugZap, RotateCcw, Rocket, ShieldCheck,
} from 'lucide-react';
import type { ZatcaEnvironment, ZatcaInvoiceTypes, ZatcaStatus } from '@mercon/shared-types';

import DashboardLayout from '@/components/layout/DashboardLayout';
import Btn from '@/components/ui/Btn';
import FormInput from '@/components/ui/FormInput';
import FormSection from '@/components/ui/FormSection';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { extractApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { settingsService } from '@/services/settingsService';
import { fieldErrorsFrom, zatcaService, type ZatcaProfileForm } from '@/services/zatcaService';

type StepId = 'details' | 'connect' | 'checks' | 'live';

const STEPS: { id: StepId; title: string; hint: string; icon: typeof Building2 }[] = [
  { id: 'details', title: 'Business details', hint: 'As on the VAT registration', icon: Building2 },
  { id: 'connect', title: 'Connect to ZATCA', hint: 'OTP from Fatoora', icon: PlugZap },
  { id: 'checks', title: 'Compliance checks', hint: 'ZATCA tests sample invoices', icon: ClipboardCheck },
  { id: 'live', title: 'Go live', hint: 'Production certificate', icon: Rocket },
];

const STEP_FOR_STATUS: Record<ZatcaStatus['status'], StepId> = {
  NotStarted: 'details',
  ProfileSaved: 'connect',
  ComplianceIssued: 'checks',
  ComplianceChecked: 'live',
  Active: 'live',
};

const ENVIRONMENTS: { value: ZatcaEnvironment; title: string; desc: string }[] = [
  { value: 'Sandbox', title: 'Sandbox', desc: 'ZATCA’s developer test system. Nothing is reported.' },
  { value: 'Simulation', title: 'Simulation', desc: 'Rehearsal with the real VAT registration. Not legally reported.' },
  { value: 'Production', title: 'Production', desc: 'Live. Every invoice is cleared or reported to ZATCA.' },
];

const INVOICE_TYPES: { value: ZatcaInvoiceTypes; title: string; desc: string }[] = [
  { value: '1000', title: 'Business customers', desc: 'Standard tax invoices (B2B), cleared by ZATCA before sending' },
  { value: '0100', title: 'Consumers', desc: 'Simplified invoices (B2C), reported within 24 hours' },
  { value: '1100', title: 'Both', desc: 'Standard and simplified invoices' },
];

const EMPTY_FORM: ZatcaProfileForm = {
  environment: 'Sandbox', sellerNameAr: '', sellerNameEn: '', vatNumber: '', crNumber: '', branchName: '',
  businessCategory: 'Transportation', invoiceTypes: '1000', buildingNumber: '', streetName: '', district: '',
  city: '', postalCode: '', additionalNumber: '', shortAddress: '',
};

const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-[#9898A4]';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export default function ZatcaSettingsPage() {
  const queryClient = useQueryClient();
  const { data: status, isLoading, error } = useQuery({ queryKey: ['zatca'], queryFn: zatcaService.getStatus });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get });
  const [viewing, setViewing] = useState<StepId | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const currentStep = status ? STEP_FOR_STATUS[status.status] : 'details';
  const step = viewing ?? currentStep;
  const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);

  const onStatus = (next: ZatcaStatus) => {
    queryClient.setQueryData(['zatca'], next);
    setViewing(null);
  };

  const resetMutation = useMutation({
    mutationFn: zatcaService.reset,
    onSuccess: (next) => {
      onStatus(next);
      setResetOpen(false);
      toast.success('Connection reset. You can edit the details and connect again.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });

  return (
    <DashboardLayout
      active="Account"
      title="ZATCA e-invoicing"
      pageSub="Connect this company’s VAT registration to ZATCA Fatoora (Phase 2)"
    >
      <div className="px-4 sm:px-6 pb-6 w-full max-w-[1100px] mx-auto animate-fade-in">
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-[#6E6E80]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {error && <Notice tone="error" title="Could not load the ZATCA connection">{extractApiErrorMessage(error)}</Notice>}

        {status && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-black/[0.06] bg-card shadow-sm p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ConnectionPill status={status} />
                  {status.profile.vatNumber && (
                    <span className="text-xs text-[#6E6E80]">
                      VAT <span className="font-mono font-bold text-[#111111] dark:text-foreground">{status.profile.vatNumber}</span>
                      {' · '}{status.environment}
                    </span>
                  )}
                </div>
                {status.profileLocked && (
                  <Btn
                    label="Reset connection"
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw size={13} />}
                    onClick={() => setResetOpen(true)}
                    className="text-[#DC2626]"
                  />
                )}
              </div>

              <ol className="grid grid-cols-4 gap-2">
                {STEPS.map((s, i) => {
                  const done = status.status === 'Active' || i < stepIndex(currentStep);
                  const isCurrent = s.id === currentStep && status.status !== 'Active';
                  const reachable = done || isCurrent;
                  const Icon = done ? CheckCircle2 : s.icon;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={!reachable}
                        aria-current={step === s.id ? 'step' : undefined}
                        onClick={() => setViewing(s.id === currentStep ? null : s.id)}
                        className={cn(
                          'w-full h-full flex items-center justify-center md:justify-start gap-2.5 rounded-xl px-2 md:px-3 py-2.5 text-left transition-colors',
                          step === s.id ? 'bg-brand-light' : reachable && 'hover:bg-[#FAFAFA]',
                          !reachable && 'cursor-not-allowed',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                            done && 'border-[#16A34A]/20 bg-[#F0FDF4] text-[#16A34A]',
                            isCurrent && 'border-brand-border bg-brand text-white',
                            !done && !isCurrent && 'border-black/[0.08] text-[#9898A4]',
                          )}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="hidden md:block min-w-0">
                          <span className={cn('block text-sm font-bold truncate', reachable ? 'text-[#111111] dark:text-foreground' : 'text-[#9898A4]')}>
                            {s.title}
                          </span>
                          <span className="block text-xs text-[#6E6E80] truncate">{s.hint}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="md:hidden mt-3 text-center text-xs text-[#6E6E80]">
                Step {stepIndex(step) + 1} of {STEPS.length} · <span className="font-bold text-[#111111] dark:text-foreground">{STEPS[stepIndex(step)].title}</span>
              </p>
            </div>

            {!status.encryptionKeyConfigured && (
              <Notice tone="warning" title="This server is not ready to store ZATCA certificates">
                Aprodac must set <code className="font-mono">ZATCA_ENCRYPTION_KEY</code> on this deployment before you can connect.
                You can still fill in the business details now.
              </Notice>
            )}
            {step === 'details' && <DetailsStep status={status} settingsDefaults={settings} onSaved={onStatus} />}
            {step === 'connect' && <ConnectStep status={status} onConnected={onStatus} />}
            {step === 'checks' && <ChecksStep status={status} />}
            {step === 'live' && <LiveStep status={status} onActivated={onStatus} />}
          </div>
        )}
      </div>

      <ResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        isLive={status?.status === 'Active' && status.environment === 'Production'}
        isPending={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      />
    </DashboardLayout>
  );
}

/* ─── Step 1: business details ─────────────────────────────────────────── */

function DetailsStep({
  status, settingsDefaults, onSaved,
}: {
  status: ZatcaStatus;
  settingsDefaults?: { companyLegalName?: string | null; vatNumber?: string | null; crNumber?: string | null };
  onSaved: (s: ZatcaStatus) => void;
}) {
  const initial = useMemo<ZatcaProfileForm>(() => {
    const p = status.profile;
    return {
      ...EMPTY_FORM,
      environment: status.environment,
      invoiceTypes: p.invoiceTypes,
      sellerNameAr: p.sellerNameAr ?? '',
      // First visit: start from what Settings already knows about the company.
      sellerNameEn: p.sellerNameEn ?? (p.vatNumber ? '' : settingsDefaults?.companyLegalName ?? ''),
      vatNumber: p.vatNumber ?? settingsDefaults?.vatNumber ?? '',
      crNumber: p.crNumber ?? settingsDefaults?.crNumber ?? '',
      branchName: p.branchName ?? '',
      businessCategory: p.businessCategory ?? EMPTY_FORM.businessCategory,
      buildingNumber: p.buildingNumber ?? '',
      streetName: p.streetName ?? '',
      district: p.district ?? '',
      city: p.city ?? '',
      postalCode: p.postalCode ?? '',
      additionalNumber: p.additionalNumber ?? '',
      shortAddress: p.shortAddress ?? '',
    };
  }, [status, settingsDefaults]);

  const [form, setForm] = useState<ZatcaProfileForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(initial), [initial]);

  const locked = status.profileLocked;
  const set = (key: keyof ZatcaProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: '' }));
  };

  const save = useMutation({
    mutationFn: () => zatcaService.saveProfile(form),
    onSuccess: (next) => {
      toast.success('Business details saved');
      onSaved(next);
    },
    onError: (err) => {
      const fieldErrors = fieldErrorsFrom(err);
      setErrors(fieldErrors);
      toast.error(Object.keys(fieldErrors).length ? 'Check the highlighted fields' : extractApiErrorMessage(err));
    },
  });

  const field = (key: keyof ZatcaProfileForm, label: string, extra: Partial<React.ComponentProps<typeof FormInput>> = {}) => (
    <FormInput label={label} name={key} value={form[key]} onChange={set(key)} error={errors[key]} disabled={locked} {...extra} />
  );

  return (
    <div>
      {locked && (
        <Notice tone="info" title="Details are locked" icon={<Lock size={14} />}>
          ZATCA’s certificate contains these details. Use <strong>Reset connection</strong> to change them.
        </Notice>
      )}

      <FormSection title="ZATCA environment" description="Start in Sandbox or Simulation. Switch to Production only when invoices are ready to go live.">
        <ChoiceCards
          className="md:col-span-2"
          options={ENVIRONMENTS}
          value={form.environment}
          disabled={locked}
          onChange={(environment) => setForm((f) => ({ ...f, environment }))}
        />
      </FormSection>

      <FormSection title="Seller" description="Exactly as registered with ZATCA. The Arabic name appears on every invoice.">
        {field('sellerNameAr', 'Seller name (Arabic)', { required: true, dir: 'rtl', placeholder: 'شركة ...' })}
        {field('sellerNameEn', 'Seller name (English)')}
        {field('vatNumber', 'VAT number', { required: true, inputMode: 'numeric', maxLength: 15, placeholder: '3XXXXXXXXXXXXX3', className: 'font-mono' })}
        {field('crNumber', 'CR number', { required: true, inputMode: 'numeric', maxLength: 10, className: 'font-mono' })}
        {field('branchName', 'Branch name', { required: true, placeholder: 'Head office' })}
        {field('businessCategory', 'Business category', { required: true, placeholder: 'Transportation' })}
      </FormSection>

      <FormSection title="Invoices you issue" description="Decides which invoice types ZATCA certifies this system for.">
        <ChoiceCards
          className="md:col-span-2"
          options={INVOICE_TYPES}
          value={form.invoiceTypes}
          disabled={locked}
          onChange={(invoiceTypes) => setForm((f) => ({ ...f, invoiceTypes }))}
        />
      </FormSection>

      <FormSection title="National address" description="The Saudi national address on the VAT registration.">
        {field('buildingNumber', 'Building number', { required: true, inputMode: 'numeric', maxLength: 4 })}
        {field('streetName', 'Street', { required: true })}
        {field('district', 'District', { required: true })}
        {field('city', 'City', { required: true })}
        {field('postalCode', 'Postal code', { required: true, inputMode: 'numeric', maxLength: 5 })}
        {field('additionalNumber', 'Additional number', { inputMode: 'numeric', maxLength: 4 })}
        {field('shortAddress', 'Short address', { placeholder: 'RRRD2929', maxLength: 8, className: 'font-mono uppercase' })}
      </FormSection>

      {!locked && (
        <div className="flex justify-end">
          <Btn
            label={status.status === 'NotStarted' ? 'Save and continue' : 'Save details'}
            icon={<FileCheck2 size={14} />}
            isLoading={save.isPending}
            onClick={() => save.mutate()}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Step 2: OTP → compliance certificate ─────────────────────────────── */

function ConnectStep({ status, onConnected }: { status: ZatcaStatus; onConnected: (s: ZatcaStatus) => void }) {
  const queryClient = useQueryClient();
  const [otp, setOtp] = useState('');
  const connected = status.complianceIssuedAt !== null;
  const connect = useMutation({
    mutationFn: () => zatcaService.connect(otp),
    onSuccess: (next) => {
      toast.success('Connected — ZATCA issued the compliance certificate');
      setOtp('');
      onConnected(next);
    },
    onError: (err) => {
      toast.error(extractApiErrorMessage(err));
      // The server recorded the failure; refetch so the error box shows it.
      queryClient.invalidateQueries({ queryKey: ['zatca'] });
    },
  });

  if (connected) {
    return (
      <StepCard icon={<CheckCircle2 size={18} />} tone="success" title="Connected to ZATCA">
        <Facts
          items={[
            ['Compliance certificate', `Issued ${formatDate(status.complianceIssuedAt)}`],
            ['Solution unit', status.egs.commonName ?? '—'],
            ['Environment', status.environment],
          ]}
        />
      </StepCard>
    );
  }

  const isSandbox = status.environment === 'Sandbox';
  return (
    <StepCard icon={<KeyRound size={18} />} title="Connect with a one-time password">
      <ol className="space-y-3 text-sm text-[#6E6E80]">
        {isSandbox ? (
          <li className="flex gap-3">
            <StepNumber n={1} />
            <span>The sandbox doesn’t need a Fatoora login. ZATCA’s developer portal documents <strong className="font-mono text-[#111111] dark:text-foreground">123345</strong> as its test OTP.</span>
          </li>
        ) : (
          <>
            <li className="flex gap-3">
              <StepNumber n={1} />
              <span>
                Log in to{' '}
                <a href="https://fatoora.zatca.gov.sa" target="_blank" rel="noreferrer" className="font-bold text-brand hover:underline inline-flex items-center gap-1">
                  fatoora.zatca.gov.sa <ExternalLink size={12} />
                </a>{' '}
                with the company’s ZATCA account{status.environment === 'Simulation' ? ' and switch to the simulation portal' : ''}.
              </span>
            </li>
            <li className="flex gap-3">
              <StepNumber n={2} />
              <span>Choose <strong className="text-[#111111] dark:text-foreground">Onboard new solution unit/device</strong> and generate an OTP. It is valid for 1 hour.</span>
            </li>
          </>
        )}
        <li className="flex gap-3">
          <StepNumber n={isSandbox ? 2 : 3} />
          <span>Enter it below. This system creates its private key and certificate request, then sends the request to ZATCA.</span>
        </li>
      </ol>

      <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 max-w-xs">
          <label htmlFor="zatca-otp" className={labelClass}>One-time password</label>
          <Input
            id="zatca-otp"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && connect.mutate()}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="mt-1.5 h-11 rounded-xl text-center font-mono text-lg tracking-[0.5em]"
          />
        </div>
        <Btn
          label="Connect to ZATCA"
          icon={<PlugZap size={14} />}
          disabled={otp.length !== 6 || !status.encryptionKeyConfigured}
          isLoading={connect.isPending}
          onClick={() => connect.mutate()}
          className="h-11"
        />
      </div>

      {status.lastError && (
        <Notice tone="error" title={`Last attempt failed · ${formatDate(status.lastErrorAt)}`} className="mt-5 mb-0">
          {status.lastError}
        </Notice>
      )}
    </StepCard>
  );
}

/* ─── Step 3: compliance checks ────────────────────────────────────────── */

function ChecksStep({ status }: { status: ZatcaStatus }) {
  const types = status.profile.invoiceTypes;
  const required = [
    ...(types[0] === '1' ? ['Standard invoice', 'Standard credit note', 'Standard debit note'] : []),
    ...(types[1] === '1' ? ['Simplified invoice', 'Simplified credit note', 'Simplified debit note'] : []),
  ];
  const results = new Map((status.complianceChecks ?? []).map((c) => [c.documentType, c]));

  return (
    <StepCard icon={<ClipboardCheck size={18} />} title="ZATCA compliance checks">
      <p className="text-sm text-[#6E6E80]">
        Before issuing the live certificate, ZATCA checks one signed sample of each document type this system will send.
      </p>
      <ul className="mt-4 divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
        {required.map((doc) => {
          const result = results.get(doc);
          return (
            <li key={doc} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold text-[#111111] dark:text-foreground">{doc}</span>
              {result ? (
                <span className={cn('text-xs font-bold', result.passed ? 'text-[#16A34A]' : 'text-[#DC2626]')}>
                  {result.passed ? 'Passed' : 'Failed'}
                </span>
              ) : (
                <span className="text-xs text-[#9898A4]">Waiting</span>
              )}
            </li>
          );
        })}
      </ul>
      <Notice tone="info" title="Runs automatically in the next update" className="mt-4 mb-0">
        These samples need the invoice signing engine (UBL XML, digital signature, QR code), which is being built next.
        Once it ships, this step runs by itself, with nothing to fill in.
      </Notice>
    </StepCard>
  );
}

/* ─── Step 4: production certificate ───────────────────────────────────── */

function LiveStep({ status, onActivated }: { status: ZatcaStatus; onActivated: (s: ZatcaStatus) => void }) {
  const activate = useMutation({
    mutationFn: zatcaService.activateProduction,
    onSuccess: (next) => {
      toast.success('Production certificate issued');
      onActivated(next);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });

  if (status.status === 'Active') {
    return (
      <StepCard icon={<ShieldCheck size={18} />} tone="success" title={status.environment === 'Production' ? 'Live with ZATCA' : `Certified in ${status.environment}`}>
        <Facts
          items={[
            ['Certified since', formatDate(status.productionIssuedAt)],
            ['Certificate valid until', formatDate(status.certificateExpiresAt)],
            ['Invoices issued', String(status.invoicesIssued)],
          ]}
        />
      </StepCard>
    );
  }

  return (
    <StepCard icon={<Rocket size={18} />} title="Request the production certificate">
      <p className="text-sm text-[#6E6E80]">
        Once ZATCA has accepted the samples, this exchanges the compliance certificate for the certificate that signs real invoices.
      </p>
      <div className="mt-5 flex justify-end">
        <Btn
          label="Request certificate"
          icon={<Rocket size={14} />}
          disabled={status.status !== 'ComplianceChecked'}
          isLoading={activate.isPending}
          onClick={() => activate.mutate()}
        />
      </div>
    </StepCard>
  );
}

/* ─── Reset ────────────────────────────────────────────────────────────── */

function ResetDialog({
  open, onOpenChange, isLive, isPending, onConfirm,
}: { open: boolean; onOpenChange: (o: boolean) => void; isLive: boolean; isPending: boolean; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the ZATCA connection?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes this system’s private key and ZATCA certificates. You will need a new OTP to connect again.
            {isLive && ' This company is live: until it reconnects, no invoice can be cleared or reported.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <label htmlFor="zatca-reset" className={labelClass}>Type RESET to confirm</label>
          <Input id="zatca-reset" value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5 font-mono" autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Btn label="Reset connection" variant="danger" disabled={typed !== 'RESET'} isLoading={isPending} onClick={onConfirm} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Small building blocks ────────────────────────────────────────────── */

function ConnectionPill({ status }: { status: ZatcaStatus }) {
  const map: Record<ZatcaStatus['status'], { label: string; className: string }> = {
    NotStarted: { label: 'Not connected', className: 'bg-black/[0.04] text-[#6E6E80]' },
    ProfileSaved: { label: 'Not connected', className: 'bg-black/[0.04] text-[#6E6E80]' },
    ComplianceIssued: { label: 'Connecting', className: 'bg-[#FFFBEB] text-[#D97706]' },
    ComplianceChecked: { label: 'Checks passed', className: 'bg-[#EFF6FF] text-[#2563EB]' },
    Active: { label: status.environment === 'Production' ? 'Live' : `Certified · ${status.environment}`, className: 'bg-[#F0FDF4] text-[#16A34A]' },
  };
  const { label, className } = map[status.status];
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold', className)}>{label}</span>;
}

function ChoiceCards<T extends string>({
  options, value, onChange, disabled, className,
}: { options: { value: T; title: string; desc: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)} role="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-xl border p-3 text-left transition-all duration-150',
              selected ? 'border-brand bg-brand-light ring-1 ring-brand' : 'border-black/[0.08] hover:border-black/[0.16]',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#111111] dark:text-foreground">{o.title}</span>
              {selected && <CheckCircle2 size={14} className="text-brand" />}
            </span>
            <span className="mt-1 block text-xs text-[#6E6E80]">{o.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepCard({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone?: 'success'; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-card shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tone === 'success' ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-brand-light text-brand')}>
          {icon}
        </span>
        <h2 className="text-base font-bold text-[#111111] dark:text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className={labelClass}>{label}</dt>
          <dd className="mt-1 text-sm font-bold text-[#111111] dark:text-foreground break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[11px] font-bold text-[#111111] dark:text-foreground">
      {n}
    </span>
  );
}

function Notice({
  tone, title, icon, className, children,
}: { tone: 'info' | 'warning' | 'error'; title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const styles = {
    info: 'border-[#2563EB]/15 bg-[#EFF6FF] text-[#1E40AF]',
    warning: 'border-[#D97706]/20 bg-[#FFFBEB] text-[#92400E]',
    error: 'border-[#DC2626]/20 bg-[#FEF2F2] text-[#991B1B]',
  }[tone];
  return (
    <div className={cn('mb-4 flex gap-3 rounded-xl border px-4 py-3 text-xs', styles, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertTriangle size={14} />}</span>
      <div>
        <p className="font-bold">{title}</p>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
