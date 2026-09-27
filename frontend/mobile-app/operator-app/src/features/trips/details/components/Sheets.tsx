/** The trip's secondary sheets: More actions, Upload, Activity log, Additional charges. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import {
  Camera, CirclePlus, FileText, ListOrdered, Package, ShieldAlert, Trash2, Truck, UserRound, XCircle, type LucideIcon,
} from 'lucide-react-native';
import { SUGGESTED_CHARGE_TYPES, SUGGESTED_UNIT_BY_CHARGE_TYPE } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorTripCharge, type OperatorTripDetail, type TripDocKind } from '../../../../lib/operator';
import { TONE, activitySteps, canCancel, canChangeAssignment, sar, type Formatters } from '../tripDetailsModel';
import { ACTION, Divider, INK, MUTED, SheetRow } from './parts';

// ── More ──────────────────────────────────────────────────────────────────────

export function MoreSheet({
  visible, trip, onClose, onChange, onCharges, onUpload, onActivity, onCancel,
}: {
  visible: boolean;
  trip: OperatorTripDetail;
  onClose: () => void;
  onChange: (w: 'driver' | 'truck') => void;
  onCharges: () => void;
  onUpload: () => void;
  onActivity: () => void;
  onCancel: () => void;
}) {
  const go = (fn: () => void) => () => { onClose(); setTimeout(fn, 250); };
  const change = canChangeAssignment(trip);
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={trip.ref_id ?? 'Trip'}>
      <View>
        {change ? (
          <>
            <SheetRow icon={UserRound} tint={TONE.blue.bg} fg={TONE.blue.fg} label={trip.driver ? 'Change driver' : 'Assign driver'} sub="Pick from available drivers" onPress={go(() => onChange('driver'))} />
            <SheetRow icon={Truck} tint="#EEF0F4" fg={INK} label={trip.vehicle ? 'Change truck' : 'Assign truck'} sub="Pick from available trucks" onPress={go(() => onChange('truck'))} />
          </>
        ) : null}
        <SheetRow icon={CirclePlus} tint="#FFF3D6" fg="#7A4F00" label="Additional charges" sub="Waiting, labour, extra stops…" onPress={go(onCharges)} />
        <SheetRow icon={Camera} tint={TONE.green.bg} fg={TONE.green.fg} label="Upload photo or document" sub="POD, cargo, delay evidence, paperwork" onPress={go(onUpload)} />
        <SheetRow icon={ListOrdered} tint={TONE.violet.bg} fg={TONE.violet.fg} label="Activity log" sub="Everything that happened, in order" onPress={go(onActivity)} />
        {canCancel(trip) ? (
          <>
            <Divider style={{ marginVertical: 6 }} />
            <SheetRow icon={XCircle} tint={TONE.red.bg} fg="#B42318" label="Cancel trip" sub="Frees the driver and truck" danger onPress={go(onCancel)} />
          </>
        ) : null}
      </View>
    </AppModal>
  );
}

// ── Upload ────────────────────────────────────────────────────────────────────

const UPLOAD_KINDS: { kind: TripDocKind; label: string; sub: string; icon: LucideIcon; tint: string; fg: string }[] = [
  { kind: 'POD', label: 'Proof of delivery', sub: 'Signed note, delivered cargo', icon: Package, tint: TONE.green.bg, fg: TONE.green.fg },
  { kind: 'Waybill', label: 'Cargo / waybill', sub: 'Loaded cargo, waybill', icon: Truck, tint: TONE.blue.bg, fg: TONE.blue.fg },
  { kind: 'Emergency', label: 'Delay or incident', sub: 'Photo or video of the problem', icon: ShieldAlert, tint: TONE.red.bg, fg: TONE.red.fg },
  { kind: 'CustomsClearance', label: 'Customs paperwork', sub: 'Declarations, clearance', icon: FileText, tint: '#F1F3F7', fg: INK },
];

export function UploadSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (kind: TripDocKind) => void }) {
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="What are you uploading?">
      <View>
        {UPLOAD_KINDS.map((k) => (
          <SheetRow key={k.kind} icon={k.icon} tint={k.tint} fg={k.fg} label={k.label} sub={k.sub} onPress={() => { onClose(); setTimeout(() => onPick(k.kind), 300); }} />
        ))}
      </View>
    </AppModal>
  );
}

// ── Activity log ──────────────────────────────────────────────────────────────

export function ActivitySheet({ visible, trip, f, onClose }: { visible: boolean; trip: OperatorTripDetail; f: Formatters; onClose: () => void }) {
  const steps = activitySteps(trip, f);
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Activity log" maxHeight="85%">
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        {steps.map((st, i) => (
          <View key={i} style={s.stepRow}>
            <View style={{ alignItems: 'center', width: 14 }}>
              <View style={[s.stepDot, { backgroundColor: st.tone ? TONE[st.tone].dot : st.done ? TONE.green.dot : '#C9CCD6' }]} />
              {i < steps.length - 1 ? <View style={s.stepLine} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <Text style={[s.stepLabel, !st.done && { color: MUTED, fontWeight: '500' }]}>{st.label}</Text>
              {st.time ? <Text style={s.stepTime}>{st.time}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </AppModal>
  );
}

// ── Additional charges ────────────────────────────────────────────────────────

interface Line { key: string; surchargeRuleId?: string | null; charge_type: string; unit: string | null; rate: string; quantity: string }

const toLines = (charges: OperatorTripCharge[] | undefined): Line[] =>
  (charges ?? []).map((c, i) => ({
    key: c.id ?? `c${i}`,
    surchargeRuleId: c.surchargeRuleId ?? null,
    charge_type: c.charge_type,
    unit: c.unit,
    rate: String(Number(c.rate) || 0),
    quantity: String(Number(c.quantity) || 1),
  }));

const amountOf = (l: Line) => (parseFloat(l.rate) || 0) * (parseFloat(l.quantity) || 0);

export function ChargesSheet({ visible, trip, onClose, onSaved }: { visible: boolean; trip: OperatorTripDetail; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);

  // Start from the trip's saved charges every time the sheet opens.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setLines(toLines(trip.charges));
  }

  const add = (type: string) =>
    setLines((ls) => [...ls, { key: `n${Date.now()}`, charge_type: type, unit: (SUGGESTED_UNIT_BY_CHARGE_TYPE as Record<string, string>)[type] ?? null, rate: '', quantity: '1' }]);
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const total = lines.reduce((sum, l) => sum + amountOf(l), 0);

  const save = async () => {
    const bad = lines.find((l) => !l.charge_type.trim() || !(parseFloat(l.rate) > 0) || !(parseFloat(l.quantity) > 0));
    if (bad) {
      Alert.alert('Check the charges', 'Each charge needs a name, a rate and a quantity above zero.');
      return;
    }
    setSaving(true);
    try {
      await operatorService.updateTripCharges(trip.id, lines.map((l) => ({
        surchargeRuleId: l.surchargeRuleId,
        charge_type: l.charge_type.trim(),
        unit: l.unit,
        rate: parseFloat(l.rate),
        quantity: parseFloat(l.quantity),
        amount: amountOf(l),
      })));
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save charges', getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Additional charges" maxHeight="92%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
        {lines.length === 0 ? <Text style={s.muted}>No extra charges on this trip. Add one below.</Text> : null}
        {lines.map((l) => (
          <View key={l.key} style={s.line}>
            <View style={s.lineTop}>
              <TextInput style={[s.input, { flex: 1 }]} value={l.charge_type} onChangeText={(v) => update(l.key, { charge_type: v })} placeholder="Charge" placeholderTextColor="#9898A4" />
              <TouchableOpacity onPress={() => remove(l.key)} hitSlop={8} accessibilityLabel="Remove charge" style={s.remove}>
                <Trash2 size={17} color="#B42318" />
              </TouchableOpacity>
            </View>
            <View style={s.lineTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.cap}>Rate (SAR){l.unit ? ` · ${l.unit}` : ''}</Text>
                <TextInput style={s.input} value={l.rate} onChangeText={(v) => update(l.key, { rate: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9898A4" />
              </View>
              <View style={{ width: 90 }}>
                <Text style={s.cap}>Qty</Text>
                <TextInput style={s.input} value={l.quantity} onChangeText={(v) => update(l.key, { quantity: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
              </View>
              <View style={{ width: 96, alignItems: 'flex-end' }}>
                <Text style={s.cap}>Amount</Text>
                <Text style={s.amount}>{sar(amountOf(l))}</Text>
              </View>
            </View>
          </View>
        ))}

        <Text style={s.label}>Add</Text>
        <View style={s.suggest}>
          {SUGGESTED_CHARGE_TYPES.map((t) => (
            <TouchableOpacity key={t} style={s.suggestChip} onPress={() => add(t)}>
              <Text style={s.suggestText}>+ {t}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.suggestChip} onPress={() => add('')}>
            <Text style={s.suggestText}>+ Other</Text>
          </TouchableOpacity>
        </View>

        <View style={s.totalRow}>
          <Text style={s.label}>Total charges</Text>
          <Text style={s.total}>{sar(total)}</Text>
        </View>
        <TouchableOpacity style={[s.btn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          <Text style={s.btnText}>{saving ? 'Saving…' : 'Save charges'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </AppModal>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 13, color: MUTED },
  label: { fontSize: 12, fontWeight: '800', color: '#3B3B44' },
  cap: { fontSize: 11, color: MUTED, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stepLine: { flex: 1, width: 1.5, backgroundColor: '#E4E7EE', marginTop: 3 },
  stepLabel: { fontSize: 14, fontWeight: '700', color: INK },
  stepTime: { fontSize: 12, color: MUTED, marginTop: 1 },
  line: { backgroundColor: '#F7F8FA', borderRadius: 14, padding: 10, gap: 8 },
  lineTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { height: 42, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 10, fontSize: 14, color: INK, borderWidth: 1, borderColor: '#E4E7EE' },
  remove: { width: 42, height: 42, borderRadius: 10, backgroundColor: TONE.red.bg, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: 14, fontWeight: '800', color: INK, height: 42, textAlignVertical: 'center', lineHeight: 42 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestChip: { borderRadius: 999, borderWidth: 1.5, borderColor: '#E4C77A', backgroundColor: '#FFF8E6', paddingHorizontal: 11, paddingVertical: 7 },
  suggestText: { fontSize: 12, fontWeight: '700', color: '#7A4F00' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  total: { fontSize: 18, fontWeight: '800', color: INK },
  btn: { height: 50, borderRadius: 14, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
