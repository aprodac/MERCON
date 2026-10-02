/**
 * Extra-charges assistant for the operator app — the phone version of the
 * web dashboard's assistant. A floating brand tile sits above the bottom nav
 * while finished trips are waiting; tapping it opens a sheet that asks, trip
 * by trip, whether the customer should be billed anything extra.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Minus, Plus, Sparkles, X } from 'lucide-react-native';
import { SUGGESTED_CHARGE_TYPES, SUGGESTED_UNIT_BY_CHARGE_TYPE, buildChargeHints, daysWaiting } from '@mercon/shared-types';
import CrewChief, { type CrewChiefHandle, type CrewChiefMood } from './CrewChief';
import {
  useChargeReviewQueue, useCustomerChargeRules, tripRef, routeLabel, driverLabel, reviewErrorMessage, type NewSubCharge,
} from './chargeReviewApi';

const BRAND = '#FA634E';
const INK = '#2D2B2C';
const MUTED = '#7B7678';
const LINE = '#E7E3E1';
const BIG_BILL = 500;
const OLD_TRIP_DAYS = 3;

type View_ = 'ask' | 'charges' | 'later';
interface DraftLine { surchargeRuleId: string | null; charge_type: string; unit: string | null; rate: string; quantity: number }

const sar = (n: number) => `SAR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SNOOZE = [{ label: '15 min', minutes: 15 }, { label: '1 hour', minutes: 60 }, { label: '4 hours', minutes: 240 }, { label: 'Tomorrow', minutes: 1440 }];

export function ChargeAssistant({ userName }: { userName?: string }) {
  const queue = useChargeReviewQueue();
  const tileChief = useRef<CrewChiefHandle>(null);
  const chief = useRef<CrewChiefHandle>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View_>('ask');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);

  const trip = queue.trips.find((t) => t.id === activeId) ?? queue.trips[0];
  const left = queue.total;
  const oldest = queue.trips.reduce((m, t) => Math.max(m, daysWaiting(t)), 0);

  const { data: rules = [] } = useCustomerChargeRules(trip?.customerId, trip?.quotationId, open);
  const habits = (trip?.customerId && queue.habits[trip.customerId]) || [];
  const hints = useMemo(() => (trip ? buildChargeHints(trip, rules, habits) : []), [trip, rules, habits]);
  const sortedRules = useMemo(() => {
    const freq = (t: string) => habits.find((h) => h.charge_type.toLowerCase() === t.toLowerCase())?.times ?? 0;
    return [...rules].sort((a, b) => freq(b.charge_type) - freq(a.charge_type));
  }, [rules, habits]);
  const ruleTypes = new Set(rules.map((r) => r.charge_type.toLowerCase()));
  const suggested = SUGGESTED_CHARGE_TYPES.filter((t) => !ruleTypes.has(t.toLowerCase()));
  const total = lines.reduce((s, l) => s + (Number(l.rate) || 0) * l.quantity, 0);

  // The floating tile's mood: restless when trips have waited a while.
  useEffect(() => {
    tileChief.current?.mood(oldest >= OLD_TRIP_DAYS ? 'concerned' : 'idle');
  }, [oldest >= OLD_TRIP_DAYS, left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // A trip just finished: the tile hops.
  const prevIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (queue.isLoading) return;
    const ids = new Set(queue.trips.map((t) => t.id));
    if (prevIds.current && queue.trips.some((t) => !prevIds.current!.has(t.id)) && !open) {
      tileChief.current?.notice();
      Haptics.selectionAsync().catch(() => {});
    }
    prevIds.current = ids;
  }, [queue.trips, queue.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSheet = () => {
    setView('ask'); setLines([]); setError(null); setFlash(null); setActiveId(null);
    setOpen(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => chief.current?.mood('greet', left > 0 ? 'ask' : 'sleep'), 250);
  };

  const addLine = (l: Omit<DraftLine, 'rate'> & { rate: number | null }) => {
    setError(null);
    setLines((prev) => {
      const i = prev.findIndex((x) => x.charge_type.toLowerCase() === l.charge_type.toLowerCase());
      const next = i >= 0 ? prev.map((x, k) => (k === i ? { ...x, quantity: x.quantity + l.quantity } : x))
        : [...prev, { ...l, rate: l.rate && l.rate > 0 ? String(l.rate) : '' }];
      chief.current?.warm(next.reduce((s, x) => s + (Number(x.rate) || 0) * x.quantity, 0) / 1000);
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  };
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => {
      const next = prev.map((x, k) => (k === i ? { ...x, ...patch } : x));
      if (patch.quantity !== undefined) chief.current?.warm(next.reduce((s, x) => s + (Number(x.rate) || 0) * x.quantity, 0) / 1000);
      return next;
    });

  const after = (message: string, mood: CrewChiefMood) => {
    setFlash(message); setLines([]); setError(null); setView('ask'); setActiveId(null);
    setAnswered((n) => n + 1);
    chief.current?.mood(mood, 'idle');
    setTimeout(() => { setFlash(null); chief.current?.mood(queue.trips.length > 1 ? 'ask' : 'sleep'); }, 1700);
  };

  const submit = async (charges: NewSubCharge[], message: string, mood: CrewChiefMood) => {
    if (!trip) return;
    setError(null);
    try {
      await queue.submit(trip.id, charges);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      after(message, mood);
    } catch (err: any) {
      if (err?.response?.data?.error?.code === 'ALREADY_REVIEWED') return after(`Someone already answered for ${tripRef(trip)}.`, 'nod');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(reviewErrorMessage(err));
      chief.current?.mood('oops', 'idle');
    }
  };

  const bill = () => {
    if (!trip) return;
    const missing = lines.find((l) => !(Number(l.rate) > 0));
    if (missing) {
      setError(`${missing.charge_type} needs a rate before I can bill it.`);
      chief.current?.mood('oops', 'idle');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    const customer = trip.customer?.name || 'the customer';
    submit(
      lines.map((l) => ({ surchargeRuleId: l.surchargeRuleId, charge_type: l.charge_type, unit: l.unit, rate: Number(l.rate), quantity: l.quantity })),
      `${total >= BIG_BILL ? 'Nice one.' : 'Done.'} ${sar(total)} added to ${tripRef(trip)} for ${customer}.`,
      total >= BIG_BILL ? 'thrilled' : 'happy'
    );
  };

  const goTo = (v: View_) => {
    setView(v); setError(null);
    if (v === 'charges') chief.current?.mood('think');
    if (v === 'ask') chief.current?.mood('ask');
  };

  if (left === 0 && !open) return null;

  const of = answered + left;
  const greeting = (() => {
    const h = new Date().getHours();
    return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${userName ? `, ${userName.split(' ')[0]}` : ''}.`;
  })();
  const askLine = left === 1 ? 'Last one. Anything extra on this trip?' : answered === 0 ? 'Quick one: any extra charges on this trip?' : 'Next up. Anything extra on this one?';
  const waited = trip ? daysWaiting(trip) : 0;

  return (
    <>
      {left > 0 && !open && (
        <Pressable onPress={openSheet} accessibilityRole="button" accessibilityLabel={`Extra charges: ${left} trips to check`} style={s.fab} hitSlop={8}>
          <CrewChief ref={tileChief} size={58} />
          <View style={s.count}><Text style={s.countText}>{left > 99 ? '99+' : left}</Text></View>
        </Pressable>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap} pointerEvents="box-none">
          <View style={s.sheet}>
            <View style={s.grabber} />
            <View style={s.head}>
              <CrewChief ref={chief} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={s.headTitle}>{trip && !flash ? `Extra charges · ${Math.min(answered + 1, of)} of ${of}` : 'Extra charges'}</Text>
                <View style={s.progress}><View style={[s.progressFill, { width: `${of ? (answered / of) * 100 : 100}%` }]} /></View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close" style={s.iconBtn}><X size={18} color={MUTED} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              {flash ? (
                <View style={s.flash}><View style={s.check}><Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text></View><Text style={s.flashText}>{flash}</Text></View>
              ) : queue.isLoading ? (
                <View style={s.row}><ActivityIndicator color={BRAND} /><Text style={s.muted}>Checking finished trips…</Text></View>
              ) : !trip ? (
                <>
                  <Text style={s.q}>That's everything. Nice work.</Text>
                  <Text style={s.muted}>Every finished trip has its extra charges answered.</Text>
                </>
              ) : (
                <>
                  <View style={{ gap: 3 }}>
                    <View style={s.row}>
                      <Text style={s.cust} numberOfLines={1}>{trip.customer?.name || 'No customer'}</Text>
                      <Text style={s.ref}>{tripRef(trip)}</Text>
                      {waited >= OLD_TRIP_DAYS && <Text style={s.old}>waiting {waited} days</Text>}
                    </View>
                    <Text style={s.route}>{routeLabel(trip)}</Text>
                    <Text style={s.muted}>{driverLabel(trip)}{trip.charges.length ? ` · already has ${trip.charges.map((c) => c.charge_type).join(', ')}` : ''}</Text>
                  </View>

                  {view === 'ask' && (
                    <>
                      {answered === 0 && activeId === null && (
                        <Text style={s.muted}>{greeting} <Text style={{ color: INK, fontWeight: '700' }}>{left} finished {left === 1 ? 'trip is' : 'trips are'}</Text> waiting for an answer on extra charges.</Text>
                      )}
                      {hints.length > 0 && (
                        <View style={s.hints}>
                          {hints.map((h) => (
                            <View key={h.key} style={s.row}><Sparkles size={12} color="#9A3412" /><Text style={s.hintText}>{h.text}</Text></View>
                          ))}
                        </View>
                      )}
                      <Text style={s.q}>{askLine} <Text style={s.qSub}>Labour, extra stops, waiting time.</Text></Text>
                      <View style={s.row}>
                        <TouchableOpacity style={[s.btn, s.primary]} disabled={queue.isSubmitting} onPress={() => { goTo('charges'); hints.forEach((h) => addLine(h.line)); }}>
                          <Text style={s.primaryText}>{hints.length ? 'Review charges' : 'Add charges'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.btn, s.secondary]} disabled={queue.isSubmitting} onPress={() => submit([], pick([`Noted. Nothing extra on ${tripRef(trip)}.`, `Got it, ${tripRef(trip)} is clear.`]), 'nod')}>
                          {queue.isSubmitting ? <ActivityIndicator size="small" color={INK} /> : <Text style={s.secondaryText}>None</Text>}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity style={s.btn} onPress={() => goTo('later')}><Text style={s.ghostText}>Later</Text></TouchableOpacity>
                      </View>
                      {queue.trips.length > 1 && (
                        <TouchableOpacity onPress={() => { const i = queue.trips.indexOf(trip); setActiveId(queue.trips[(i + 1) % queue.trips.length].id); chief.current?.mood('ask'); }}>
                          <Text style={s.link}>Skip to next trip</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {view === 'charges' && (
                    <>
                      <View style={s.chips}>
                        {sortedRules.map((r) => (
                          <TouchableOpacity key={r.id} style={[s.chip, s.chipRule]} onPress={() => addLine({ surchargeRuleId: r.id, charge_type: r.charge_type, unit: r.unit, rate: Number(r.rate), quantity: 1 })}>
                            <Text style={s.chipRuleText}>{r.charge_type} <Text style={s.mono}>{sar(Number(r.rate))}</Text></Text>
                          </TouchableOpacity>
                        ))}
                        {suggested.map((t) => (
                          <TouchableOpacity key={t} style={s.chip} onPress={() => addLine({ surchargeRuleId: null, charge_type: t, unit: SUGGESTED_UNIT_BY_CHARGE_TYPE[t], rate: null, quantity: 1 })}>
                            <Text style={s.chipText}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {lines.length > 0 ? (
                        <View style={s.lines}>
                          {lines.map((l, i) => (
                            <View key={i} style={s.line}>
                              <View style={{ flex: 1 }}>
                                <Text style={s.lineName}>{l.charge_type}</Text>
                                {l.unit ? <Text style={s.lineUnit}>{l.unit}</Text> : null}
                              </View>
                              <TouchableOpacity style={s.step} onPress={() => updateLine(i, { quantity: Math.max(1, l.quantity - 1) })} accessibilityLabel="Fewer"><Minus size={14} color={INK} /></TouchableOpacity>
                              <Text style={[s.mono, { minWidth: 18, textAlign: 'center' }]}>{l.quantity}</Text>
                              <TouchableOpacity style={s.step} onPress={() => updateLine(i, { quantity: l.quantity + 1 })} accessibilityLabel="More"><Plus size={14} color={INK} /></TouchableOpacity>
                              <TextInput
                                value={l.rate}
                                onChangeText={(v) => updateLine(i, { rate: v.replace(/[^0-9.]/g, '') })}
                                onEndEditing={() => chief.current?.warm(total / 1000)}
                                placeholder="Rate"
                                keyboardType="decimal-pad"
                                style={s.rate}
                                accessibilityLabel={`Rate in SAR for ${l.charge_type}`}
                              />
                              <TouchableOpacity onPress={() => setLines((p) => p.filter((_, k) => k !== i))} accessibilityLabel={`Remove ${l.charge_type}`} hitSlop={6}><X size={16} color="#A8A3A5" /></TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={s.muted}>Choose a charge above. This customer's saved rates are highlighted.</Text>
                      )}
                      {error && <Text style={s.error}>{error}</Text>}
                      <View style={[s.row, { justifyContent: 'space-between' }]}>
                        <View>
                          <Text style={s.lineUnit}>Billed to {trip.customer?.name || 'the customer'}</Text>
                          <Text style={s.total}>{sar(total)}</Text>
                        </View>
                        <View style={s.row}>
                          <TouchableOpacity style={s.btn} onPress={() => goTo('ask')}><Text style={s.ghostText}>Back</Text></TouchableOpacity>
                          <TouchableOpacity style={[s.btn, s.brand, (queue.isSubmitting || !lines.length) && { opacity: 0.4 }]} disabled={queue.isSubmitting || !lines.length} onPress={bill}>
                            {queue.isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryText}>Bill customer</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}

                  {view === 'later' && (
                    <>
                      <Text style={s.q}>When should I ask again?</Text>
                      <View style={s.row}>
                        {SNOOZE.map((o) => (
                          <TouchableOpacity key={o.minutes} style={[s.btn, s.secondary, { flex: 1, alignItems: 'center' }]} onPress={() => {
                            queue.snooze(trip.id, o.minutes);
                            after(`I'll ask about ${tripRef(trip)} again ${o.label === 'Tomorrow' ? 'tomorrow' : `in ${o.label}`}.`, 'nod');
                            setAnswered((n) => n - 1);
                          }}>
                            <Text style={s.secondaryText}>{o.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity onPress={() => goTo('ask')}><Text style={s.link}>Back</Text></TouchableOpacity>
                    </>
                  )}
                  {view === 'ask' && error && <Text style={s.error}>{error}</Text>}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fab: { position: 'absolute', right: 18, bottom: 104, zIndex: 50 },
  count: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F6F6F7' },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(45,43,44,0.35)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 28, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#DDD8D5', marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10 },
  headTitle: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  progress: { height: 3, borderRadius: 2, backgroundColor: '#EFEDEB', marginTop: 7, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: BRAND },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 18, paddingTop: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cust: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: -0.2, flexShrink: 1 },
  ref: { fontSize: 12, color: MUTED, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  old: { fontSize: 11, fontWeight: '600', color: '#B45309', backgroundColor: '#FFFBEB', paddingHorizontal: 6, borderRadius: 5, overflow: 'hidden' },
  route: { fontSize: 13.5, fontWeight: '500', color: INK },
  muted: { fontSize: 13, color: MUTED, lineHeight: 19 },
  hints: { backgroundColor: '#FFF7F2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 5 },
  hintText: { fontSize: 13, color: '#9A3412', flexShrink: 1 },
  q: { fontSize: 15.5, fontWeight: '600', color: INK, lineHeight: 22 },
  qSub: { fontWeight: '500', color: MUTED },
  btn: { borderRadius: 11, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: INK },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: '#D8D3D0', backgroundColor: '#fff' },
  secondaryText: { color: INK, fontSize: 14, fontWeight: '600' },
  ghostText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  brand: { backgroundColor: BRAND },
  link: { fontSize: 13, color: MUTED, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#D8D3D0', paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, color: INK, fontWeight: '500' },
  chipRule: { borderColor: 'transparent', backgroundColor: '#FFF1EE' },
  chipRuleText: { fontSize: 13, color: '#C2410C', fontWeight: '500' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12.5, fontWeight: '600', color: INK },
  lines: { borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 4, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 10, paddingRight: 6 },
  lineName: { fontSize: 14, fontWeight: '600', color: INK },
  lineUnit: { fontSize: 11.5, color: MUTED },
  step: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1EFEE', alignItems: 'center', justifyContent: 'center' },
  rate: { width: 76, height: 36, borderWidth: 1, borderColor: '#D8D3D0', borderRadius: 9, paddingHorizontal: 8, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  error: { fontSize: 13, color: '#C53030', fontWeight: '500' },
  total: { fontSize: 20, fontWeight: '700', color: INK, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  flash: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1F9D55', alignItems: 'center', justifyContent: 'center' },
  flashText: { fontSize: 15, fontWeight: '600', color: INK, flex: 1, lineHeight: 21 },
});
