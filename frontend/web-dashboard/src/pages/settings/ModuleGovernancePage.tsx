import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { SettingsPage, SettingsRow, SettingsSection } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authStore } from '@/store/authStore';
import { settingsService } from '@/services/settingsService';
import { MODULE_KEYS, type ModuleKey } from '@mercon/shared-types';
import { cn } from '@/lib/utils';

/** Areas the list is grouped by — the same sections the sidebar uses. */
const MODULE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: 'Operations', keys: ['dashboard', 'quotations', 'trips', 'customers', 'locations'] },
  { label: 'Fleet', keys: ['drivers', 'vehicles', 'maintenance', 'third-party'] },
  { label: 'Finance', keys: ['invoices', 'expenses', 'finance', 'zatca'] },
  { label: 'Documents & reports', keys: ['documents', 'reports', 'company-reports', 'report-builder'] },
  { label: 'Platform', keys: ['taxonomy', 'aprodac-documents', 'learning'] },
];

type ModuleState = 'active' | 'coming_soon' | 'hidden';

const STATES: { value: ModuleState; label: string }[] = [
  { value: 'active', label: 'On' },
  { value: 'coming_soon', label: 'Coming soon' },
  { value: 'hidden', label: 'Hidden' },
];

const MODULE_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  dashboard: { label: 'Dashboard', desc: 'Home page with today’s numbers and alerts.' },
  quotations: { label: 'Quotations', desc: 'Price quotes, rate agreements and AI rate import.' },
  trips: { label: 'Trips', desc: 'Creating, dispatching and tracking trips.' },
  customers: { label: 'Customers', desc: 'Customer records, contacts and billing details.' },
  locations: { label: 'Locations', desc: 'Pickup and delivery places, with map pins.' },
  drivers: { label: 'Drivers', desc: 'Driver records, licences, documents and app accounts.' },
  vehicles: { label: 'Vehicles', desc: 'Trucks and trailers, specs, ownership and costs.' },
  maintenance: { label: 'Maintenance', desc: 'Service orders, workshops and inspections.' },
  'third-party': { label: 'Third-party fleet', desc: 'Partner carriers and subcontracted trips.' },
  invoices: { label: 'Invoices', desc: 'Customer invoices and payments.' },
  expenses: { label: 'Expenses', desc: 'Fuel and trip expenses.' },
  finance: { label: 'Accounting', desc: 'Chart of accounts, journals, bills, banking and financial reports.' },
  zatca: { label: 'ZATCA e-invoicing', desc: 'Connecting to ZATCA Fatoora for e-invoices.' },
  documents: { label: 'Documents', desc: 'Driver, vehicle and trip documents with expiry tracking.' },
  reports: { label: 'Reports', desc: 'Operations and performance reports.' },
  'company-reports': { label: 'Customer Excel exports', desc: 'Trips, statement of account and rates filled into each customer’s own Excel layout — Customer → Excel exports, and Trip sheet on an invoice.' },
  'report-builder': { label: 'Report builder', desc: 'Build custom reports with your own filters.' },
  taxonomy: { label: 'Taxonomy', desc: 'Vehicle classes, line types and billing types.' },
  'aprodac-documents': { label: 'Aprodac vault', desc: 'Contracts and documents shared with Aprodac.' },
  learning: { label: 'Learning', desc: 'Training videos and guides.' },
};

