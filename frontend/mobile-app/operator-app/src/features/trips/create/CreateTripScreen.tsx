/**
 * Create trip — three steps (job, when, who) and a review sheet, with the
 * trip's money always visible at the bottom.
 */
import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Animated, { SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useCreateTrip, type CreateTripStep } from './useCreateTrip';
import { StepJob } from './components/StepJob';
import { StepSchedule } from './components/StepSchedule';
import { StepAssign } from './components/StepAssign';
import { ReviewSheet } from './components/ReviewSheet';
import { SkeletonRows, fmtSar } from './components/ui';

const STEPS: Record<CreateTripStep, { title: string; short: string; next: string }> = {
  1: { title: 'Job details', short: 'Job', next: 'Continue' },
  2: { title: 'Schedule', short: 'When', next: 'Continue' },
  3: { title: 'Driver and truck', short: 'Who', next: 'Review trip' },
};

export default function CreateTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; billingType?: string; assignment?: string }>();
  const form = useCreateTrip({ customerId: params.customerId, billingType: params.billingType, assignment: params.assignment });
  const scrollRef = useRef<ScrollView>(null);
  const [showErrors, setShowErrors] = useState<Record<CreateTripStep, boolean>>({ 1: false, 2: false, 3: false });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  // Which way the steps slide: forward from the right, back from the left.
  const [direction, setDirection] = useState<1 | -1>(1);

  const goTo = (s: CreateTripStep) => {
    setDirection(s >= form.step ? 1 : -1);
    form.setStep(s);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    const issues = form.stepIssues(form.step);
    if (issues.length > 0) {
      setShowErrors((e) => ({ ...e, [form.step]: true }));
      setToast({ message: issues[0].message, type: 'error' });
      return;
    }
    if (form.step < 3) goTo((form.step + 1) as CreateTripStep);
    else {
      // Everything, including what earlier steps leave for the end (driver payout).
      const first = form.allIssues[0];
      if (first) {
        const owner = first.section === 'schedule' ? 2 : first.section === 'assignment' ? 3 : 1;
        setShowErrors({ 1: true, 2: true, 3: true });
        setToast({ message: first.message, type: 'error' });
        if (owner !== 3) goTo(owner as CreateTripStep);
        return;
      }
      setReviewOpen(true);
    }
  };

  const back = () => (form.step > 1 ? goTo((form.step - 1) as CreateTripStep) : router.back());

  const confirm = async (pastChoice: 'Completed' | 'Incomplete') => {
    const res = await form.submit(pastChoice);
    if (!res.ok) {
      setToast({ message: res.message, type: 'error' });
      if (res.step) {
        setReviewOpen(false);
        setShowErrors({ 1: true, 2: true, 3: true });
        goTo(res.step);
      }
      return;
    }
    setReviewOpen(false);
    setToast({ message: res.message, type: 'success' });
    setTimeout(() => router.replace('/' as any), 900);
  };

  const { money } = form;
  const marginKnown = money.billing > 0 && money.costKnown;
  const marginTone = !marginKnown ? 'none' : money.marginPct >= 20 ? 'good' : money.marginPct >= 5 ? 'thin' : 'low';
  const entering = (direction === 1 ? SlideInRight : SlideInLeft).duration(220);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={back} hitSlop={10} style={styles.back}>
            <ChevronLeft size={24} color={Colors.charcoal} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>{STEPS[form.step].title}</Text>
            <Text style={styles.stepText}>New trip · step {form.step} of 3</Text>
          </View>
        </View>
        <View style={styles.progress}>
          {([1, 2, 3] as CreateTripStep[]).map((s) => {
            const done = s <= form.step;
            return (
              <TouchableOpacity key={s} style={{ flex: 1 }} onPress={() => s < form.step && goTo(s)} disabled={s >= form.step} hitSlop={{ top: 8, bottom: 8 }}>
                <View style={[styles.progressBar, done && styles.progressOn]} />
                <Text style={[styles.progressLabel, s === form.step && styles.progressLabelOn, s < form.step && { color: Colors.gray600 }]}>{STEPS[s].short}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {form.loading ? (
        <View style={styles.scroll}>
          <SkeletonRows rows={4} height={96} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
            {form.loadError ? <Text style={styles.error}>{form.loadError}</Text> : null}
            <Animated.View key={form.step} entering={entering}>
              {form.step === 1 ? <StepJob form={form} showErrors={showErrors[1]} /> : null}
              {form.step === 2 ? <StepSchedule form={form} showErrors={showErrors[2]} /> : null}
              {form.step === 3 ? <StepAssign form={form} showErrors={showErrors[3]} /> : null}
            </Animated.View>
          </ScrollView>

          <View style={styles.bar}>
            <View style={styles.moneyRow}>
              <MoneyCell label={form.isMonthly ? 'Per trip' : 'Billing'} value={money.billing > 0 ? `SAR ${fmtSar(money.billing)}` : '—'} />
              <MoneyCell label={form.assignmentType === 'third_party' ? 'Partner' : 'Driver'} value={money.costKnown ? `SAR ${fmtSar(money.cost)}` : '—'} />
              {form.isMonthly ? <MoneyCell label="Trips" value={String(money.trips)} /> : null}
              <View style={[styles.pill, styles[`pill_${marginTone}`]]}>
                <Text style={[styles.pillText, styles[`pillText_${marginTone}`]]}>{marginKnown ? `${Math.round(money.marginPct)}% margin` : 'Margin —'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.next} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>{STEPS[form.step].next}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <ReviewSheet form={form} visible={reviewOpen} onClose={() => setReviewOpen(false)} onConfirm={confirm} />
      <Toast visible={Boolean(toast)} message={toast?.message ?? ''} type={toast?.type ?? 'info'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

function MoneyCell({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.moneyLabel}>{label}</Text>
      <Text style={styles.moneyValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.coolGray },
  header: { backgroundColor: Colors.white, paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { marginLeft: -4, padding: 2 },
  title: { fontSize: 19, fontWeight: '700', color: Colors.charcoal },
  stepText: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  progress: { flexDirection: 'row', gap: 8, marginTop: 12 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: Colors.gray200 },
  progressOn: { backgroundColor: Colors.primary },
  progressLabel: { fontSize: 11, color: Colors.gray400, marginTop: 5, fontWeight: '500' },
  progressLabelOn: { color: Colors.charcoal, fontWeight: '700' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing['2xl'] },
  error: { fontSize: 13, color: Colors.danger, marginBottom: Spacing.sm },
  bar: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.base,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  moneyLabel: { fontSize: 11, color: Colors.gray500 },
  moneyValue: { fontSize: 15, fontWeight: '700', color: Colors.charcoal, marginTop: 1 },
  pill: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  pillText: { fontSize: 13, fontWeight: '700' },
  pill_none: { backgroundColor: Colors.gray100 },
  pillText_none: { color: Colors.gray500 },
  pill_good: { backgroundColor: '#EAF3DE' },
  pillText_good: { color: '#27500A' },
  pill_thin: { backgroundColor: '#FAEEDA' },
  pillText_thin: { color: '#854F0B' },
  pill_low: { backgroundColor: '#FCEBEB' },
  pillText_low: { color: '#A32D2D' },
  next: { marginTop: 12, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  nextText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
