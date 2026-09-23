import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Layers, Truck, X } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme/tokens';

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>New Trip</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={Colors.gray500} />
                </TouchableOpacity>
              </View>

              {/* Options */}
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
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    gap: Spacing.md,
    ...Shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: '800',
    color: Colors.gray900,
  },
  optionsList: {
    gap: Spacing.sm,
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
