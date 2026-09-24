import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme/tokens';

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'info' | 'error';
  onDismiss?: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'success',
  onDismiss,
  duration = 3000,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 10,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (onDismiss) onDismiss();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, message, duration, opacity, translateY, onDismiss]);

  if (!visible) return null;

  const IconComponent =
    type === 'error' ? AlertCircle : type === 'info' ? Info : CheckCircle2;
  const iconColor =
    type === 'error'
      ? Colors.error
      : type === 'info'
      ? Colors.info
      : Colors.success;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.toastContent}>
        <IconComponent size={18} color={iconColor} strokeWidth={2.4} />
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.charcoal,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(238, 241, 246, 0.2)',
    ...Shadows.md,
  },
  toastText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.white,
    flexShrink: 1,
  },
});
