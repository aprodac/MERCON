import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CHARGE_REVIEW_LOOKBACK_DAYS, DEFAULT_ASSISTANT_CONFIG, type AssistantConfig } from '@mercon/shared-types';
import { SettingsPage, SettingsSection, SettingsRow } from '@/components/settings/SettingsKit';
import { Switch } from '@/components/ui/switch';
import Btn from '@/components/ui/Btn';
import { cn } from '@/lib/utils';
import { settingsService } from '@/services/settingsService';
import CrewChief, { type CrewChiefHandle, type CrewChiefMood } from '@/components/assistant/CrewChief';
import { useAssistantConfig } from '@/components/assistant/useAssistantConfig';

/**
 * Settings → Assistant (Admin): what the floating assistant reports and how
 * it looks, for everyone on the team. Each person can still hide it for
 * themselves from the top bar.
 */

const MOODS: { mood: CrewChiefMood; label: string }[] = [
  { mood: 'greet', label: 'Greet' },
  { mood: 'ask', label: 'Ask' },
  { mood: 'think', label: 'Think' },
  { mood: 'happy', label: 'Billed' },
  { mood: 'thrilled', label: 'Big bill' },
  { mood: 'oops', label: 'Oops' },
  { mood: 'concerned', label: 'Waiting' },
  { mood: 'sleep', label: 'Sleep' },
];
const RESTLESS_DAYS = [1, 2, 3, 5, 7];

const LOOK: { key: keyof AssistantConfig['look']; label: string; description: string }[] = [
  { key: 'cap', label: 'Delivery cap', description: 'Tips when it’s pleased and slips over its eyes when it sleeps.' },
  { key: 'flag', label: 'Convoy flag', description: 'Waves faster when it’s excited and turns checkered when charges are billed.' },
  { key: 'headset', label: 'Dispatcher headset', description: 'A green light comes on while it’s asking you about a trip.' },
];

function Segmented<T extends string | number>({ value, options, onChange, disabled, format }: { value: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; format: (v: T) => string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800', disabled && 'opacity-50')}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={value === o}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed',
            value === o ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          )}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export default function AssistantSettingsPage() {
  const saved = useAssistantConfig();
  const [draft, setDraft] = useState<AssistantConfig>(saved);
  const savedJson = JSON.stringify(saved);
  useEffect(() => setDraft(JSON.parse(savedJson)), [savedJson]);
  const dirty = JSON.stringify(draft) !== savedJson;

  const chief = useRef<CrewChiefHandle>(null);
  const [mood, setMood] = useState<CrewChiefMood>('idle');
  const play = (m: CrewChiefMood) => {
    setMood(m);
    chief.current?.mood(m, m === 'greet' || m === 'happy' || m === 'thrilled' || m === 'oops' ? 'idle' : undefined);
  };

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (c: AssistantConfig) => settingsService.updateAssistant(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['trips', 'charge-review-queue'] });
      toast.success('Assistant settings saved for everyone');
      chief.current?.mood('happy', 'idle');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Could not save the assistant settings'),
  });

  const ec = draft.reports.extraCharges;
  const setEc = (patch: Partial<AssistantConfig['reports']['extraCharges']>) =>
    setDraft((d) => ({ ...d, reports: { ...d.reports, extraCharges: { ...d.reports.extraCharges, ...patch } } }));
  const setLook = (key: keyof AssistantConfig['look'], on: boolean) => {
    setDraft((d) => ({ ...d, look: { ...d.look, [key]: on } }));
    if (on) chief.current?.notice();
  };

  return (
    <SettingsPage
      title="Assistant"
      description="The Mercon tile in the corner of the screen that checks finished trips with you. Choose what it reports and how it looks for everyone on the team. Each person can still hide it from the top bar."
      actions={
        <>
          <Btn label="Reset to defaults" variant="secondary" disabled={save.isPending || JSON.stringify(draft) === JSON.stringify(DEFAULT_ASSISTANT_CONFIG)} onClick={() => setDraft(DEFAULT_ASSISTANT_CONFIG)} />
          <Btn label="Save" variant="primary" isLoading={save.isPending} disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)} />
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5 min-w-0">
          <SettingsSection title="What it reports" description="Turn a report off and the assistant stops asking about it. With every report off, it disappears for everyone.">
            <SettingsRow label="Extra charges after a trip" description="Asks, for each completed trip, whether the customer should be billed labour, extra stops, waiting time or other charges. Answers go onto the trip." htmlFor="ec-enabled">
              <Switch id="ec-enabled" checked={ec.enabled} onCheckedChange={(v) => setEc({ enabled: v })} />
            </SettingsRow>
            <SettingsRow label="How far back it asks" description="Only trips finished within this window are asked about. Older trips stay on their trip pages.">
              <Segmented value={ec.lookbackDays} options={CHARGE_REVIEW_LOOKBACK_DAYS} disabled={!ec.enabled} onChange={(v) => setEc({ lookbackDays: v })} format={(v) => `${v} days`} />
            </SettingsRow>
            <SettingsRow label="Say when a trip finishes" description="A small hop and a one-line note as soon as a trip is completed." htmlFor="ec-peek">
              <Switch id="ec-peek" disabled={!ec.enabled} checked={ec.peekOnNewTrip} onCheckedChange={(v) => setEc({ peekOnNewTrip: v })} />
            </SettingsRow>
            <SettingsRow label="Get restless after" description="Trips waiting this long get a “waiting” tag and the tile starts to fidget.">
              <Segmented value={ec.restlessAfterDays} options={RESTLESS_DAYS} disabled={!ec.enabled} onChange={(v) => setEc({ restlessAfterDays: v })} format={(v) => `${v} ${v === 1 ? 'day' : 'days'}`} />
            </SettingsRow>
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              More reports will be listed here as they are added, each with its own switch.
            </p>
          </SettingsSection>

          <SettingsSection title="Look" description="Crew details on the character. The same look appears on the web dashboard and in the operator app.">
            {LOOK.map((l) => (
              <SettingsRow key={l.key} label={l.label} description={l.description} htmlFor={`look-${l.key}`}>
                <Switch id={`look-${l.key}`} checked={draft.look[l.key]} onCheckedChange={(v) => setLook(l.key, v)} />
              </SettingsRow>
            ))}
          </SettingsSection>
        </div>

        <SettingsSection title="Preview" description="Try its moods with the current look." className="lg:sticky lg:top-4 self-start">
          <div className="grid place-items-center rounded-xl bg-slate-50 pb-6 pt-14 dark:bg-slate-800/40">
            <div className={cn('transition-opacity', !ec.enabled && 'opacity-40')}>
              <CrewChief ref={chief} size={112} look={draft.look} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.mood}
                type="button"
                onClick={() => play(m.mood)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  mood === m.mood ? 'border-transparent bg-charcoal-strong text-white dark:bg-white dark:text-charcoal-strong' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {!ec.enabled && <p className="mt-3 text-xs text-slate-500">Off for everyone while no report is switched on.</p>}
        </SettingsSection>
      </div>
    </SettingsPage>
  );
}
