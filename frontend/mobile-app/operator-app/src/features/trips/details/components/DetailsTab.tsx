/**
 * The rest of the trip: what to fix before it starts (or how it went), truck
 * and driver, money, the key facts, and paperwork.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Check, ChevronRight, FileText, ListOrdered, Phone, Plus, Receipt, Smartphone, Timer, Route, Truck, UploadCloud, X,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { DriverAvatar } from '../../../drivers/components/DriverAvatar';
import { initialsOf, niceName } from '../../create/components/ui';
import type { LiveGpsFix, OperatorTripDetail, OperatorTripDocument, TripOverview, TripPhase } from '../../../../lib/operator';
import {
  ON_TIME_GRACE_MIN, TONE, ago, billingLabel, canChangeAssignment, formatDuration, lineType, minutesLate, moneyOf, sar, sortedStops,
  type Formatters,
} from '../tripDetailsModel';
import { Card, Chip, Divider, Fact, INK, InfoRow, MUTED, SectionHead } from './parts';

interface Props {
  trip: OperatorTripDetail;
  phase: TripPhase;
  overview: TripOverview | null;
  f: Formatters;
  onChange: (what: 'driver' | 'truck') => void;
  onCharges: () => void;
  onUpload: () => void;
  onActivity: () => void;
  onOpenDoc: (doc: OperatorTripDocument) => void;
}

export function DetailsTab({ trip, phase, overview, f, onChange, onCharges, onUpload, onActivity, onOpenDoc }: Props) {
  const paperwork = (trip.documents ?? []).filter((d) => !['POD', 'Waybill', 'Emergency'].includes(d.doc_type ?? ''));
  const info: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Scheduled', value: trip.planned_start ? f.dayTime(trip.planned_start) : '—' },
    { label: 'Line type', value: lineType(trip) },
    { label: 'Billing', value: billingLabel(trip) },
    ...(trip.awb_number ? [{ label: 'AWB', value: trip.awb_number, mono: true }] : []),
    ...(trip.planned_distance ? [{ label: 'Planned distance', value: `${Math.round(trip.planned_distance)} km` }] : []),
    ...(trip.quotation?.name || trip.rateCard?.name ? [{ label: 'Quotation', value: niceName(trip.quotation?.name || trip.rateCard?.name || '') }] : []),
    { label: 'Created', value: f.date(trip.createdAt) || '—' },
  ];
  return (
    <View style={{ gap: 12 }}>
      {phase === 'planned' && overview?.checks ? <PreTripChecks checks={overview.checks} f={f} /> : null}
      {phase === 'done' ? (
        <>
          <Text style={[s.group, { marginTop: 0 }]}>Trip summary</Text>
          <TripSummary trip={trip} overview={overview} f={f} />
        </>
      ) : null}

      <Text style={s.group}>Truck and driver</Text>
      <Assignment trip={trip} phase={phase} overview={overview} onChange={onChange} />

      <Text style={s.group}>Money</Text>
      <MoneyCard trip={trip} onCharges={onCharges} />

      <Text style={s.group}>Trip info</Text>
      <Card style={{ paddingVertical: 4 }}>
        {info.map((r, i) => <InfoRow key={r.label} label={r.label} value={r.value} mono={r.mono} last={i === info.length - 1} />)}
      </Card>

      <Text style={s.group}>Documents</Text>
      <Card style={{ paddingVertical: 4 }}>
        {paperwork.length === 0 ? <Text style={[s.muted, { paddingVertical: 12 }]}>No paperwork yet. Driver photos are on the Updates tab.</Text> : (
          paperwork.map((d) => (
            <TouchableOpacity key={d.id} style={s.doc} activeOpacity={0.6} onPress={() => onOpenDoc(d)}>
              <FileText size={18} color={MUTED} />
              <View style={{ flex: 1 }}>
                <Text style={s.docName} numberOfLines={1}>{d.documentType?.name || d.title || d.doc_type || 'Document'}</Text>
                <Text style={s.muted}>{f.date(d.createdAt)}</Text>
              </View>
              <ChevronRight size={16} color="#A1A1AA" />
            </TouchableOpacity>
          ))
        )}
        <View style={s.docActions}>
          <TouchableOpacity style={s.linkBtn} onPress={onUpload} activeOpacity={0.7}>
            <UploadCloud size={16} color={INK} strokeWidth={2.1} />
            <Text style={s.linkBtnText}>Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.linkBtn} onPress={onActivity} activeOpacity={0.7}>
            <ListOrdered size={16} color={INK} strokeWidth={2.1} />
            <Text style={s.linkBtnText}>Activity log</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </View>
  );
}

// ── Before it starts ──────────────────────────────────────────────────────────

function PreTripChecks({ checks, f }: { checks: NonNullable<TripOverview['checks']>; f: Formatters }) {
  const rows: { ok: boolean; text: string; detail?: string }[] = checks.third_party
    ? [{ ok: true, text: 'Third-party trip · their truck and driver' }]
    : [
        { ok: checks.driver_assigned, text: checks.driver_assigned ? 'Driver assigned' : 'No driver assigned' },
        { ok: checks.truck_assigned, text: checks.truck_assigned ? 'Truck assigned' : 'No truck assigned' },
      ];
  for (const e of checks.expiring) {
    rows.push({ ok: false, text: `${e.name}: ${e.label} ${e.expired ? 'has expired' : 'expires before the trip'}`, detail: f.date(e.expiry_date) });
  }
  if (!checks.third_party && checks.expiring.length === 0 && (checks.driver_assigned || checks.truck_assigned)) {
    rows.push({ ok: true, text: 'Documents valid for the trip date' });
  }
  const problems = rows.filter((r) => !r.ok).length;
  return (
    <Card style={problems ? { borderWidth: 1.5, borderColor: '#F5C2BC' } : undefined}>
      <SectionHead title="Before it starts" right={<Chip label={problems ? `${problems} to fix` : 'Ready'} tone={problems ? 'red' : 'green'} />} />
      <View style={{ gap: 8 }}>
        {rows.map((r, i) => (
          <View key={i} style={s.checkRow}>
            <View style={[s.checkDot, { backgroundColor: r.ok ? TONE.green.bg : TONE.red.bg }]}>
              {r.ok ? <Check size={11} color={TONE.green.fg} strokeWidth={3.5} /> : <X size={11} color={TONE.red.fg} strokeWidth={3.5} />}
            </View>
            <Text style={[s.checkText, !r.ok && { color: TONE.red.fg, fontWeight: '600' }]}>
              {r.text}{r.detail ? <Text style={s.muted}> · {r.detail}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ── Trip summary (finished trips) ─────────────────────────────────────────────

/** How the finished trip actually ran: when, how long, how far, how punctual, and whether it's been invoiced. */
function TripSummary({ trip, overview, f }: { trip: OperatorTripDetail; overview: TripOverview | null; f: Formatters }) {
  const stops = sortedStops(trip);
  const judged = stops.map((st) => minutesLate(st.planned_arrival, st.actual_arrival)).filter((m): m is number => m != null);
  const onTime = judged.filter((m) => m <= ON_TIME_GRACE_MIN).length;
  const late = judged.length - onTime;
  const durationSec = trip.actual_start && trip.actual_end ? (new Date(trip.actual_end).getTime() - new Date(trip.actual_start).getTime()) / 1000 : null;
  const meters = overview?.path_distance_m ?? 0;
  const invoiced = trip.status === 'Invoiced';

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Started', value: trip.actual_start ? f.dateTime(trip.actual_start) : 'Not recorded' },
    { label: 'Delivered', value: trip.actual_end ? f.dateTime(trip.actual_end) : 'Not recorded' },
    { label: 'Time taken', value: durationSec && durationSec > 0 ? formatDuration(durationSec) : 'Not recorded' },
    // Under 1 km means the truck's GPS never reported the drive, not that it didn't move.
    { label: 'Distance driven', value: meters >= 1000 ? `${Math.round(meters / 1000)} km` : 'No GPS record' },
    {
      label: 'Stops on time',
      value: judged.length === 0 ? 'No planned times' : late === 0 ? `All ${judged.length} on time` : `${late} of ${judged.length} late`,
      color: judged.length === 0 ? undefined : late === 0 ? TONE.green.fg : TONE.red.fg,
    },
    { label: 'Invoice', value: invoiced ? 'Invoiced' : 'Not invoiced yet', color: invoiced ? TONE.green.fg : '#B54708' },
  ];

  return (
    <Card style={{ paddingVertical: 4 }}>
      {rows.map((r, i) => (
        <View key={r.label} style={[s.sumRow, i < rows.length - 1 && s.sumBorder]}>
          <Text style={s.sumLabel}>{r.label}</Text>
          <Text style={[s.sumValue, r.color ? { color: r.color } : null]}>{r.value}</Text>
        </View>
      ))}
    </Card>
  );
}

