import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import gsap from 'gsap';
import { Minus, EyeOff, X, Sparkles, Loader2 } from 'lucide-react';
import { SUGGESTED_CHARGE_TYPES, SUGGESTED_UNIT_BY_CHARGE_TYPE } from '@mercon/shared-types';
import { surchargeRuleService } from '@/services/quotationService';
import type { ChargeReviewTrip, NewSubCharge } from '@/services/tripService';
import { authStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { useChargeReviewQueue, routeLabel, driverLabel, tripRef, reviewErrorMessage } from '@/hooks/useChargeReviewQueue';
import CrewChief, { type CrewChiefHandle, type CrewChiefMood } from './CrewChief';
import { buildChargeHints, daysWaiting } from './chargeHints';

/**
 * The extra-charges assistant: after a trip is completed, asks whether the
 * customer should be billed anything extra (labour, extra stops, waiting…)
 * and saves those sub-charges onto the trip. The queue is server-side — one
 * operator's answer clears a trip for everyone.
 */

const DOCKED_KEY = 'mercon_assistant_docked_v1';
const BIG_BILL = 500; // SAR — a bill this size gets a bigger reaction
const OLD_TRIP_DAYS = 3; // trips waiting this long make it restless

type View = 'ask' | 'charges' | 'later';

interface DraftLine {
  surchargeRuleId: string | null;
  charge_type: string;
  unit: string | null;
  rate: string;
  quantity: number;
}

const SNOOZE = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: 'Tomorrow', minutes: 24 * 60 },
];

