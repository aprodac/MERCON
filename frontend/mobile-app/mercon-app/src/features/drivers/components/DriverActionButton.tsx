import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Shadows } from '@/theme/tokens';

interface DriverActionButtonProps {
  label: string;
  Icon: LucideIcon;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Rounded white action button — icon + label side by side, used inside DriverActionGroup. */
export function DriverActionButton({ label, Icon, onPress, disabled, className }: DriverActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.75}
      className={`flex-row items-center justify-center gap-1.5 border bg-white py-2.5 ${disabled ? 'opacity-40' : ''} ${className ?? ''}`}
      style={{ borderRadius: Radius.md, borderColor: Colors.gray100, ...Shadows.sm }}
    >
      <Icon size={15} color={Colors.accent} strokeWidth={2.25} />
      <Text style={{ color: Colors.gray700 }} className="text-xs font-semibold">{label}</Text>
    </TouchableOpacity>
  );
}
