/**
 * A trip's route and how far along it is, one segment per step (TestFlight:
 * "4 broken lines if it's a round trip with 4 steps, 2 if single; completed
 * steps green"). A loading stop's step is done when the truck left it; an
 * offloading stop's when the truck reached it — so Khamis › Muhayil › Khamis
 * reads: left Khamis, reached Muhayil, left Muhayil, back at Khamis.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { niceName } from '@/features/trips/create/components/ui';

export interface StepStop {
  type: string | null;
  name: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

const isPickup = (t: string | null) => /pick|load/i.test(t ?? '');

export function tripSteps(stops: StepStop[]): { label: string; done: boolean }[] {
  return stops.map((st, i) => {
    const name = niceName(st.name) || `stop ${i + 1}`;
    return isPickup(st.type)
      ? { label: `Leave ${name}`, done: !!st.actual_departure }
      : { label: `Reach ${name}`, done: !!st.actual_arrival };
  });
}

/** "Khamis › Muhayil › Khamis" — the same place twice in a row (offload then load) shows once. */
export function routeLine(stops: StepStop[]): string {
  const names = stops.map((st) => niceName(st.name)).filter(Boolean);
  return names.filter((n, i) => n !== names[i - 1]).join(' › ');
}

export function TripStepBar({ stops, late, showRoute = true, caption = true }: { stops: StepStop[]; late?: boolean; showRoute?: boolean; caption?: boolean }) {
  const steps = tripSteps(stops);
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  return (
    <View style={{ gap: 5 }}>
      {showRoute ? <Text style={s.route} numberOfLines={1}>{routeLine(stops)}</Text> : null}
      <View style={s.bar} accessibilityLabel={`${done} of ${steps.length} steps done`}>
        {steps.map((st, i) => (
          <View key={i} style={[s.seg, st.done ? s.done : i === current ? (late ? s.nowLate : s.now) : null]} />
        ))}
      </View>
      {caption ? (
        <Text style={s.caption} numberOfLines={1}>
          {current === -1 ? `All ${steps.length} steps done` : `${done}/${steps.length} · next: ${steps[current].label}`}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  route: { fontSize: 13, fontWeight: '700', color: '#3E3C3D' },
  bar: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E9E9EC' },
  done: { backgroundColor: '#16A34A' },
  now: { backgroundColor: '#BFD3FB' },
  nowLate: { backgroundColor: '#FBC4BE' },
  caption: { fontSize: 11.5, color: '#71717A' },
});
