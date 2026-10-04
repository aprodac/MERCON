import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { ArrowLeft, PackagePlus, MapPinned, FlagTriangleRight, Undo2 } from 'lucide-react-native';
import { STOP_ROLE_COLORS } from '@mercon/shared-types';
import { MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { TripProgressStepper } from './TripProgressStepper';
import { DelayButton } from './DelayButton';
import { TimelineTarget } from '../utils/routeParser';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';

export type TripStage = 'loading' | 'stop' | 'delivery';

/**
 * One colour per trip step so the screens can't be confused at a glance —
 * the same route palette as the stepper and the web dashboard
 * (loading = origin blue, stop = red, delivery = destination green).
 */
export const STAGE_THEME: Record<TripStage, { main: string; soft: string; text: string; page: string }> = {
  loading: { ...STOP_ROLE_COLORS.origin, page: '#EFF6FF' },
  stop: { ...STOP_ROLE_COLORS.stop, page: '#FEF2F2' },
  delivery: { ...STOP_ROLE_COLORS.destination, page: '#F0FDF4' },
};

const STAGE_ICON = { loading: PackagePlus, stop: MapPinned, delivery: FlagTriangleRight };

export interface StageHeaderProps {
  stage: TripStage;
  title: string;
  /** One line telling the driver what to do here. */
  subtitle: string;
  isReturn?: boolean;
  trip: MobileTrip | null;
  target: TimelineTarget;
  onBack: () => void;
  onDelay: () => void;
  style?: ViewStyle;
}

/** Coloured band at the top of the loading / stop / delivery screens. */
export const StageHeader: React.FC<StageHeaderProps> = ({
  stage, title, subtitle, isReturn, trip, target, onBack, onDelay, style,
}) => {
  const { t } = useLanguage();
  const theme = STAGE_THEME[stage];
  const Icon = STAGE_ICON[stage];

  return (
    <View style={[styles.band, { backgroundColor: theme.main }, style]}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={onBack}>
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} style={flipInRTL} />
        </TouchableOpacity>
        <View style={styles.topRight}>
          {isReturn && (
            <View style={styles.returnChip}>
              <Undo2 size={12} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.returnChipText}>{t('label_return', 'Return')}</Text>
            </View>
          )}
          <DelayButton onPress={onDelay} />
        </View>
      </View>

      <View style={styles.titleRow}>
        <View style={styles.iconTile}>
          <Icon size={26} color={theme.main} strokeWidth={2.2} />
        </View>
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.stepperWrap}>
        <TripProgressStepper trip={trip} target={target} onColor={theme.main} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  returnChipText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  iconTile: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  stepperWrap: {
    marginTop: 12,
  },
});

export default StageHeader;