const sar = (n: number) => `SAR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const lineAmount = (l: DraftLine) => (Number(l.rate) || 0) * l.quantity;

/** Pages where people are filling a form — the assistant stays small and quiet there. */
const FOCUS_ROUTES = [/\/trips\/new/, /\/trips\/[^/]+\/edit/, /\/new$/, /\/edit$/];

export default function OperationsAssistant() {
  const queue = useChargeReviewQueue();
  const location = useLocation();
  const chief = useRef<CrewChiefHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('ask');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ tripId: string; text: string } | null>(null);
  const [answered, setAnswered] = useState(0); // answered this session, for "2 of 5"
  const [docked, setDocked] = useState(() => {
    try { return localStorage.getItem(DOCKED_KEY) === 'true'; } catch { return false; }
  });

  const firstName = useMemo(() => {
    const u = authStore.getUser();
    return (u?.name || u?.username || '').trim().split(/\s+/)[0] || '';
  }, []);

  const trip: ChargeReviewTrip | undefined = queue.trips.find((t) => t.id === activeId) ?? queue.trips[0];
  const left = queue.total;
  const oldest = queue.trips.reduce((m, t) => Math.max(m, daysWaiting(t)), 0);

  // A form page or another dialog is open: stay small, never peek.
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    const check = () =>
      setDialogOpen(Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some((d) => !cardRef.current?.contains(d) && d !== cardRef.current));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, []);
  const focusMode = !open && (dialogOpen || FOCUS_ROUTES.some((r) => r.test(location.pathname)));

  /* ── The customer's saved charges + what they usually get ── */
  const { data: rules = [] } = useQuery({
    queryKey: ['surcharge-rules', 'assistant', trip?.customerId, trip?.quotationId],
    queryFn: () => surchargeRuleService.list({ customerId: trip?.customerId || undefined, quotationId: trip?.quotationId || undefined, active_only: true }),
    enabled: open && Boolean(trip?.customerId),
    staleTime: 60_000,
  });
  const habits = (trip?.customerId && queue.habits[trip.customerId]) || [];
  const hints = useMemo(() => (trip ? buildChargeHints(trip, rules, habits) : []), [trip, rules, habits]);
  const sortedRules = useMemo(() => {
    const freq = (type: string) => habits.find((h) => h.charge_type.toLowerCase() === type.toLowerCase())?.times ?? 0;
    return [...rules].sort((a, b) => freq(b.charge_type) - freq(a.charge_type));
  }, [rules, habits]);
  const ruleTypes = new Set(rules.map((r) => r.charge_type.toLowerCase()));
  const suggested = SUGGESTED_CHARGE_TYPES.filter((t) => !ruleTypes.has(t.toLowerCase()));
  const total = lines.reduce((s, l) => s + lineAmount(l), 0);

  /* ── Mood: what the closed tile shows ── */
  const restingMood = (): CrewChiefMood => (left === 0 ? 'sleep' : oldest >= OLD_TRIP_DAYS ? 'concerned' : 'idle');
  useEffect(() => {
    if (!open && !queue.isLoading) chief.current?.mood(restingMood());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, left, oldest >= OLD_TRIP_DAYS, queue.isLoading]);

  /* ── A trip just finished: a small hop and a one-line peek ── */
  const prevIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (queue.isLoading) return;
    const ids = new Set(queue.trips.map((t) => t.id));
    if (prevIds.current) {
      const fresh = queue.trips.find((t) => !prevIds.current!.has(t.id));
      if (fresh && !open && !focusMode && !docked) {
        chief.current?.notice();
        setPeek({ tripId: fresh.id, text: `${tripRef(fresh)} just finished. Any extras for ${fresh.customer?.name || 'the customer'}?` });
      }
    }
    prevIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.trips, queue.isLoading]);
  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(null), 7000);
    return () => clearTimeout(t);
  }, [peek]);

  /* ── Dock to Important Reminders (kept from the old assistant) ── */
  useEffect(() => {
    const onDock = () => {
      try {
        const val = localStorage.getItem(DOCKED_KEY) === 'true';
        setDocked(val);
        if (!val) openCard();
      } catch { /* storage blocked */ }
    };
    window.addEventListener('mercon_assistant_dock_change', onDock);
    return () => window.removeEventListener('mercon_assistant_dock_change', onDock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dock = () => {
    setOpen(false);
    setDocked(true);
    try { localStorage.setItem(DOCKED_KEY, 'true'); } catch { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent('mercon_assistant_dock_change'));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) closeCard(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ── Open / close ── */
  const animateIn = () => {
    requestAnimationFrame(() => {
      if (bodyRef.current) gsap.fromTo(bodyRef.current.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: 'power2.out' });
    });
  };
  function openCard(tripId?: string) {
    setPeek(null);
    if (tripId) setActiveId(tripId);
    setView('ask'); setLines([]); setError(null); setFlash(null);
    setOpen(true);
    requestAnimationFrame(() => {
      if (cardRef.current) gsap.fromTo(cardRef.current, { opacity: 0, scale: 0.94, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: 'power3.out' });
    });
    animateIn();
    chief.current?.mood('greet', left > 0 ? 'ask' : 'sleep');
  }
  function closeCard() {
    if (!cardRef.current) return setOpen(false);
    gsap.to(cardRef.current, { opacity: 0, scale: 0.94, y: 8, duration: 0.2, ease: 'power2.in', onComplete: () => setOpen(false) });
  }

  /* ── Charge lines ── */
  const addLine = (l: Omit<DraftLine, 'rate'> & { rate: number | null }, focusRate = true) => {
    setError(null);
    setLines((prev) => {
      const i = prev.findIndex((x) => x.charge_type.toLowerCase() === l.charge_type.toLowerCase());
      const next = i >= 0
        ? prev.map((x, k) => (k === i ? { ...x, quantity: x.quantity + l.quantity } : x))
        : [...prev, { ...l, rate: l.rate != null && l.rate > 0 ? String(l.rate) : '' }];
      const t = next.reduce((s, x) => s + lineAmount(x), 0);
      chief.current?.warm(t / 1000);
      if (focusRate && i < 0 && !(l.rate && l.rate > 0)) {
        requestAnimationFrame(() => (document.getElementById(`cc-rate-${next.length - 1}`) as HTMLInputElement | null)?.focus());
      }
      return next;
    });
  };
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => {
      const next = prev.map((x, k) => (k === i ? { ...x, ...patch } : x));
      if (patch.quantity !== undefined) chief.current?.warm(next.reduce((s, x) => s + lineAmount(x), 0) / 1000);
      return next;
    });
  const rateTyping = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRateChange = (i: number, value: string) => {
    updateLine(i, { rate: value });
    clearTimeout(rateTyping.current);
    rateTyping.current = setTimeout(() => {
      setLines((cur) => { chief.current?.warm(cur.reduce((s, x) => s + lineAmount(x), 0) / 1000); return cur; });
    }, 350);
  };

  /* ── Answers ── */
  const next = (message: string, mood: CrewChiefMood) => {
    setFlash(message); setLines([]); setError(null); setView('ask'); setActiveId(null);
    setAnswered((n) => n + 1);
    chief.current?.mood(mood, 'idle');
    setTimeout(() => {
      setFlash(null);
      animateIn();
      chief.current?.mood(queue.trips.length > 1 ? 'ask' : 'sleep');
    }, 1700);
  };

  const submit = async (charges: NewSubCharge[], message: string, mood: CrewChiefMood) => {
    if (!trip) return;
    setError(null);
    try {
      await queue.submit(trip.id, charges);
      next(message, mood);
    } catch (err: any) {
      if (err?.response?.data?.error?.code === 'ALREADY_REVIEWED') {
        next(`Someone already answered for ${tripRef(trip)}.`, 'nod');
        return;
      }
      setError(reviewErrorMessage(err));
      chief.current?.mood('oops', view === 'charges' ? 'idle' : 'ask');
    }
  };

  const bill = () => {
    if (!trip) return;
    const missing = lines.findIndex((l) => !(Number(l.rate) > 0) || !l.charge_type.trim());
    if (missing >= 0) {
      setError(`${lines[missing].charge_type || 'This charge'} needs a rate before I can bill it.`);
      chief.current?.mood('oops', 'idle');
      (document.getElementById(`cc-rate-${missing}`) as HTMLInputElement | null)?.focus();
      return;
    }
    const customer = trip.customer?.name || 'the customer';
    submit(
      lines.map((l) => ({ surchargeRuleId: l.surchargeRuleId, charge_type: l.charge_type.trim(), unit: l.unit, rate: Number(l.rate), quantity: l.quantity })),
      total >= BIG_BILL ? `Nice one. ${sar(total)} added to ${tripRef(trip)} for ${customer}.` : `Done. ${sar(total)} added to ${tripRef(trip)} for ${customer}.`,
      total >= BIG_BILL ? 'thrilled' : 'happy'
    );
  };

  const none = () => {
    if (!trip) return;
    submit([], pick([`Noted. Nothing extra on ${tripRef(trip)}.`, `Got it, ${tripRef(trip)} is clear.`, `No extras on ${tripRef(trip)}. Moving on.`]), 'nod');
  };

  const snooze = (minutes: number, label: string) => {
    if (!trip) return;
    queue.snooze(trip.id, minutes);
    setFlash(`I'll ask about ${tripRef(trip)} again ${label === 'Tomorrow' ? 'tomorrow' : `in ${label}`}.`);
    setView('ask'); setActiveId(null);
    chief.current?.mood('nod', 'idle');
    setTimeout(() => { setFlash(null); animateIn(); chief.current?.mood(queue.trips.length > 1 ? 'ask' : 'sleep'); }, 1700);
  };

  const goTo = (v: View) => {
    setView(v); setError(null);
    animateIn();
    if (v === 'charges') { chief.current?.mood('think'); chief.current?.warm(total / 1000); }
    if (v === 'ask') chief.current?.mood('ask');
  };

  // It watches the charge you point at and the rate you type.
  const watch = (e: React.SyntheticEvent) => {
    const t = (e.target as HTMLElement).closest('[data-watch]');
    if (t) chief.current?.lookAt(t);
  };
  const unwatch = (e: React.SyntheticEvent) => {
    if ((e.target as HTMLElement).closest('[data-watch]')) chief.current?.lookAt(null);
  };

  if (docked) return null;

  const position = Math.min(answered + 1, answered + left);
  const of = answered + left;
  const hello = () => {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return `${part}${firstName ? `, ${firstName}` : ''}.`;
  };
  const askLine = () => {
    if (!trip) return '';
    if (left === 1) return 'Last one. Anything extra on this trip?';
    if (answered === 0) return 'Quick one: any extra charges on this trip?';
    return pick(['Next up. Anything extra on this one?', 'And this one, any extra charges?', 'How about this trip?']);
  };
  const completedOn = trip?.actual_end || trip?.planned_start;
  const waitingDays = trip ? daysWaiting(trip) : 0;

  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[60] flex items-end gap-3" aria-live="polite">
      {/* The character — always there; click to open */}
      <div className={cn('pointer-events-auto relative transition-all duration-300', focusMode && 'scale-75 opacity-60 hover:scale-100 hover:opacity-100')} style={{ transformOrigin: '0% 100%' }}>
        <button
          type="button"
          onClick={() => (open ? closeCard() : openCard(peek?.tripId))}
          aria-label={left > 0 ? `Extra charges assistant: ${left} trips to check` : 'Extra charges assistant'}
          aria-expanded={open}
          className="block rounded-[22px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand cursor-pointer"
        >
          <CrewChief ref={chief} size={56} />
        </button>
        {!open && left > 0 && (
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 min-w-5 h-5 px-1.5 rounded-full bg-charcoal-strong text-white text-[11px] font-semibold font-mono leading-5 text-center ring-2 ring-white dark:bg-white dark:text-charcoal-strong dark:ring-slate-900">
            {left > 99 ? '99+' : left}
          </span>
        )}
      </div>

      {/* One-line peek when a trip just finished */}
      {peek && !open && (
        <button
          type="button"
          onClick={() => openCard(peek.tripId)}
          className="pointer-events-auto mb-2 max-w-[300px] rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-[13px] font-medium leading-snug text-slate-800 shadow-lg animate-fade-in hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
        >
          {peek.text}
        </button>
      )}

      {/* The card */}
      {open && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label="Extra charges"
          onPointerOver={watch}
          onPointerOut={unwatch}
          onFocus={watch}
          onBlur={unwatch}
          className="pointer-events-auto w-[372px] max-w-[calc(100vw-110px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-[0_1px_2px_rgba(45,43,44,.06),0_12px_32px_-8px_rgba(45,43,44,.22)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          style={{ transformOrigin: '0% 100%' }}
        >
          <div className="flex items-center gap-1 pl-4 pr-2 pt-2.5">
            <span className="flex-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {trip && !flash ? `Extra charges · ${position} of ${of}` : 'Extra charges'}
            </span>
            <button type="button" onClick={dock} title="Hide the assistant (bring it back from Important Reminders)" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
              <EyeOff className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={closeCard} aria-label="Minimise" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <div className="mx-4 mt-2 h-[3px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: of > 0 ? `${(answered / of) * 100}%` : '100%' }} />
          </div>

          <div ref={bodyRef} className="grid gap-3.5 px-4 pb-4 pt-3.5">
            {flash ? (
              <div className="flex items-center gap-2.5 py-1 text-sm font-semibold leading-snug">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span>{flash}</span>
              </div>
            ) : queue.isLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Checking finished trips…</div>
            ) : queue.isError && !trip ? (
              <>
                <p className="m-0 text-sm text-slate-600 dark:text-slate-300">I couldn't load the finished trips.</p>
                <div><button type="button" onClick={() => queue.refetch()} className="rounded-[10px] border border-slate-300 px-3.5 py-2 text-[13px] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800 cursor-pointer">Try again</button></div>
              </>
            ) : !trip ? (
              <>
                <p className="m-0 text-[14.5px] font-semibold">That's everything. Nice work.</p>
                <p className="m-0 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">Every finished trip has its extra charges answered. I'll nudge you when the next one comes in.</p>
              </>
            ) : (
              <>
                {/* Which trip */}
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[15px] font-bold tracking-tight">{trip.customer?.name || 'No customer'}</span>
                    <span className="font-mono text-xs text-slate-500">{tripRef(trip)}</span>
                    {waitingDays >= OLD_TRIP_DAYS && (
                      <span className="rounded-md bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">waiting {waitingDays} days</span>
                    )}
                  </div>
                  <div className="text-[13px] font-medium">{routeLabel(trip)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {driverLabel(trip)}
                    {completedOn ? ` · finished ${new Date(completedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    {trip.charges.length > 0 ? ` · already has ${trip.charges.map((c) => c.charge_type).join(', ')}` : ''}
                  </div>
                </div>

                {view === 'ask' && (
                  <>
                    {answered === 0 && activeId === null && <p className="m-0 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">{hello()} <b className="font-semibold text-slate-800 dark:text-slate-100">{left} finished {left === 1 ? 'trip is' : 'trips are'}</b> waiting for an answer on extra charges.</p>}
                    {hints.length > 0 && (
                      <ul className="m-0 grid list-none gap-1 rounded-xl bg-orange-50/70 px-3 py-2 dark:bg-orange-950/30">
                        {hints.map((h) => (
                          <li key={h.key} className="flex items-start gap-2 text-[12.5px] leading-snug text-[#9a3412] dark:text-orange-200">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />{h.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="m-0 text-[14.5px] font-semibold leading-snug">
                      {askLine()} <span className="font-medium text-slate-500 dark:text-slate-400">Labour, extra stops, waiting time.</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={queue.isSubmitting} onClick={() => { goTo('charges'); hints.forEach((h) => addLine(h.line, false)); }} className="rounded-[10px] bg-charcoal-strong px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-charcoal disabled:opacity-50 dark:bg-white dark:text-charcoal-strong cursor-pointer">
                        {hints.length > 0 ? 'Review charges' : 'Add charges'}
                      </button>
                      <button type="button" disabled={queue.isSubmitting} onClick={none} className="rounded-[10px] border border-slate-300 px-3.5 py-2 text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800 cursor-pointer">
                        {queue.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'None'}
                      </button>
                      <span className="flex-1" />
                      <button type="button" onClick={() => goTo('later')} className="rounded-[10px] px-3 py-2 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">Later</button>
                    </div>
                    {queue.trips.length > 1 && (
                      <button type="button" onClick={() => { const i = queue.trips.indexOf(trip); setActiveId(queue.trips[(i + 1) % queue.trips.length].id); animateIn(); chief.current?.mood('ask'); }} className="justify-self-start text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                        Skip to next trip
                      </button>
                    )}
                  </>
                )}

                {view === 'charges' && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedRules.map((r) => (
                        <button key={r.id} data-watch type="button" onClick={() => addLine({ surchargeRuleId: r.id, charge_type: r.charge_type, unit: r.unit, rate: Number(r.rate), quantity: 1 })} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-[#c2410c] hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 cursor-pointer">
                          {r.charge_type}<span className="ml-1 font-mono text-[11px] opacity-80">{sar(Number(r.rate))}</span>
                        </button>
                      ))}
                      {suggested.map((t) => (
                        <button key={t} data-watch type="button" onClick={() => addLine({ surchargeRuleId: null, charge_type: t, unit: SUGGESTED_UNIT_BY_CHARGE_TYPE[t], rate: null, quantity: 1 })} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800 cursor-pointer">
                          {t}
                        </button>
                      ))}
                    </div>

                    {lines.length > 0 ? (
                      <div className="grid max-h-48 gap-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1 dark:border-slate-700">
                        {lines.map((l, i) => (
                          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_76px_24px] items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            <div className="min-w-0 text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">
                              {l.charge_type}
                              {l.unit && <small className="block text-[11px] font-medium text-slate-500">{l.unit}</small>}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <button type="button" aria-label="Fewer" onClick={() => updateLine(i, { quantity: Math.max(1, l.quantity - 1) })} className="h-[22px] w-[22px] rounded-md bg-slate-100 text-[13px] font-semibold hover:bg-slate-200 dark:bg-slate-800 cursor-pointer">−</button>
                              <span className="min-w-[18px] text-center font-mono text-[12.5px] font-semibold">{l.quantity}</span>
                              <button type="button" aria-label="More" onClick={() => updateLine(i, { quantity: l.quantity + 1 })} className="h-[22px] w-[22px] rounded-md bg-slate-100 text-[13px] font-semibold hover:bg-slate-200 dark:bg-slate-800 cursor-pointer">+</button>
                            </div>
                            <input
                              id={`cc-rate-${i}`}
                              data-watch
                              type="number"
                              min="0"
                              inputMode="decimal"
                              value={l.rate}
                              placeholder="Rate"
                              aria-label={`Rate in SAR for ${l.charge_type}`}
                              onChange={(e) => onRateChange(i, e.target.value)}
                              className="h-[30px] w-full rounded-lg border border-slate-300 bg-white px-2 text-right font-mono text-[12.5px] font-semibold outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-900"
                            />
                            <button type="button" aria-label={`Remove ${l.charge_type}`} onClick={() => setLines((p) => p.filter((_, k) => k !== i))} className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 cursor-pointer">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="m-0 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">Choose a charge above. This customer's saved rates are highlighted.</p>
                    )}

                    {error && <p className="m-0 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

                    <div className="flex items-center justify-between gap-2.5">
                      <div>
                        <small className="block text-[11px] font-medium text-slate-500">Billed to {trip.customer?.name || 'the customer'}</small>
                        <b className="font-mono text-[19px] font-semibold tracking-tight tabular-nums">{sar(total)}</b>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => goTo('ask')} className="rounded-[10px] px-3 py-2 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 cursor-pointer">Back</button>
                        <button type="button" data-watch disabled={queue.isSubmitting || lines.length === 0} onClick={bill} className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white hover:brightness-105 disabled:opacity-40 cursor-pointer">
                          {queue.isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Bill customer
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {view === 'later' && (
                  <>
                    <p className="m-0 text-[14.5px] font-semibold">When should I ask again?</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SNOOZE.map((s) => (
                        <button key={s.minutes} type="button" onClick={() => snooze(s.minutes, s.label)} className="rounded-[10px] border border-slate-300 px-1.5 py-2 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800 cursor-pointer">{s.label}</button>
                      ))}
                    </div>
                    <button type="button" onClick={() => goTo('ask')} className="justify-self-start text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">Back</button>
                  </>
                )}

                {view === 'ask' && error && <p className="m-0 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
