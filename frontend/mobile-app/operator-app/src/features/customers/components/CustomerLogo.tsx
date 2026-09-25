import React from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { customerInitials } from '../services/customersService';

interface CustomerLogoProps {
  name: string;
  logoUri?: ImageSourcePropType;
  size?: number;
  className?: string;
}

const BRAND_COLORS = [
  { bg: '#FCE7F3', text: '#9D174D' }, // Pink
  { bg: '#FEF3C7', text: '#92400E' }, // Amber
  { bg: '#DBEAFE', text: '#1E40AF' }, // Blue
  { bg: '#F3E8FF', text: '#6B21A8' }, // Purple
  { bg: '#E0E7FF', text: '#3730A3' }, // Indigo
  { bg: '#D1FAE5', text: '#065F46' }, // Emerald
];

export function CustomerLogo({ name, logoUri, size = 48, className }: CustomerLogoProps) {
  // Use a squarcle (rounded square) instead of a pure circle to match the screenshot
  const radius = size * 0.3; 

  if (logoUri) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: radius }}
        className={`overflow-hidden border border-[#F0F0F3] bg-white ${className ?? ''}`}
      >
        <Image source={logoUri} resizeMode="contain" style={{ width: size, height: size }} />
      </View>
    );
  }

  // Pick a dynamic color based on name length so it's stable per-customer
  const colorIndex = name.length % BRAND_COLORS.length;
  const theme = BRAND_COLORS[colorIndex];

  return (
    <View
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: theme.bg }}
      className={`items-center justify-center ${className ?? ''}`}
    >
      <Text style={{ fontSize: size * 0.38, color: theme.text, fontWeight: '700' }}>
        {customerInitials(name)}
      </Text>
    </View>
  );
}
