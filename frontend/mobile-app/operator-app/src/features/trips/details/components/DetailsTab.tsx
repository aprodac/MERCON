/**
 * The rest of the trip: what to fix before it starts (or how it went), truck
 * and driver, money, the key facts, and paperwork.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Check, ChevronRight, FileText, ListOrdered, MessageCircle, Phone, Plus, Receipt, Smartphone, Timer, Route, Truck, UploadCloud, X,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { DriverAvatar } from '../../../drivers/components/DriverAvatar';
import { initialsOf, niceName } from '../../create/components/ui';
import type { LiveGpsFix, OperatorTripDetail, OperatorTripDocument, TripOverview, TripPhase } from '../../../../lib/operator';
import {
  ON_TIME_GRACE_MIN, TONE, ago, billingLabel, canChangeAssignment, digits, formatDuration, lineType, minutesLate, moneyOf, sar, sortedStops,
  type Formatters,
} from '../tripDetailsModel';
import { Card, Chip, Divider, Fact, INK, MUTED, SectionHead, SoftButton, WA_INK, WA_LIGHT } from './parts';

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
  return (
    <View style={{ gap: 10 }}>
      {phase === 'planned' && overview?.checks ? <PreTripChecks checks={overview.checks} f={f} /> : null}
      {phase === 'done' ? <TripSummary trip={trip} overview={overview} f={f} /> : null}
      <Assignment trip={trip} phase={phase} overview={overview} onChange={onChange} />
      <MoneyCard trip={trip} onCharges={onCharges} />
      <Card style={{ gap: 8 }}>
        <View style={s.factRow}>
          <Fact label="Scheduled" value={trip.planned_start ? f.dayTime(trip.planned_start) : '—'} />
          <Fact label="Line type" value={lineType(trip)} />
        </View>
        <View style={s.factRow}>
          <Fact label="Billing" value={billingLabel(trip)} />
          {trip.awb_number ? <Fact label="AWB" value={trip.awb_number} mono /> : <Fact label="Created" value={f.date(trip.createdAt) || '—'} />}
        </View>
        {trip.planned_distance ? (
          <View style={s.factRow}>
            <Fact label="Planned distance" value={`${Math.round(trip.planned_distance)} km`} />
            <Fact label="Quotation" value={trip.quotation?.name || trip.rateCard?.name || '—'} />
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHead
          title={`Documents · ${paperwork.length}`}
          right={(
            <TouchableOpacity onPress={onUpload} hitSlop={8} style={s.inlineLink}>
              <UploadCloud size={14} color="#B43A27" />
              <Text style={s.inlineLinkText}>Upload</Text>
            </TouchableOpacity>
          )}
        />
        {paperwork.length === 0 ? <Text style={s.muted}>No paperwork yet. Driver photos are on the Updates tab.</Text> : (
          <View style={{ gap: 6 }}>
            {paperwork.map((d) => (
              <TouchableOpacity key={d.id} style={s.doc} activeOpacity={0.75} onPress={() => onOpenDoc(d)}>
                <FileText size={18} color={MUTED} />
                <View style={{ flex: 1 }}>
                  <Text style={s.docName} numberOfLines={1}>{d.documentType?.name || d.title || d.doc_type || 'Document'}</Text>
                  <Text style={s.muted}>{f.date(d.createdAt)}</Text>
                </View>
                <ChevronRight size={16} color="#8A8A96" />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <SoftButton label="Activity log" icon={ListOrdered} onPress={onActivity} style={{ marginTop: 10 }} />
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

// ── How it went ───────────────────────────────────────────────────────────────

function TripSummary({ trip, overview, f }: { trip: OperatorTripDetail; overview: TripOverview | null; f: Formatters }) {
  const stops = sortedStops(trip);
  const judged = stops.map((st) => minutesLate(st.planned_arrival, st.actual_arrival)).filter((m): m is number => m != null);
  const onTime = judged.filter((m) => m <= ON_TIME_GRACE_MIN).length;
  const allOnTime = judged.length > 0 && onTime === judged.length;
  const durationSec = trip.actual_start && trip.actual_end ? (new Date(trip.actual_end).getTime() - new Date(trip.actual_start).getTime()) / 1000 : null;
  const km = overview?.path_distance_m ? `${Math.round(overview.path_distance_m / 1000)} km` : 'no GPS';
  const invoiced = trip.status === 'Invoiced';
  const punctual = judged.length === 0 ? TONE.gray : allOnTime ? TONE.green : TONE.red;
  const inv = invoiced ? TONE.green : TONE.gray;

  return (
    <Card style={{ gap: 10 }}>
      <SectionHead title="How it went" />
      <View style={s.journey}>
        <View>
          <Text style={s.muted}>Started</Text>
          <Text style={s.journeyTime}>{trip.actual_start ? f.dateTime(trip.actual_start) : '—'}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <View style={s.journeyStat}><Timer size={12} color="#2449A8" /><Text style={[s.journeyStatText, { color: '#2449A8' }]}>{durationSec && durationSec > 0 ? formatDuration(durationSec) : '—'}</Text></View>
          <View style={s.journeyLine} />
          <View style={s.journeyStat}><Route size={12} color="#5B34B0" /><Text style={[s.journeyStatText, { color: '#5B34B0' }]}>{km}</Text></View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.muted}>Finished</Text>
          <Text style={s.journeyTime}>{trip.actual_end ? f.dateTime(trip.actual_end) : '—'}</Text>
        </View>
      </View>
      <View style={s.factRow}>
        <View style={[s.tile, { backgroundColor: punctual.bg }]}>
          <Text style={[s.tileLabel, { color: punctual.fg }]}>On time</Text>
          <Text style={[s.tileValue, { color: punctual.fg }]}>{judged.length ? `${onTime} of ${judged.length} stops` : 'No planned times'}</Text>
        </View>
        <View style={[s.tile, { backgroundColor: inv.bg }]}>
          <Receipt size={14} color={inv.fg} />
          <Text style={[s.tileValue, { color: inv.fg }]}>{invoiced ? 'Invoiced' : 'Not invoiced yet'}</Text>
        </View>
      </View>
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
          {v && !tp ? (
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
      {phone ? (
        <View style={s.contactRow}>
          <SoftButton label="Call" icon={Phone} bg="#E8F5EE" fg="#146C3C" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} />
          <SoftButton label="WhatsApp" icon={MessageCircle} bg={WA_LIGHT} fg={WA_INK} style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${digits(phone)}`).catch(() => {})} />
        </View>
      ) : null}
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
  const total = Math.max(payout + m.charges + Math.max(m.margin, 0), 1);
  const settled = m.balanceDue <= 0;
  const parts = [
    { key: 'payout', label: m.is3PL ? 'Subcontract' : 'Driver payout', value: payout, color: '#7651D6' },
    { key: 'charges', label: `Charges${m.chargesCount ? ` (${m.chargesCount})` : ''}`, value: m.charges, color: '#F0B429' },
    { key: 'margin', label: 'Margin', value: m.margin, color: TONE.green.dot },
  ];
  return (
    <Card style={{ gap: 12 }}>
      <View style={s.moneyTop}>
        <View>
          <Text style={s.muted}>{m.isMonthly ? 'Billing · monthly contract (per day)' : 'Billing'}</Text>
          <Text style={s.billing}>{sar(m.billing)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Chip label={`${m.marginPercent.toFixed(1)}% margin`} tone={m.margin >= 0 ? 'green' : 'red'} />
          <Chip label={settled ? 'Paid in full' : `${sar(m.balanceDue)} due`} tone={settled ? 'green' : 'red'} />
        </View>
      </View>
      <View style={s.bar}>
        {parts.map((pt) => pt.value > 0 ? <View key={pt.key} style={{ width: `${(pt.value / total) * 100}%`, backgroundColor: pt.color }} /> : null)}
      </View>
      <View style={s.factRow}>
        {parts.map((pt) => (
          <View key={pt.key} style={{ flex: 1, minWidth: 0 }}>
            <View style={s.partLabel}>
              <View style={[s.feedDot, { backgroundColor: pt.color }]} />
              <Text style={s.muted} numberOfLines={1}>{pt.label}</Text>
            </View>
            <Text style={[s.partValue, pt.key === 'margin' && pt.value < 0 && { color: TONE.red.fg }]} numberOfLines={1}>{sar(pt.value)}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={s.addCharge} onPress={onCharges} activeOpacity={0.8}>
        <Plus size={15} color="#7A4F00" strokeWidth={2.5} />
        <Text style={s.addChargeText}>{m.chargesCount ? 'Edit charges' : 'Add charge'}</Text>
      </TouchableOpacity>
    </Card>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 12, color: MUTED },
  factRow: { flexDirection: 'row', gap: 8 },
  inlineLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineLinkText: { fontSize: 13, fontWeight: '700', color: '#B43A27' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F7F8FA', borderRadius: 12 },
  docName: { fontSize: 13, fontWeight: '700', color: INK },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  checkDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontSize: 14, color: INK },
  journey: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F9', borderRadius: 14, padding: 12 },
  journeyTime: { fontSize: 13, fontWeight: '800', color: INK },
  journeyStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  journeyStatText: { fontSize: 12, fontWeight: '700' },
  journeyLine: { height: 3, borderRadius: 2, backgroundColor: TONE.green.dot, alignSelf: 'stretch' },
  tile: { flex: 1, borderRadius: 14, padding: 12, gap: 2 },
  tileLabel: { fontSize: 12, fontWeight: '500' },
  tileValue: { fontSize: 14, fontWeight: '800' },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  truckImg: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF0F4' },
  truckIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF0F4', alignItems: 'center', justifyContent: 'center' },
  plate: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: INK },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  driverName: { fontSize: 15, fontWeight: '800', color: INK },
  change: { backgroundColor: '#F1F3F7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  changeText: { fontSize: 12, fontWeight: '800', color: INK },
  contactRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  coRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F8F9FB' },
  coText: { flex: 1, fontSize: 13, fontWeight: '700', color: INK },
  feeds: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F8F9FB', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  feed: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedText: { fontSize: 12, color: MUTED },
  feedDot: { width: 7, height: 7, borderRadius: 4 },
  moneyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  billing: { fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#EEF0F4' },
  partLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  partValue: { fontSize: 14, fontWeight: '800', color: INK, marginTop: 1 },
  addCharge: { height: 44, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D9A21B', backgroundColor: '#FFF8E6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addChargeText: { fontSize: 13, fontWeight: '800', color: '#7A4F00' },
});
