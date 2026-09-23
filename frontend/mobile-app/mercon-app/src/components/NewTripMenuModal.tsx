import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Layers, Truck } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme/tokens';
import { AppModal } from './common/AppModal';

interface NewTripMenuModalProps {
  visible: boolean;
  onClose: () => void;
  customerId?: string;
}

export const NewTripMenuModal: React.FC<NewTripMenuModalProps> = ({
  visible,
  onClose,
  customerId,
}) => {
  const router = useRouter();

  const handleSelectOption = (params: Record<string, string>) => {
    onClose();
    const finalParams = customerId ? { customerId, ...params } : params;
    router.push({
      pathname: '/operator/create-trip',
      params: finalParams,
    });
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      type="bottom-sheet"
      title="New Trip"
    >
      <View style={styles.optionsList}>
        {/* Option 1: Daily / Spot Trip */}
        <TouchableOpacity
          style={styles.optionRow}
          activeOpacity={0.7}
          onPress={() => handleSelectOption({ billingType: 'Extra' })}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(250, 99, 78, 0.1)' }]}>
            <Plus size={20} color={Colors.primary} strokeWidth={2.4} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.optionTitle}>Daily / Spot Trip</Text>
            <Text style={styles.optionSubtitle}>Single or round trip at spot rate cards</Text>
          </View>
        </TouchableOpacity>

        {/* Option 2: Monthly Duty Trip */}
        <TouchableOpacity
          style={styles.optionRow}
          activeOpacity={0.7}
          onPress={() => handleSelectOption({ billingType: 'Monthly' })}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(79, 70, 229, 0.1)' }]}>
            <Layers size={20} color="#4F46E5" strokeWidth={2.4} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.optionTitle}>Monthly Duty Trip</Text>
            <Text style={styles.optionSubtitle}>Dedicated monthly contract duty & calendar</Text>
          </View>
        </TouchableOpacity>

        {/* Option 3: 3PL Partner Dispatch */}
        <TouchableOpacity
          style={styles.optionRow}
          activeOpacity={0.7}
          onPress={() => handleSelectOption({ assignment: 'third_party' })}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Truck size={20} color="#10B981" strokeWidth={2.4} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.optionTitle}>3PL Partner Dispatch</Text>
            <Text style={styles.optionSubtitle}>Subcontracted trip with 3PL carrier cost</Text>
          </View>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  optionsList: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  optionSubtitle: {
    fontSize: Typography.xs,
    fontWeight: '500',
    color: Colors.gray500,
    marginTop: 2,
  },
});
