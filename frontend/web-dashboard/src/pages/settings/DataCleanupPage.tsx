import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Database, Loader2, Search } from 'lucide-react';
import { SettingsPage, SettingsSection } from '@/components/settings/SettingsKit';
import { cn } from '@/lib/utils';
import { settingsService, type DataCleanupPreview, type DataCleanupResult } from '@/services/settingsService';

const n = (v: number) => v.toLocaleString('en-US');

/** A ticked list of customers / drivers / locations with the reason each one is suggested. */
function PickList<T extends { id: string; name: string; reason: string | null; suggested?: boolean }>({
  items,
  picked,
  onChange,
  details,
  disabled,
  emptyText,
}: {
  items: T[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
  details: (item: T) => string;
  disabled: boolean;
  emptyText: string;
}) {
  const [q, setQ] = useState('');
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  if (items.length === 0) return <p className="px-5 pb-4 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-lg border border-black/10 bg-transparent pl-8 pr-2 text-sm dark:border-white/15"
          />
        </label>
        <button type="button" disabled={disabled} onClick={() => onChange(new Set(items.filter((i) => i.reason).map((i) => i.id)))} className="h-8 rounded-lg border border-black/10 px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50 dark:border-white/15">
          Select suggested
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange(new Set())} className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
          Clear
        </button>
      </div>
      <ul className="max-h-72 divide-y divide-black/[0.05] overflow-y-auto border-t border-black/[0.06] dark:divide-white/10 dark:border-white/10">
        {shown.map((i) => (
          <li key={i.id}>
            <label className={cn('flex cursor-pointer items-center gap-3 px-5 py-2 text-sm hover:bg-muted/50', picked.has(i.id) && 'bg-rose-50/60 dark:bg-rose-950/20')}>
              <input type="checkbox" checked={picked.has(i.id)} disabled={disabled} onChange={() => toggle(i.id)} className="size-4 accent-rose-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{i.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{details(i)}</span>
              </span>
              {i.reason && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{i.reason}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SuperAdmin → Settings → Clean up data. Clears test and demo data from a dev
 * deployment from the browser: every trip with its photos, chosen customers,
 * drivers and locations, finance records. Refused on non-dev databases (also by
 * the API). Photos are moved to a holding folder on the server, not erased.
 */
export default function DataCleanupPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<DataCleanupPreview>({ queryKey: ['data-cleanup'], queryFn: settingsService.getDataCleanup });

  const [allTrips, setAllTrips] = useState(false);
  const [finance, setFinance] = useState(false);
  const [customers, setCustomers] = useState<Set<string>>(new Set());
  const [drivers, setDrivers] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<DataCleanupResult | null>(null);

  // Start with the suggested test / demo entries ticked.
  useEffect(() => {
    if (!data) return;
    setCustomers(new Set(data.customers.filter((c) => c.suggested).map((c) => c.id)));
    setDrivers(new Set(data.drivers.filter((d) => d.suggested).map((d) => d.id)));
    setLocations(new Set(data.locations.map((l) => l.id)));
  }, [data]);

  const disabled = !data?.allowed;
  const financeTotal = data ? Object.values(data.finance).reduce((a, b) => a + b, 0) : 0;
  const financeOn = finance || allTrips;

  // Customers / drivers with trips can only go together with "All trips".
  const blockers = useMemo(() => {
    if (!data || allTrips) return [];
    return [
      ...data.customers.filter((c) => customers.has(c.id) && c.trips > 0).map((c) => `${c.name} has ${c.trips} trips`),
      ...data.drivers.filter((d) => drivers.has(d.id) && d.trips > 0).map((d) => `${d.name} has ${d.trips} trips`),
    ];
  }, [data, allTrips, customers, drivers]);

  const summary = [
    allTrips && data && `${n(data.trips.live + data.trips.inRecycleBin)} trips with ${n(data.trips.documents)} photos & documents`,
    financeOn && `all finance records (${n(financeTotal)})`,
    customers.size > 0 && `${customers.size} customer${customers.size === 1 ? '' : 's'}`,
    drivers.size > 0 && `${drivers.size} driver${drivers.size === 1 ? '' : 's'}`,
    locations.size > 0 && `${locations.size} location${locations.size === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];

  const run = useMutation({
    mutationFn: () =>
      settingsService.runDataCleanup({
        allTrips,
        finance: financeOn,
        customerIds: [...customers],
        driverIds: [...drivers],
        locationIds: [...locations],
        confirm: confirm.trim(),
      }),
    onSuccess: (r) => {
      setResult(r);
      setConfirm('');
      setAllTrips(false);
      setFinance(false);
      toast.success('Clean up done');
      queryClient.invalidateQueries();
      refetch();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Couldn't clean up. Nothing was changed."),
  });

  const canRun = Boolean(data?.allowed) && summary.length > 0 && blockers.length === 0 && confirm.trim() === data?.database && !run.isPending;

  return (
    <SettingsPage
      title="Clean up data"
      description="Remove test and demo data from this deployment so real data can go in. Only works on a dev database."
    >
      {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Counting what's here…</p>}
      {error && <p className="text-sm text-rose-600">Couldn't load the overview. Only SuperAdmins can open this page.</p>}

      {data && (
        <>
          <div className={cn('flex items-start gap-3 rounded-2xl border p-4', data.allowed ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30')}>
            {data.allowed ? <Database className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />}
            <div className="text-sm">
              <p className="font-semibold text-foreground">Database: <span className="font-mono">{data.database}</span></p>
              <p className="text-muted-foreground">
                {data.allowed
                  ? "Removed data can't be brought back from the app. Photos and files are moved to a holding folder on the server, not erased."
                  : "Switched off: this isn't a dev database. Clean up only runs on dev."}
              </p>
            </div>
          </div>

          {result && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-foreground">Removed</p>
                <p className="text-muted-foreground">
                  {Object.entries(result.counts).filter(([, v]) => v > 0).map(([k, v]) => `${n(v)} ${k}`).join(' · ') || 'Nothing matched.'}
                </p>
                {result.filesMoved > 0 && <p className="mt-1 text-xs text-muted-foreground">{n(result.filesMoved)} files moved to <span className="font-mono">{result.filesFolder}</span></p>}
              </div>
            </div>
          )}

          <SettingsSection title="Trips" description="Every trip, live and in the Recycle bin, with its stops, GPS track, charges, POD and loading photos.">
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', allTrips ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20' : 'border-black/10 dark:border-white/15')}>
              <input type="checkbox" checked={allTrips} disabled={disabled} onChange={(e) => setAllTrips(e.target.checked)} className="mt-0.5 size-4 accent-rose-600" />
              <span className="text-sm">
                <span className="block font-medium text-foreground">Remove all trips</span>
                <span className="block text-xs text-muted-foreground">
                  {n(data.trips.live)} live · {n(data.trips.inRecycleBin)} in the Recycle bin · {n(data.trips.stops)} stops · {n(data.trips.gpsPoints)} GPS points · {n(data.trips.documents)} photos & documents. Trip numbers start again at TRP-0001; drivers and trucks become Available.
                </span>
              </span>
            </label>
          </SettingsSection>

          <SettingsSection title="Finance records" description="Invoices, payments, bills, expenses, driver settlements and journal entries. Accounts, periods and bank accounts stay.">
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', financeOn ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20' : 'border-black/10 dark:border-white/15')}>
              <input type="checkbox" checked={financeOn} disabled={disabled || allTrips} onChange={(e) => setFinance(e.target.checked)} className="mt-0.5 size-4 accent-rose-600" />
              <span className="text-sm">
                <span className="block font-medium text-foreground">Remove finance records</span>
                <span className="block text-xs text-muted-foreground">
                  {Object.entries(data.finance).map(([k, v]) => `${n(v)} ${k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`).join(' · ')}
                  {allTrips && ' — included, because invoices and driver pay are built from trips.'}
                </span>
              </span>
            </label>
          </SettingsSection>

          <SettingsSection title={`Customers · ${customers.size} selected`} description="Their quotations, locations and documents go with them. Suggested ones have a test name or the demo phone number." flush>
            <PickList
              items={data.customers}
              picked={customers}
              onChange={setCustomers}
              disabled={disabled}
              emptyText="No customers."
              details={(c) => `${c.phone || 'No phone'} · ${c.trips} trips · ${c.quotations} quotations · ${c.locations} locations`}
            />
          </SettingsSection>

          <SettingsSection title={`Drivers · ${drivers.size} selected`} description="Their app login is switched off and their devices removed." flush>
            <PickList
              items={data.drivers}
              picked={drivers}
              onChange={setDrivers}
              disabled={disabled}
              emptyText="No drivers."
              details={(d) => `${d.phone || 'No phone'} · ${d.trips} trips`}
            />
          </SettingsSection>

          <SettingsSection title={`Locations · ${locations.size} selected`} description="Test-named places and places already in the Recycle bin. Quotations that stop at them go too." flush>
            <PickList
              items={data.locations.map((l) => ({ ...l, suggested: true }))}
              picked={locations}
              onChange={setLocations}
              disabled={disabled}
              emptyText="No test locations."
              details={(l) => `${l.customer ?? 'No customer'}${l.quotations ? ` · used by ${l.quotations} quotations` : ''}`}
            />
          </SettingsSection>

          {/* What will happen, and the one button. */}
          <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-black/10 bg-card/95 p-4 shadow-lg backdrop-blur dark:border-white/15">
            <p className="text-sm font-semibold text-foreground">
              {summary.length ? `Will remove: ${summary.join(', ')}.` : 'Nothing selected yet.'}
            </p>
            {blockers.length > 0 && (
              <p className="mt-1 text-xs text-rose-600">{blockers.slice(0, 3).join('; ')}{blockers.length > 3 ? ` and ${blockers.length - 3} more` : ''}. Tick "Remove all trips" too.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                id="data-cleanup-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={disabled || summary.length === 0}
                placeholder={`Type ${data.database} to confirm`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 font-mono text-sm dark:border-white/15"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={!canRun}
                onClick={() => run.mutate()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {run.isPending && <Loader2 className="size-4 animate-spin" />}
                {run.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsPage>
  );
}
