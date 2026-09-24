import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

export interface DelayButtonProps {
  onPress: () => void;
  style?: ViewStyle;
}

export const DelayButton: React.FC<DelayButtonProps> = ({ onPress, style }) => {
  const { t } = useLanguage();

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {/* Prominent Round Circle on Left */}
      <View style={styles.iconCircle}>
        <Clock size={13} color="#FFFFFF" strokeWidth={2.6} />
      </View>

      {/* Joint Attached Soft Pill Body on Right */}
      <View style={styles.pillBody}>
        <Text style={styles.label}>{t('status_delayed', 'Delay')}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  pillBody: {
    height: 25,
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    paddingLeft: 14,
    paddingRight: 11,
    marginLeft: -11,
    borderWidth: 1.2,
    borderColor: '#FEE2E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 0.2,
  },
});
