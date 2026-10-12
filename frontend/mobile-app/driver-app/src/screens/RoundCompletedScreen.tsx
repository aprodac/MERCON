/**
 * Round trips: the page shown after the round 1 delivery (it replaces the old
 * "Round 1 of 2 completed" pop-up). Shows what was done in round 1 and when,
 * a live break timer from the moment round 1 ended, and Start Round 2. The
 * driver can leave and come back after a rest; the break keeps counting until
 * Start Round 2 is tapped.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, Coffee, Home, RotateCcw, CheckCircle2 } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';
import { Colors, Radius, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';
import { getLegEndpoints, isRoundTrip, stopLabel } from '@mercon/mobile-shared/lib/trips';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { RoundTimeline } from '../components/RoundTimeline';
import { buildRoundTripSummary, formatClock, formatMinutes, minutesBetween, roundTimes } from '../services/roundTimes';

export default function RoundCompletedScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const ur = language === 'ur';
  const { trip, loading } = useCurrentTrip();
  const [local, setLocal] = useState<{ round1DoneAt: string | null; round2StartedAt: string | null } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!trip?.id) return;
    let cancelled = false;
    (async () => {
      // Opened from Home after a restart: round 1 is done by now, so start the break clock if it wasn't.
      await roundTimes.markRound1Done(trip.id);
      const v = await roundTimes.get(trip.id);
      if (cancelled) return;
      // Round 2 already started: this page is done, go on to return loading.
      if (v.round2StartedAt) {
        router.replace('/trip/pickup');
        return;
      }
      setLocal(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [trip?.id, router]);

  // Break timer.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Nothing to show: not a round trip any more (finished, cancelled, reassigned).
  useEffect(() => {
    if (!loading && (!trip || !isRoundTrip(trip))) router.replace('/');
  }, [loading, trip, router]);

  const summary = useMemo(() => (trip && local ? buildRoundTripSummary(trip, local) : null), [trip, local]);
  const nextPlace = trip ? stopLabel(getLegEndpoints(trip, 1).loading) : null;
  const breakMins = summary ? minutesBetween(summary.breakStart, now.toISOString()) : null;

  const startRound2 = async () => {
    if (!trip) return;
    await roundTimes.markRound2Started(trip.id);
    router.replace('/trip/pickup');
  };

  if (!trip || !summary) {
    return <SafeAreaView style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <CheckCircle2 size={40} color={Colors.success} strokeWidth={2.4} />
            <View style={styles.heroBadge}>
              <RotateCcw size={13} color={Colors.white} strokeWidth={2.6} />
            </View>
          </View>
          <View style={styles.roundTrack}>
            <View style={[styles.roundSeg, styles.roundSegDone]}>
              <Text style={styles.roundSegTextDone}>1 ✓</Text>
            </View>
            <View style={[styles.roundSeg, styles.roundSegNext]}>
              <Text style={styles.roundSegTextNext}>2</Text>
            </View>
          </View>
          <Text style={styles.title}>{t('title_round_1_done', 'Round 1 of 2 completed')}</Text>
          {trip.ref_id ? <Text style={styles.subtitle}>{trip.ref_id}</Text> : null}
        </View>

        <RoundTimeline title={t('label_round_1', 'Round 1')} round={summary.round1} />

        {/* Break since round 1 ended */}
        <View style={styles.breakCard}>
          <View style={styles.breakIcon}>
            <Coffee size={20} color={Colors.warning} strokeWidth={2.4} />
          </View>
          <View style={styles.breakText}>
            <Text style={styles.breakTitle}>{t('label_break', 'Break')}</Text>
            <Text style={styles.breakSub}>
              {t('label_break_since', 'Since {time}').replace('{time}', formatClock(summary.breakStart))}
            </Text>
          </View>
          <Text style={styles.breakValue}>{formatMinutes(breakMins, ur)}</Text>
        </View>

        <Text style={styles.next}>
          {t('label_next_return_loading', 'Next: return loading at {place}').replace(
            '{place}',
            nextPlace || t('label_return_loading_depot', 'Return Loading Depot'),
          )}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={startRound2}>
          <Text style={styles.primaryBtnText}>{t('action_start_round_2', 'Start Round 2 of 2')}</Text>
          <ArrowRight size={18} color={Colors.white} strokeWidth={2.6} style={flipInRTL} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.7} onPress={() => router.replace('/')}>
          <Home size={16} color={Colors.gray700} strokeWidth={2.2} />
          <Text style={styles.secondaryBtnText}>{t('action_take_break_home', 'Take a break — go to Home')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray100 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl },
  hero: { alignItems: 'center', paddingTop: Spacing.md, gap: 8 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  roundTrack: { flexDirection: 'row', gap: 6, width: '55%', marginTop: 4 },
  roundSeg: { flex: 1, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roundSegDone: { backgroundColor: Colors.success },
  roundSegNext: { backgroundColor: Colors.primaryLight, borderWidth: 1.5, borderColor: Colors.primary },
  roundSegTextDone: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  roundSegTextNext: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
  title: { ...Typography.headingL, color: Colors.gray900, textAlign: 'center' },
  subtitle: { ...Typography.caption, color: Colors.gray500 },
  breakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  breakIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakText: { flex: 1 },
  breakTitle: { ...Typography.bodyMedium, fontWeight: '800', color: Colors.gray900 },
  breakSub: { ...Typography.caption, color: Colors.gray700 },
  breakValue: { ...Typography.headingM, color: Colors.gray900, writingDirection: 'ltr' },
  next: { ...Typography.bodySmall, color: Colors.gray700, textAlign: 'center' },
  footer: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm, backgroundColor: Colors.gray100 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  primaryBtnText: { ...Typography.buttonLarge, lineHeight: 20, color: Colors.white },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  secondaryBtnText: { ...Typography.buttonMedium, lineHeight: 20, color: Colors.gray700 },
});
