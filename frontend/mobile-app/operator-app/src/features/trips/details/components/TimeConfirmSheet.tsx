/**
 * Confirm or correct when an external-app screenshot really happened. The
 * driver's tap stamped "now" as a provisional time; the operator checks the
 * screenshot and fixes arrival / departure with real date and time pickers
 * (in the deployment's timezone), then confirms.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { zonedWallTimeToUtcIso } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { DatePickerModal, TimePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type OperatorTripDocument } from '../../../../lib/operator';
import type { Stop } from '../tripDetailsModel';
import { ACTION, INK, MUTED } from './parts';

interface Props {
  target: { doc: OperatorTripDocument; stop: Stop; stopLabel: string } | null;
  tripId: string;
  tz: string;
  onClose: () => void;
  onDone: () => void;
}

/** An ISO instant as the wall date (YYYY-MM-DD) and time (HH:mm) in `tz`. */
function wall(iso: string | null | undefined, tz: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
}

const toPicker = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const fromPicker = (d: string) => (d ? d.split('/').reverse().join('-') : '');

type Field = 'arrival' | 'departure';

export function TimeConfirmSheet({ target, tripId, tz, onClose, onDone }: Props) {
  const [values, setValues] = useState<Record<Field, { date: string; time: string }>>({ arrival: { date: '', time: '' }, departure: { date: '', time: '' } });
  const [picker, setPicker] = useState<{ field: Field; kind: 'date' | 'time' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [shownFor, setShownFor] = useState<Props['target']>(null);

  // Start from the recorded times each time the sheet opens for a screenshot.
  if (target !== shownFor) {
    setShownFor(target);
    if (target) setValues({ arrival: wall(target.stop.actual_arrival, tz), departure: wall(target.stop.actual_departure, tz) });
  }

  const set = (field: Field, patch: Partial<{ date: string; time: string }>) =>
    setValues((v) => ({ ...v, [field]: { ...v[field], ...patch } }));

  const confirm = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const body: { document_id: string; actual_arrival?: string; actual_departure?: string } = { document_id: target.doc.id };
      if (values.arrival.date && values.arrival.time) body.actual_arrival = zonedWallTimeToUtcIso(values.arrival.date, values.arrival.time, tz);
      if (values.departure.date && values.departure.time) body.actual_departure = zonedWallTimeToUtcIso(values.departure.date, values.departure.time, tz);
      await operatorService.confirmEvidenceTime(tripId, target.stop.id, body);
      onDone();
      onClose();
    } catch (e) {
      Alert.alert('Could not confirm the time', getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const shot = resolveMediaUrl(target?.doc.file_url);
  const current = picker ? values[picker.field] : null;

  return (
    <AppModal visible={!!target} onClose={onClose} type="bottom-sheet" title="Confirm screenshot time" maxHeight="92%">
      <View style={{ gap: 12 }}>
        {shot ? <Image source={{ uri: shot }} style={s.shot} resizeMode="contain" /> : null}
        <Text style={s.hint}>Check the time shown on the screenshot for {target?.stopLabel}. Change it if it’s wrong, then confirm.</Text>
        {(['arrival', 'departure'] as Field[]).map((field) => (
          <View key={field} style={{ gap: 6 }}>
            <Text style={s.label}>{field === 'arrival' ? 'Arrived' : 'Left'}</Text>
            <View style={s.row}>
              <TouchableOpacity style={s.tile} onPress={() => setPicker({ field, kind: 'date' })}>
                <Text style={s.tileCap}>Date</Text>
                <Text style={[s.tileVal, !values[field].date && s.placeholder]}>{values[field].date ? toPicker(values[field].date) : 'Not set'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.tile} onPress={() => setPicker({ field, kind: 'time' })}>
                <Text style={s.tileCap}>Time</Text>
                <Text style={[s.tileVal, !values[field].time && s.placeholder]}>{values[field].time || 'Not set'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity style={[s.btn, saving && { opacity: 0.7 }]} onPress={confirm} disabled={saving}>
          <Text style={s.btnText}>{saving ? 'Saving…' : 'Confirm time'}</Text>
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={picker?.kind === 'date'}
        onClose={() => setPicker(null)}
        selectedDate={toPicker(current?.date || wall(new Date().toISOString(), tz).date)}
        onSelectDate={(d) => { if (picker) set(picker.field, { date: fromPicker(d) }); setPicker(null); }}
      />
      <TimePickerModal
        visible={picker?.kind === 'time'}
        onClose={() => setPicker(null)}
        selectedTime={current?.time || '08:00'}
        onSelectTime={(t) => { if (picker) set(picker.field, { time: t }); setPicker(null); }}
      />
    </AppModal>
  );
}

const s = StyleSheet.create({
  shot: { width: '100%', height: 220, borderRadius: 14, backgroundColor: '#F1F3F7' },
  hint: { fontSize: 13, color: MUTED, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '800', color: '#3B3B44' },
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#F5F6F9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  tileCap: { fontSize: 11, color: MUTED },
  tileVal: { fontSize: 16, fontWeight: '800', color: INK, marginTop: 1 },
  placeholder: { color: '#9898A4', fontWeight: '500' },
  btn: { height: 50, borderRadius: 14, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