// ── Truck and driver ──────────────────────────────────────────────────────────

function Feed({ icon: Icon, label, fix, missing }: { icon: typeof Truck; label: string; fix: LiveGpsFix | null | undefined; missing: string }) {
  const state = !fix ? 'none' : fix.fresh ? 'live' : 'stale';
  return (
    <View style={s.feed}>
      <Icon size={12} color={MUTED} />
      <Text style={s.feedText}>{label}</Text>
      <View style={[s.feedDot, { backgroundColor: state === 'live' ? TONE.green.dot : state === 'stale' ? '#D97706' : '#C9CCD6' }]} />
      <Text style={[s.feedText, state !== 'none' && { color: INK, fontWeight: '600' }]}>{state === 'live' ? 'Live' : state === 'stale' ? ago(fix!.recorded_at) : missing}</Text>
    </View>
  );
}

function Assignment({ trip, phase, overview, onChange }: { trip: OperatorTripDetail; phase: TripPhase; overview: TripOverview | null; onChange: (w: 'driver' | 'truck') => void }) {
  const router = useRouter();
  const d = trip.driver;
  const v = trip.vehicle;
  const co = trip.coDriver;
  const canChange = canChangeAssignment(trip);
  const tp = !!trip.is_third_party;
  const phone = tp ? trip.third_party_driver_phone : d?.phone_primary;
  const driverName = tp ? trip.third_party_driver_name || 'Third-party driver' : d ? niceName(`${d.first_name} ${d.last_name}`) : 'No driver assigned';
  const plate = tp ? trip.third_party_vehicle_plate || 'Subcontractor truck' : v?.plate_number || 'No truck assigned';
  const truckSub = tp
    ? ['Third-party', trip.third_party_vehicle_type].filter(Boolean).join(' · ')
    : [v?.capacity_kg ? `${Math.round(v.capacity_kg / 1000)} ton` : null, v?.asset_type, v?.trailer_number ? `Trailer ${v.trailer_number}` : null].filter(Boolean).join(' · ');
  const truckImg = resolveMediaUrl(v?.image_url);
  const unit = overview?.unit;
  const showFeeds = !tp && (phase === 'active' || phase === 'planned');

  const changeBtn = (w: 'driver' | 'truck') => canChange ? (
    <TouchableOpacity style={s.change} onPress={() => onChange(w)} hitSlop={6}>
      <Text style={s.changeText}>{(w === 'driver' ? d : v) ? 'Change' : 'Assign'}</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <Card style={{ padding: 0 }}>
      <TouchableOpacity activeOpacity={v && !tp ? 0.7 : 1} disabled={!v || tp} onPress={() => v && router.push({ pathname: '/vehicle-edit', params: { id: v.id } })} style={s.assignRow}>
        {truckImg ? <Image source={{ uri: truckImg }} style={s.truckImg} /> : (
          <View style={s.truckIcon}><Truck size={21} color={Colors.charcoal} strokeWidth={1.9} /></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.plate} numberOfLines={1}>{plate}</Text>
          <Text style={s.muted} numberOfLines={1}>{truckSub || '—'}</Text>
          {v && !tp && !showFeeds ? (
            <View style={s.gpsRow}>
              <View style={[s.feedDot, { backgroundColor: v.icces_device_id ? TONE.green.dot : '#C9CCD6' }]} />
              <Text style={s.muted}>{v.icces_device_id ? 'GPS tracker fitted' : 'No GPS tracker'}</Text>
            </View>
          ) : null}
        </View>
        {changeBtn('truck')}
      </TouchableOpacity>
      <Divider style={{ marginHorizontal: 14 }} />
      <TouchableOpacity activeOpacity={d && !tp ? 0.7 : 1} disabled={!d || tp} onPress={() => d && router.push({ pathname: '/driver-details', params: { id: d.id } })} style={s.assignRow}>
        <DriverAvatar initials={initialsOf(driverName)} avatarUrl={tp ? null : d?.avatar_url} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.driverName} numberOfLines={2}>{driverName}</Text>
          <Text style={s.muted} numberOfLines={1}>{[tp ? null : d?.ref_id, phone].filter(Boolean).join(' · ') || (d ? 'No phone' : '—')}</Text>
        </View>
        {changeBtn('driver')}
      </TouchableOpacity>
      {co && !tp ? (
        <View style={s.coRow}>
          <DriverAvatar initials={initialsOf(`${co.first_name} ${co.last_name}`)} avatarUrl={co.avatar_url} size={28} />
          <Text style={s.coText} numberOfLines={1}><Text style={s.muted}>Co-driver · </Text>{niceName(`${co.first_name} ${co.last_name}`)}</Text>
          {co.phone_primary ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${co.phone_primary}`).catch(() => {})} hitSlop={8} accessibilityLabel="Call co-driver">
              <Phone size={16} color="#146C3C" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {showFeeds ? (
        <View style={s.feeds}>
          <Feed icon={Truck} label="Tracker" fix={unit?.vehicle_gps} missing={unit?.vehicle?.has_tracker === false ? 'No tracker' : 'No fix'} />
          <Feed icon={Smartphone} label="Driver app" fix={unit?.driver_gps} missing={phase === 'planned' ? 'Off trip' : 'Not sending'} />
        </View>
      ) : null}
    </Card>
  );
}

// ── Money ─────────────────────────────────────────────────────────────────────

function MoneyCard({ trip, onCharges }: { trip: OperatorTripDetail; onCharges: () => void }) {
  const m = moneyOf(trip);
  const payout = m.driverPayout + m.coDriverPayout;
  const rate = m.billing - m.charges;
  const settled = m.balanceDue <= 0;
  const paid = Math.max(0, m.billing - Math.max(0, m.balanceDue));
  return (
    <Card style={{ gap: 0, paddingVertical: 6 }}>
      {/* What the customer is charged */}
      <Line label={m.isMonthly ? 'Trip rate (monthly contract, per day)' : 'Trip rate'} value={sar(rate)} />
      <Line label={m.chargesCount ? `Extra charges (${m.chargesCount})` : 'Extra charges'} value={m.charges ? `+ ${sar(m.charges)}` : sar(0)} muted={!m.charges} />
      <Line label="Customer pays" value={sar(m.billing)} strong border />

      {/* What it costs, and what's left */}
      <Line label={m.is3PL ? 'Subcontractor cost' : m.coDriverPayout ? 'Driver and co-driver pay' : 'Driver pay'} value={`− ${sar(payout)}`} />
      <Line
        label={`Margin · ${m.marginPercent.toFixed(0)}%`}
        value={sar(m.margin)}
        strong
        border
        color={m.margin >= 0 ? TONE.green.fg : TONE.red.fg}
      />

      {/* Has the customer paid? */}
      <View style={[s.pay, { backgroundColor: settled ? TONE.green.bg : '#FEF3F2' }]}>
        <Text style={[s.payText, { color: settled ? TONE.green.fg : TONE.red.fg }]}>
          {settled ? 'Paid in full' : paid > 0 ? `${sar(paid)} paid · ${sar(m.balanceDue)} still due` : `Not paid yet · ${sar(m.balanceDue)} due`}
        </Text>
      </View>

      <TouchableOpacity style={s.addCharge} onPress={onCharges} activeOpacity={0.8}>
        <Plus size={15} color={INK} strokeWidth={2.4} />
        <Text style={s.addChargeText}>{m.chargesCount ? 'Edit extra charges' : 'Add extra charge'}</Text>
      </TouchableOpacity>
    </Card>
  );
}

function Line({ label, value, strong, border, muted, color }: { label: string; value: string; strong?: boolean; border?: boolean; muted?: boolean; color?: string }) {
  return (
    <View style={[s.line, border && s.lineBorder]}>
      <Text style={[s.lineLabel, strong && s.lineStrong, color ? { color } : null]}>{label}</Text>
      <Text style={[s.lineValue, strong && s.lineStrongValue, muted && { color: MUTED, fontWeight: '500' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 12, color: MUTED },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 11 },
  sumBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  sumLabel: { fontSize: 14, color: MUTED },
  sumValue: { fontSize: 14, fontWeight: '600', color: INK, textAlign: 'right', flexShrink: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 9 },
  lineBorder: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0', paddingBottom: 12, marginBottom: 4 },
  lineLabel: { fontSize: 14, color: MUTED, flexShrink: 1 },
  lineValue: { fontSize: 14, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  lineStrong: { color: INK, fontWeight: '700', fontSize: 15 },
  lineStrongValue: { fontSize: 17, fontWeight: '700' },
  pay: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  payText: { fontSize: 13, fontWeight: '600' },
  group: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 8, marginBottom: -4, marginLeft: 4 },
  factRow: { flexDirection: 'row', gap: 8 },
  inlineLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineLinkText: { fontSize: 13, fontWeight: '700', color: '#B43A27' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  docActions: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  linkBtn: { flex: 1, height: 42, borderRadius: 12, backgroundColor: '#F4F4F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  linkBtnText: { fontSize: 14, fontWeight: '600', color: INK },
  docName: { fontSize: 14, fontWeight: '600', color: INK },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  checkDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontSize: 14, color: INK },
  journey: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F9', borderRadius: 14, padding: 12 },
  journeyTime: { fontSize: 13, fontWeight: '800', color: INK },
  journeyStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  journeyStatText: { fontSize: 12, fontWeight: '700' },
  journeyLine: { height: 3, borderRadius: 2, backgroundColor: TONE.green.dot, alignSelf: 'stretch' },
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, gap: 2 },
  tileLabel: { fontSize: 12 },
  tileValue: { fontSize: 14, fontWeight: '600' },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  truckImg: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF0F4' },
  truckIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF0F4', alignItems: 'center', justifyContent: 'center' },
  plate: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: INK },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  driverName: { fontSize: 15, fontWeight: '700', color: INK },
  change: { backgroundColor: '#F1F3F7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  changeText: { fontSize: 13, fontWeight: '600', color: INK },
  coRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F8F9FB' },
  coText: { flex: 1, fontSize: 13, fontWeight: '700', color: INK },
  feeds: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F8F9FB', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  feed: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedText: { fontSize: 12, color: MUTED },
  feedDot: { width: 7, height: 7, borderRadius: 4 },
  moneyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  billing: { fontSize: 26, fontWeight: '700', color: INK, letterSpacing: -0.5 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#EEF0F4' },
  partLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  partValue: { fontSize: 14, fontWeight: '600', color: INK, marginTop: 2 },
  addCharge: { marginTop: 10, marginBottom: 8, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addChargeText: { fontSize: 14, fontWeight: '600', color: INK },
});
