import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TouchableWithoutFeedback, KeyboardAvoidingView, Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../../theme/tokens';

export interface AppModalProps {
  visible: boolean;
  onClose?: () => void;
  type?: 'dialog' | 'bottom-sheet';
  title?: string;
  children: React.ReactNode;
  maxHeight?: number | string;
  contentStyle?: any;
}

export function AppModal({
  visible,
  onClose,
  type = 'dialog',
  title,
  children,
  maxHeight = '85%',
  contentStyle,
}: AppModalProps) {
  const isBottomSheet = type === 'bottom-sheet';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isBottomSheet ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <View
          style={[
            isBottomSheet ? styles.sheetContent : styles.dialogContent,
            { maxHeight },
            contentStyle,
          ]}
        >
          {isBottomSheet && <View style={styles.sheetDragHandle} />}

          {title || onClose ? (
            <View style={styles.headerRow}>
              {title ? <Text style={styles.titleText}>{title}</Text> : <View />}
              {onClose ? (
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={18} color={Colors.gray600} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  dialogContent: {
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    width: '92%',
    maxWidth: 500,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.lg,
  },
  sheetContent: {
    width: '100%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    padding: Spacing.lg,
    paddingBottom: Spacing.xl + (Platform.OS === 'ios' ? 16 : 0),
    ...Shadows.xl,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray300,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  titleText: {
    fontSize: Typography.headingM.fontSize,
    fontWeight: Typography.headingM.fontWeight,
    color: Colors.charcoal,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
