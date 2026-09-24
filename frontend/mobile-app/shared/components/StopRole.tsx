import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { STOP_ROLE_COLORS, STOP_ROLE_LABELS, type StopRole } from '@mercon/shared-types';

/**
 * Stop role markers for any route UI in the app: origin/loading = blue,
 * stops in between = red, destination/delivery = green. Colours come from the
 * shared STOP_ROLE_COLORS, same as the web.
 *
 * Pick the role with the shared helpers: stopRoleAt(index, legLength),
 * timelineStopRole(node) or tripStopRole(trip, stop).
 */
export const StopRoleDot: React.FC<{ role: StopRole; size?: number; style?: ViewStyle }> = ({ role, size = 8, style }) => (
  <View
    style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: STOP_ROLE_COLORS[role].main },
      style,
    ]}
  />
);

export const StopRoleBadge: React.FC<{ role: StopRole; label?: string; style?: ViewStyle; textStyle?: TextStyle }> = ({
  role,
  label,
  style,
  textStyle,
}) => {
  const c = STOP_ROLE_COLORS[role];
  return (
    <View style={[styles.badge, { backgroundColor: c.soft, borderColor: `${c.main}40` }, style]}>
      <Text style={[styles.badgeText, { color: c.text }, textStyle]}>{label ?? STOP_ROLE_LABELS[role]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
