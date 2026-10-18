/**
 * "Send to workshop" (TestFlight: "how to mark the vehicle as gone for
 * maintenance"): which workshop, what kind of work, a note. Saving opens a
 * service order, so the truck shows "In maintenance" and leaves the free list
 * until "Back in service".
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { INK, MUTED } from '../../trips/details/components/parts';
import { niceName } from '../../trips/create/components/ui';
import { vehicleDetailApi } from './vehicleDetailApi';

const TYPES = [
  { value: 'Repair', label: 'Repair' },
  { value: 'Routine', label: 'Service' },
  { value: 'Inspection', label: 'Inspection' },
  { value: 'Emergency', label: 'Breakdown' },
] as const;

export function WorkshopSheet({ visible, vehicleId, plate, odometer, onClose, onDone }: {
  visible: boolean;
  vehicleId: string;
  plate: string;
  odometer: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [workshop, setWorkshop] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('Repair');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: workshops = [] } = useQuery({ queryKey: ['maintenance', 'workshops'], queryFn: vehicleDetailApi.workshops, enabled: visible, staleTime: 300_000 });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await vehicleDetailApi.sendToWorkshop(vehicleId, { workshop_name: workshop.trim(), maintenance_type: type, remarks: note.trim(), odometer });
      setWorkshop(''); setNote(''); setType('Repair');
      onDone(`${plate} is in the workshop.`);
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={`Send ${plate} to workshop`} maxHeight="90%">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>The truck shows “In maintenance” and can’t be picked for trips until you mark it back in service.</Text>

        <Text style={s.cap}>Workshop</Text>
        <TextInput value={workshop} onChangeText={setWorkshop} placeholder="Workshop name" placeholderTextColor="#A1A1AA" style={s.input} />
        {workshops.length ? (
          <View style={s.chips}>
            {workshops.slice(0, 6).map((w) => (
              <TouchableOpacity key={w.name} style={[s.chip, workshop === w.name && s.chipOn]} onPress={() => setWorkshop(w.name)}>
                <Text style={[s.chipText, workshop === w.name && s.chipTextOn]} numberOfLines={1}>{niceName(w.name)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={[s.cap, { marginTop: 14 }]}>What for</Text>
        <View style={s.seg}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.value} style={[s.segBtn, type === t.value && s.segOn]} onPress={() => setType(t.value)} accessibilityRole="radio" accessibilityState={{ selected: type === t.value }}>
              <Text style={[s.segText, type === t.value && s.segTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.cap, { marginTop: 14 }]}>Note (optional)</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="e.g. brake noise, AC not cooling" placeholderTextColor="#A1A1AA" style={[s.input, { minHeight: 64 }]} multiline />

        {error ? <Text style={s.error}>{error}</Text> : null}
        <TouchableOpacity style={[s.btn, (!workshop.trim() || saving) && { opacity: 0.5 }]} disabled={!workshop.trim() || saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send to workshop</Text>}
        </TouchableOpacity>
      </ScrollView>
    </AppModal>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 13, color: MUTED, marginBottom: 12, lineHeight: 18 },
  cap: { fontSize: 12, fontWeight: '800', color: MUTED, textTransform: 'uppercase', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: INK },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, maxWidth: '100%' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextOn: { color: '#fff' },
  seg: { flexDirection: 'row', backgroundColor: '#F1F1F3', borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: '#fff' },
  segText: { fontSize: 13, fontWeight: '700', color: MUTED },
  segTextOn: { color: INK },
  error: { color: '#B42318', fontSize: 13, marginTop: 10 },
  btn: { height: 50, borderRadius: 14, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
