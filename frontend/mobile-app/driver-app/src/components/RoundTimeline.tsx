/**
 * One round of a round trip as a list of steps with times ("Loading done ·
 * 09:40"), plus its total time. Used on the Round 1 completed page and the
 * trip summary.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle, Clock, Coffee } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { Colors, Radius, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';
import { formatClock, formatMinutes, type RoundSummary } from '../services/roundTimes';

/**
 * "14:05 → 15:30", kept left-to-right inside Urdu text (Unicode isolate) —
 * it showed backwards ("15:30 → 14:05") on Urdu phones.
 */
function timeRange(start: string | null, end: string | null): string {
  return `\u2066${formatClock(start)} → ${formatClock(end)}\u2069`;
}

export function RoundTimeline({
  title,
  round,
  accent = Colors.success,
  showSteps = true,
}: {
  title: string;
  round: RoundSummary;
  accent?: string;
  showSteps?: boolean;
}) {
  const { t, language } = useLanguage();
  const ur = language === 'ur';
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.totalPill, { borderColor: accent }]}>
          <Clock size={13} color={accent} strokeWidth={2.4} />
          <Text style={[styles.totalText, { color: accent }]}>{formatMinutes(round.minutes, ur)}</Text>
        </View>
      </View>
      <Text style={styles.range}>
        {timeRange(round.start, round.end)}
      </Text>
      {showSteps
        ? round.steps.map((s, i) => (
            <View key={s.key} style={[styles.step, i === round.steps.length - 1 && styles.stepLast]}>
              {s.at ? (
                <CheckCircle2 size={16} color={accent} strokeWidth={2.4} />
              ) : (
                <Circle size={16} color={Colors.gray300} strokeWidth={2} />
              )}
              <View style={styles.stepText}>
                <Text style={styles.stepLabel} numberOfLines={1}>
                  {t(s.labelKey, s.label)}
                  {s.place ? <Text style={styles.stepPlace}> · {s.place}</Text> : null}
                </Text>
              </View>
              <Text style={[styles.stepTime, !s.at && styles.stepTimeMissing]}>{formatClock(s.at)}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

/** The rest between round 1 and round 2 ("Break · 14:05 → 15:30 · 1 h 25 min"). */
export function RoundBreakRow({ start, end, minutes }: { start: string | null; end: string | null; minutes: number | null }) {
  const { t, language } = useLanguage();
  return (
    <View style={styles.breakRow}>
      <Coffee size={18} color={Colors.warning} strokeWidth={2.4} />
      <View style={styles.stepText}>
        <Text style={styles.title}>{t('label_break', 'Break')}</Text>
        <Text style={styles.range}>
          {timeRange(start, end)}
        </Text>
      </View>
      <Text style={styles.breakValue}>{formatMinutes(minutes, language === 'ur')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  breakValue: { ...Typography.bodySmall, fontWeight: '800', color: Colors.gray900, writingDirection: 'ltr' },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Typography.bodyMedium, fontWeight: '800', color: Colors.gray900, flex: 1 },
  totalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  totalText: { ...Typography.caption, fontWeight: '800' },
  range: { ...Typography.caption, color: Colors.gray500, marginBottom: 4, writingDirection: 'ltr' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  stepLast: { borderBottomWidth: 0 },
  stepText: { flex: 1 },
  stepLabel: { ...Typography.bodySmall, color: Colors.gray900, fontWeight: '600' },
  stepPlace: { color: Colors.gray500, fontWeight: '400' },
  stepTime: { ...Typography.bodySmall, color: Colors.gray700, fontWeight: '700', writingDirection: 'ltr' },
  stepTimeMissing: { color: Colors.gray300 },
});
