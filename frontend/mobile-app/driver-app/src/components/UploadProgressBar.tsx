/**
 * Thin bar under the Loading / Delivery photo boxes: fills as photos 1–3
 * (or the one screenshot on external-app trips)
 * upload ("Uploading photo 2 of 3 · 47%"), green with "All 3 photos uploaded"
 * when done, red when one failed (it is retried on the Complete button).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

export interface UploadItem {
  /** 0..1 */
  progress: number;
  done: boolean;
  failed: boolean;
}

interface Props {
  items: UploadItem[];
  total?: number;
  /** Bar colour while uploading (the screen's own accent). */
  accent: string;
}

export function UploadProgressBar({ items, total = 3, accent }: Props) {
  const { language } = useLanguage();
  if (items.length === 0) return null;

  const ur = language === 'ur';
  const uploaded = items.filter((i) => i.done).length;
  const failedIdx = items.findIndex((i) => i.failed);
  const activeIdx = items.findIndex((i) => !i.done && !i.failed);
  const allDone = items.length >= total && uploaded >= total;
  const pct = Math.round((items.reduce((a, i) => a + (i.done ? 1 : i.progress), 0) / total) * 100);

  let label: string;
  if (total === 1) {
    // External-app trips: a single screenshot.
    if (allDone) label = ur ? 'اپ لوڈ ہو گئی' : 'Uploaded';
    else if (failedIdx >= 0) label = ur ? 'اپ لوڈ نہیں ہوئی — دوبارہ کوشش ہوگی' : "Didn't upload — will retry";
    else label = ur ? 'اپ لوڈ ہو رہی ہے' : 'Uploading';
  } else if (allDone) label = ur ? `تمام ${total} تصاویر اپ لوڈ ہو گئیں` : `All ${total} photos uploaded`;
  else if (failedIdx >= 0) label = ur ? `تصویر ${failedIdx + 1} اپ لوڈ نہیں ہوئی — دوبارہ کوشش ہوگی` : `Photo ${failedIdx + 1} didn't upload — will retry`;
  else if (activeIdx >= 0) label = ur ? `تصویر ${activeIdx + 1} از ${total} اپ لوڈ ہو رہی ہے` : `Uploading photo ${activeIdx + 1} of ${total}`;
  else label = ur ? `${uploaded} از ${total} اپ لوڈ · ${total - items.length} مزید لیں` : `${uploaded} of ${total} uploaded · take ${total - items.length} more`;

  const color = allDone ? '#16A34A' : failedIdx >= 0 ? '#DC2626' : accent;
  const textColor = allDone ? '#15803D' : failedIdx >= 0 ? '#B91C1C' : '#334155';

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={styles.row}>
        <View style={styles.labelRow}>
          {allDone ? <Check size={15} color={textColor} strokeWidth={3} /> : null}
          {failedIdx >= 0 && !allDone ? <AlertCircle size={15} color={textColor} strokeWidth={2.4} /> : null}
          <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  label: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  pct: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  track: { height: 8, borderRadius: 8, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 8 },
});