export default function ModuleGovernancePage() {
  const queryClient = useQueryClient();
  const user = authStore.getUser();
  const isSuperAdmin = user?.role === 'SuperAdmin' || (user as any)?.isSuperAdmin === true;

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [enabledModules, setEnabledModules] = useState<ModuleKey[]>([]);
  const [hiddenModules, setHiddenModules] = useState<ModuleKey[]>([]);
  const [defaultRedirectModule, setDefaultRedirectModule] = useState<string>('quotations');

  useEffect(() => {
    if (settings) {
      setEnabledModules(settings.enabledModules || []);
      setHiddenModules(settings.hiddenModules || []);
      setDefaultRedirectModule((settings as any).defaultRedirectModule || 'quotations');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        enabledModules,
        hiddenModules,
        defaultRedirectModule,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Modules saved. Navigation updates for everyone on their next page load.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update module governance.');
    },
  });

  const getModuleState = (key: ModuleKey): ModuleState => {
    if (enabledModules.includes(key)) return 'active';
    if (hiddenModules.includes(key)) return 'hidden';
    return 'coming_soon';
  };

  const setModuleState = (key: ModuleKey, state: ModuleState) => {
    if (state === 'active') {
      setEnabledModules((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setHiddenModules((prev) => prev.filter((m) => m !== key));
    } else if (state === 'coming_soon') {
      setEnabledModules((prev) => prev.filter((m) => m !== key));
      setHiddenModules((prev) => prev.filter((m) => m !== key));
    } else if (state === 'hidden') {
      setEnabledModules((prev) => prev.filter((m) => m !== key));
      setHiddenModules((prev) => (prev.includes(key) ? prev : [...prev, key]));
    }
  };

  const selectableKeys: ModuleKey[] = MODULE_KEYS.filter((k) => k !== 'recycle-bin');
  const grouped = new Set(MODULE_GROUPS.flatMap((g) => g.keys));
  const ungrouped = selectableKeys.filter((k) => !grouped.has(k));
  const groups = ungrouped.length ? [...MODULE_GROUPS, { label: 'Other', keys: ungrouped }] : MODULE_GROUPS;

  const activeCount = selectableKeys.filter((k) => enabledModules.includes(k)).length;
  const hiddenCount = selectableKeys.filter((k) => hiddenModules.includes(k)).length;
  const comingSoonCount = selectableKeys.length - activeCount - hiddenCount;

  const saved = {
    enabled: new Set(settings?.enabledModules || []),
    hidden: new Set(settings?.hiddenModules || []),
    redirect: (settings as any)?.defaultRedirectModule || 'quotations',
  };
  const dirty =
    !!settings &&
    (selectableKeys.some((k) => enabledModules.includes(k) !== saved.enabled.has(k) || hiddenModules.includes(k) !== saved.hidden.has(k)) ||
      defaultRedirectModule !== saved.redirect);

  const reset = () => {
    setEnabledModules(settings?.enabledModules || []);
    setHiddenModules(settings?.hiddenModules || []);
    setDefaultRedirectModule(saved.redirect);
  };

  const landingOptions = selectableKeys.filter((k) => enabledModules.includes(k) || k === defaultRedirectModule);

  return (
    <SettingsPage
      title="Modules"
      description={
        <>
          Turn parts of the product on or off for this company. <strong className="font-semibold text-foreground">Coming soon</strong> shows the page
          locked in the menu; <strong className="font-semibold text-foreground">Hidden</strong> removes it. Aprodac superadmins always see everything.
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{activeCount} on</span> · {comingSoonCount} coming soon · {hiddenCount} hidden
        {!isSuperAdmin && ' · read-only: only Aprodac can change modules'}
      </p>

      <SettingsSection>
        <SettingsRow label="Landing page" description="Where people go when they open a page that is switched off." htmlFor="landing-page">
          <Select value={defaultRedirectModule} onValueChange={setDefaultRedirectModule} disabled={!isSuperAdmin}>
            <SelectTrigger id="landing-page" className="h-9 w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {landingOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {MODULE_DESCRIPTIONS[key]?.label || key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      {groups.map((group) => (
        <SettingsSection key={group.label} title={group.label} flush>
          <ul className="divide-y divide-black/[0.05] dark:divide-white/10 border-t border-black/[0.05] dark:border-white/10">
            {group.keys.filter((k) => selectableKeys.includes(k)).map((key) => {
              const state = getModuleState(key);
              const meta = MODULE_DESCRIPTIONS[key] || { label: key.replace(/-/g, ' '), desc: '' };
              return (
                <li key={key} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className={cn('min-w-0', state === 'hidden' && 'opacity-60')}>
                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                    {meta.desc && <p className="text-xs text-muted-foreground">{meta.desc}</p>}
                  </div>
                  <div role="radiogroup" aria-label={`${meta.label} availability`} className="inline-flex shrink-0 self-start sm:self-auto rounded-lg bg-muted p-0.5">
                    {STATES.map((option) => {
                      const selected = state === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!isSuperAdmin}
                          onClick={() => setModuleState(key, option.value)}
                          className={cn(
                            'h-7 px-3 rounded-md text-xs font-bold transition-colors disabled:cursor-not-allowed',
                            selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            selected && option.value === 'active' && 'text-[#16A34A]',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </SettingsSection>
      ))}

      {dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-black/[0.08] bg-card px-5 py-3 shadow-lg animate-fade-in">
          <span className="text-sm font-semibold text-foreground">You have unsaved changes</span>
          <div className="flex items-center gap-2">
            <Btn label="Discard" variant="ghost" size="sm" onClick={reset} />
            <Btn label="Save changes" size="sm" isLoading={updateMutation.isPending} onClick={() => updateMutation.mutate()} />
          </div>
        </div>
      )}
    </SettingsPage>
  );
}
