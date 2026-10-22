/**
 * Pick a transit time (pickup → drop-off) on hour and minute wheels, to the
 * 5 minutes. The old list went in 30-minute steps, and typing "8" in its search
 * found 10 h, 20 h … (TestFlight 20 Oct: "TT edit — there are also 8:15 like hours").
 * Used by Create trip (drop-off and the way back) and Edit trip.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { Wheel, wheelSheetStyles as styles, type WheelItem } from './WhenSheet';
import { tap } from './ui';

const MINUTE_STEP = 5;
const MAX_HOURS = 72;
const HOURS: WheelItem[] = Array.from({ length: MAX_HOURS + 1 }, (_, h) => ({ key: `h${h}`, label: `${h} h` }));
const MINUTES: WheelItem[] = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({ key: `m${i}`, label: `${String(i * MINUTE_STEP).padStart(2, '0')} m` }));
const QUICK = [4, 6, 8, 10, 12, 16, 24];

/** "8 h 15 m" for a transit time in minutes. */
export const transitText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} m`;
};

export function TransitSheet({ visible, title = 'Transit time', value, arrivalText, onDone, onClose }: {
  visible: boolean;
  title?: string;
  /** Current transit time in minutes, if any. */
  value: number | null;
  /** "Drop-off Tue 21 Oct · 12:15" for a candidate length — shown live under the value. */
  arrivalText: (min: number) => string;
  onDone: (min: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(8 * 60);
  // Start from the trip's transit time each time the sheet opens.
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setDraft(value && value > 0 ? Math.min(MAX_HOURS * 60, Math.round(value / MINUTE_STEP) * MINUTE_STEP) : 8 * 60);
  }
  const h = Math.floor(draft / 60);
  const m = draft % 60;

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={title} maxHeight="90%">
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{transitText(draft)}</Text>
        <Text style={styles.summarySub}>{arrivalText(draft)}</Text>
      </View>
      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <TouchableOpacity key={q} onPress={() => (tap(), setDraft(q * 60))} style={styles.quick} activeOpacity={0.7}>
            <Text style={styles.quickText}>{`${q} h`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.wheels}>
        <View pointerEvents="none" style={styles.band} />
        <Wheel items={HOURS} index={h} onChange={(i) => setDraft(i * 60 + m)} />
        <Wheel items={MINUTES} index={m / MINUTE_STEP} onChange={(i) => setDraft(h * 60 + i * MINUTE_STEP)} />
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.done, draft <= 0 && { opacity: 0.4 }]}
          disabled={draft <= 0}
          onPress={() => { tap(); onDone(draft); }}
          activeOpacity={0.8}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}
