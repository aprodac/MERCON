/**
 * "Driver's steps" — take the trip back to an earlier step when the driver
 * tapped ahead by mistake (e.g. went through delivery and took the POD photos
 * while still loading), or mark the next step done for the driver (TestFlight
 * feedback). Same rules and wording as the web dialog; the server does the
 * work (GET /trips/:id/progress-steps, POST /trips/:id/step-back, /step-forward).
 * The step that finishes the trip stays with Confirm delivery (it makes the invoice).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Images, Redo2, TriangleAlert, Undo2 } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService } from '../../../../lib/operator';
import type { Formatters } from '../tripDetailsModel';
import { INK, MUTED } from './parts';

type PhotoChoice = 'move' | 'remove' | 'keep';

export function StepBackSheet({ visible, tripId, f, onClose, onDone }: {
  visible: boolean; tripId: string; f: Formatters; onClose: () => void; onDone: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trip-progress-steps', tripId],
    queryFn: () => operatorService.tripProgressSteps(tripId),
    enabled: visible,
    staleTime: 0,
  });
  const [target, setTarget] = useState<number | null>(null);
  const [photos, setPhotos] = useState<PhotoChoice>('move');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && data) setTarget(data.current - 1 >= -1 ? data.current - 1 : null);
    if (!visible) { setTarget(null); setPhotos('move'); }
  }, [visible, data]);

  const steps = data?.steps ?? [];
  const current = data?.current ?? -1;
  // A pick above "now" moves the trip on to it; below, takes it back.
  const forwardTo = target !== null && target > current ? target : null;
  // Steps the driver skipped (customer-app trips skip most) aren't "undone".
  const undoCount = target === null || forwardTo !== null ? 0 : steps.slice(target + 1, current + 1).filter((st) => st.done).length;
  const doneCount = forwardTo === null ? 0 : forwardTo - current;
  const photoCount = target === null || forwardTo !== null ? 0 : data?.photos_after[target] ?? 0;
  const targetLabel = target === null ? '' : target === -1 ? 'Not started' : steps[target]?.label;
  const nextForDriver = target === null ? '' : target === -1 ? 'Start the trip' : steps[target]?.next;

  // Steps the office can mark done for the driver — never the one that finishes the trip (Confirm delivery).
  const lastMarkable = steps.length - 2;
  const forward = () => {
    if (forwardTo === null) return;
    const to = steps[forwardTo];
    Alert.alert(
      doneCount === 1 ? 'Mark this step done?' : `Mark ${doneCount} steps done?`,
      `${doneCount === 1 ? `"${to.label}" is` : `Every step up to "${to.label}" is`} recorded now. The driver's app moves on to "${to.next}", and the driver gets a notification.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Mark done', onPress: async () => {
            setSaving(true);
            try {
              const r = await operatorService.stepForwardTrip(tripId, forwardTo);
              Alert.alert('Trip moved on', `Now at: ${r.to.label}.`);
              onDone();
              onClose();
            } catch (e) {
              Alert.alert('Could not move the trip on', getApiErrorMessage(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const confirm = () => {
    if (target === null) return;
    Alert.alert(
      `Go back ${undoCount} step${undoCount === 1 ? '' : 's'}?`,
      `The trip goes back to "${targetLabel}". The driver's app opens on "${nextForDriver}", and the driver gets a notification.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Go back', style: 'destructive', onPress: async () => {
            setSaving(true);
            try {
              const r = await operatorService.stepBackTrip(tripId, { to_index: target, photos });
              const note = r.photos.count
                ? r.photos.choice === 'move' ? `\n${r.photos.count} photo${r.photos.count === 1 ? '' : 's'} moved to ${r.photos.moved_to}.`
                  : r.photos.choice === 'remove' ? `\n${r.photos.count} photo${r.photos.count === 1 ? '' : 's'} removed.` : ''
                : '';
              Alert.alert('Trip taken back', `Now at: ${r.to.label}.${note}`);
              onDone();
              onClose();
            } catch (e) {
              Alert.alert('Could not take the trip back', getApiErrorMessage(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const row = (index: number, label: string, sub: string, done: boolean, isCurrent: boolean) => {
    // Any earlier step, done or skipped (TestFlight 21 Oct: "not able to select 2-3 steps back"); later ones up to the last markable.
    const canPick = isCurrent ? false : index < current || (index > current && index <= lastMarkable);
    const picked = target === index;
    const undone = target !== null && index > target && done;
    const toBeDone = forwardTo !== null && !done && index <= forwardTo;
    return (
      <TouchableOpacity
        key={index}
        disabled={!canPick}
        onPress={() => setTarget(index)}
        activeOpacity={0.7}
        style={[s.step, picked && s.stepPicked]}
        accessibilityRole="radio"
        accessibilityState={{ selected: picked, disabled: !canPick }}
      >
        {done || toBeDone ? <CheckCircle2 size={18} color={undone ? '#C9CBD3' : toBeDone ? '#2563EB' : '#15803D'} /> : <Circle size={18} color="#C9CBD3" />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.stepLabel, !done && !toBeDone && { color: '#A1A1AA' }, undone && s.struck, isCurrent && { fontWeight: '800' }]} numberOfLines={2}>{label}</Text>
          {sub ? <Text style={s.stepSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {picked ? <View style={[s.badge, forwardTo !== null && { backgroundColor: '#2563EB' }]}><Text style={s.badgeText}>{forwardTo !== null ? 'Done up to here' : 'Back to here'}</Text></View> : null}
      </TouchableOpacity>
    );
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Driver's steps" maxHeight="92%">
      <View style={{ gap: 12, paddingBottom: 8, flexShrink: 1 }}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
        ) : isError || !data ? (
          <Text style={s.error}>Couldn't load the trip's steps.</Text>
        ) : !data.can_step_back ? (
          <View style={s.blocked}>
            <TriangleAlert size={16} color="#B45309" />
            <Text style={s.blockedText}>{data.blocked_reason}</Text>
          </View>
        ) : (
          <>
            {/* One scroll for the steps and the summary under them, with the button kept in view:
                the steps list used to scroll on its own inside a sheet that didn't, so the photo
                choices under it were cut off (TestFlight 21 Oct: "can't scroll down the yellow bar",
                "not able to select 2-3 steps back"). */}
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator>
              <Text style={s.intro}>Pick the step the trip is really at. An earlier step undoes everything after it; a later step marks every step up to it done for the driver.</Text>
              <View>
              {row(-1, 'Not started', 'Before the driver tapped Start', true, false)}
              {steps.map((st) => row(
                st.index,
                st.label,
                st.index === current ? `Where the trip is now${st.at ? ` · ${f.smart(st.at)}` : ''}` : st.at ? f.smart(st.at) : st.done ? '' : 'Not done yet',
                st.done,
                st.index === current,
              ))}
              </View>

            {forwardTo !== null ? (
              <View style={s.summary}>
                <Text style={s.summaryText}>
                  <Text style={{ fontWeight: '800' }}>{doneCount} step{doneCount === 1 ? '' : 's'}</Text> marked done. The driver app moves on to <Text style={{ fontWeight: '800' }}>{steps[forwardTo]?.next}</Text>.
                </Text>
              </View>
            ) : target !== null ? (
              <View style={s.summary}>
                <Text style={s.summaryText}>
                  <Text style={{ fontWeight: '800' }}>{undoCount} step{undoCount === 1 ? '' : 's'}</Text> undone. The driver's app opens on <Text style={{ fontWeight: '800' }}>{nextForDriver}</Text>.
                </Text>
                {photoCount > 0 ? (
                  <View style={{ gap: 6 }}>
                    <View style={s.photoHead}>
                      <Images size={14} color="#78350F" />
                      <Text style={s.photoHeadText}>{photoCount} PHOTO{photoCount === 1 ? '' : 'S'} TAKEN SINCE THEN</Text>
                    </View>
                    {([
                      ['move', `Move them to "${nextForDriver}"`, 'Photos taken at the wrong step (e.g. loading photos sent as POD).'],
                      ['remove', 'Remove them from the trip', 'The driver retakes them.'],
                      ['keep', 'Leave them where they are', ''],
                    ] as const).map(([value, title, hint]) => (
                      <TouchableOpacity key={value} style={[s.choice, photos === value && s.choicePicked]} onPress={() => setPhotos(value)} accessibilityRole="radio" accessibilityState={{ selected: photos === value }}>
                        <View style={[s.radio, photos === value && s.radioOn]} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.choiceTitle}>{title}</Text>
                          {hint ? <Text style={s.choiceHint}>{hint}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            </ScrollView>

            {forwardTo !== null ? (
              <TouchableOpacity style={[s.cta, { backgroundColor: '#2563EB' }, saving && { opacity: 0.5 }]} disabled={saving} onPress={forward} accessibilityRole="button">
                {saving ? <ActivityIndicator color="#fff" /> : <Redo2 size={18} color="#fff" />}
                <Text style={s.ctaText}>Mark {doneCount} step{doneCount === 1 ? '' : 's'} done</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.cta, (target === null || saving) && { opacity: 0.5 }]} disabled={target === null || saving} onPress={confirm} accessibilityRole="button">
                {saving ? <ActivityIndicator color="#fff" /> : <Undo2 size={18} color="#fff" />}
                <Text style={s.ctaText}>Go back {undoCount > 0 ? `${undoCount} step${undoCount === 1 ? '' : 's'}` : ''}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20, color: MUTED },
  error: { fontSize: 14, color: '#B42318' },
  blocked: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A' },
  blockedText: { flex: 1, fontSize: 14, color: '#78350F' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  stepPicked: { borderColor: '#FA634E', backgroundColor: '#FFF4F1' },
  stepLabel: { fontSize: 15, fontWeight: '600', color: INK },
  stepSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  struck: { color: '#A1A1AA', textDecorationLine: 'line-through' },
  badge: { backgroundColor: '#FA634E', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  summary: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  summaryText: { fontSize: 14, lineHeight: 20, color: '#78350F' },
  photoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: '#78350F' },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  choicePicked: { borderColor: '#F59E0B', backgroundColor: '#fff' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#C9CBD3', marginTop: 1 },
  radioOn: { borderColor: '#FA634E', borderWidth: 6 },
  choiceTitle: { fontSize: 14, fontWeight: '700', color: INK },
  choiceHint: { fontSize: 12, color: MUTED, marginTop: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FA634E', borderRadius: 14, paddingVertical: 14 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ctaQuiet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F1F3F7', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12 },
  ctaQuietText: { flexShrink: 1, color: INK, fontSize: 15, fontWeight: '700' },
});
