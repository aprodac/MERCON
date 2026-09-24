import React from 'react';
import { View, Text, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { useLanguage } from '../lib/language-context';

export interface BilingualTextProps {
  /** English text string */
  en: string;
  /** Urdu text string */
  ur?: string;
  /** Primary (top) text style override */
  primaryStyle?: TextStyle;
  /** Secondary (bottom sub) text style override */
  subStyle?: TextStyle;
  /** Container style override */
  containerStyle?: ViewStyle;
  /** Number of lines for text truncation */
  numberOfLines?: number;
  /** Alignment (default: 'left') */
  align?: 'left' | 'center' | 'right';
}

/**
 * Scalable Bilingual Text Component.
 * Automatically handles single language mode ('en', 'ur') and dual mode ('ur-en').
 * In 'ur-en' mode, renders Urdu on TOP (primary) and English BELOW (smaller sub).
 */
export function BilingualText({
  en,
  ur,
  primaryStyle,
  subStyle,
  containerStyle,
  numberOfLines,
  align = 'left',
}: BilingualTextProps) {
  const { language } = useLanguage();

  const urduText = ur || en;

  if (language === 'ur') {
    return (
      <Text style={[styles.defaultSingleText, primaryStyle, { textAlign: align }]} numberOfLines={numberOfLines}>
        {urduText}
      </Text>
    );
  }

  if (language === 'en') {
    return (
      <Text style={[styles.defaultSingleText, primaryStyle, { textAlign: align }]} numberOfLines={numberOfLines}>
        {en}
      </Text>
    );
  }

  // Dual 'ur-en' mode: Urdu on TOP, English BELOW
  const isCentered = align === 'center';
  const isRight = align === 'right';

  return (
    <View
      style={[
        styles.container,
        isCentered && styles.containerCenter,
        isRight && styles.containerRight,
        containerStyle,
      ]}
    >
      <Text
        style={[styles.defaultPrimaryUrdu, primaryStyle, { textAlign: align }]}
        numberOfLines={numberOfLines}
      >
        {urduText}
      </Text>
      <Text
        style={[styles.defaultSubEn, subStyle, { textAlign: align }]}
        numberOfLines={numberOfLines}
      >
        {en}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 1,
    justifyContent: 'center',
  },
  containerCenter: {
    alignItems: 'center',
  },
  containerRight: {
    alignItems: 'flex-end',
  },
  defaultSingleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  defaultPrimaryUrdu: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3E3C3D',
    lineHeight: 20,
  },
  defaultSubEn: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6E6E80',
    lineHeight: 14,
  },
});
