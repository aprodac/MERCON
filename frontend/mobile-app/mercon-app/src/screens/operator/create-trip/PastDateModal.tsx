import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Colors, Spacing, Typography } from '../../../theme/tokens';
import { Button } from '../../../components/Button';
import { AppModal } from '../../../components/common/AppModal';

interface PastDateModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCompleted: () => void;
  onConfirmScheduled: () => void;
}

export const PastDateModal: React.FC<PastDateModalProps> = ({
  visible,
  onClose,
  onConfirmCompleted,
  onConfirmScheduled,
}) => {
  return (
    <AppModal visible={visible} onClose={onClose} type="dialog">
      <View style={styles.container}>
        <AlertTriangle size={32} color={Colors.warning} style={styles.icon} />
        <Text style={styles.title}>Past Departure Date Detected</Text>
        <Text style={styles.body}>
          The departure date for this trip is in the past. Would you like to record this as a Completed historical trip or keep it as Scheduled?
        </Text>
        <View style={styles.actions}>
          <Button title="Create as Completed (Historical)" onPress={onConfirmCompleted} />
          <Button title="Create as Scheduled" variant="outline" onPress={onConfirmScheduled} />
          <Button title="Cancel & Edit Date" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.headingM.fontSize,
    fontWeight: Typography.headingM.fontWeight,
    color: Colors.charcoal,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    gap: Spacing.xs,
  },
});
