import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Radius, Typography, getStatusColors } from '../theme/tokens';

import { useLanguage } from '../lib/language-context';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_COLORS: Record<BadgeVariant, { color: string; bg: string }> = {
  success: { color: Colors.success, bg: Colors.successLight },
  warning: { color: Colors.warning, bg: Colors.warningLight },
  danger:  { color: Colors.danger,  bg: Colors.dangerLight  },
  info:    { color: Colors.info,    bg: Colors.infoLight    },
  neutral: { color: Colors.statusPending, bg: Colors.statusPendingBg },
};

interface BadgeProps {
  label: string;
  /** Shorthand for a color+bg pair; overridden by explicit color/bg. */
  variant?: BadgeVariant;
  color?: string;
  bg?: string;
  dot?: boolean;
  style?: ViewStyle;
}

/** Generic badge — pass variant, or color + bg, or use StatusBadge for automatic status colors */
export function Badge({ label, variant, color, bg, dot, style }: BadgeProps) {
  const v = variant ? VARIANT_COLORS[variant] : null;
  const { language } = useLanguage();
  color = color ?? v?.color ?? Colors.statusPending;
  bg = bg ?? v?.bg ?? Colors.statusPendingBg;
  const isBilingual = language === 'ur-en';
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.text, { color }, isBilingual ? styles.textBilingual : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Automatically picks colors based on trip/vehicle/document status string */
export function StatusBadge({ status, label, dot, style }: { status: string; label?: string; dot?: boolean; style?: ViewStyle }) {
  const { color, bg } = getStatusColors(status);
  const { t } = useLanguage();
  const key = `status_${status.toLowerCase().replace(/[\s-]+/g, '_')}`;
  const displayLabel = label || t(key, status);
  return <Badge label={displayLabel} color={color} bg={bg} dot={dot} style={style} />;
}

/** Solid colored badge (e.g. Priority: Critical) */
export function SolidBadge({ label, color = Colors.danger, style }: { label: string; color?: string; style?: ViewStyle }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={[styles.text, { color: Colors.white }]}>{label}</Text>
    </View>
  );
}

import { TouchableOpacity } from 'react-native';

/** Filter chip — toggleable button */
export function FilterChip({
  label, active, onPress, style,
}: { label: string; active?: boolean; onPress?: () => void; style?: ViewStyle }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
          : { backgroundColor: Colors.gray100, borderColor: Colors.gray200 },
        style,
      ]}
    >
      <Text style={[styles.chipText, { color: active ? Colors.white : Colors.gray900 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs / 2,
    borderRadius: Radius.full,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...Typography.caption,
    fontWeight: '600',
  },
  textBilingual: {
    fontSize: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
