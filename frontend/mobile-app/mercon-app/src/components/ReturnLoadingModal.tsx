import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { CheckCircle2, RotateCcw, ArrowRight, ArrowLeft, X } from 'lucide-react-native';
import { useLanguage } from '../lib/language-context';

export interface ReturnLoadingModalProps {
  visible: boolean;
  onConfirm: () => void;
  onClose?: () => void;
  destinationName?: string;
  /** @deprecated No longer shown — the modal only names the return loading point. */
  destinationAddress?: string;
}

export const ReturnLoadingModal: React.FC<ReturnLoadingModalProps> = ({
  visible,
  onConfirm,
  onClose,
  destinationName,
}) => {
  const { t, language } = useLanguage();
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose || onConfirm}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Top Right Close Button */}
          {onClose && (
            <TouchableOpacity
              style={styles.closeBtn}
              activeOpacity={0.7}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color="#94A3B8" strokeWidth={2.2} />
            </TouchableOpacity>
          )}

          {/* Icon Cluster: Checkmark Badge with Return Overlay */}
          <View style={styles.iconClusterWrapper}>
            <View style={styles.iconCircleSuccess}>
              <CheckCircle2 size={36} color="#10B981" strokeWidth={2.4} />
            </View>
            <View style={styles.iconBadgeReturn}>
              <RotateCcw size={13} color="#FFFFFF" strokeWidth={2.6} />
            </View>
          </View>

          {/* Round progress: round 1 done, round 2 next */}
          <View style={styles.roundTrack}>
            <View style={[styles.roundSeg, styles.roundSegDone]}>
              <Text style={styles.roundSegTextDone}>1</Text>
            </View>
            <View style={[styles.roundSeg, styles.roundSegNext]}>
              <Text style={styles.roundSegTextNext}>2</Text>
            </View>
          </View>

          <Text style={styles.title}>{t('title_round_1_done', 'Round 1 of 2 completed')}</Text>

          <Text style={styles.description} numberOfLines={2}>
            {t('label_next_return_loading', 'Next: return loading at {place}').replace(
              '{place}',
              destinationName || t('label_return_loading_depot', 'Return Loading Depot'),
            )}
          </Text>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={onConfirm}
          >
            <Text style={styles.primaryBtnText}>{t('action_start_round_2', 'Start Round 2 of 2')}</Text>
            {language === 'ur' ? (
              <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.6} style={styles.btnArrowIcon} />
            ) : (
              <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.6} style={styles.btnArrowIcon} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  roundTrack: {
    flexDirection: 'row',
    gap: 6,
    width: '60%',
    marginBottom: 14,
  },
  roundSeg: {
    flex: 1,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundSegDone: {
    backgroundColor: '#10B981',
  },
  roundSegNext: {
    backgroundColor: '#FFF1EF',
    borderWidth: 1.5,
    borderColor: '#FA634E',
    borderStyle: 'dashed',
  },
  roundSegTextDone: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  roundSegTextNext: {
    color: '#FA634E',
    fontWeight: '800',
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 375,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 16,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  iconClusterWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  iconCircleSuccess: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBadgeReturn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FA634E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#FA634E',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FA634E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  btnArrowIcon: {
    marginLeft: 8,
  },
});
