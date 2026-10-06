/**
 * A company's logo, or its initials on the brand tint when it has none (or
 * the image fails to load). Same look as the customer details page.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

export const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};

export function CompanyLogo({ name, uri, size = 44 }: { name: string; uri: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.32) };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[s.img, box]} resizeMode="contain" onError={() => setFailed(true)} accessibilityLabel={`${name} logo`} />;
  }
  return (
    <View style={[s.empty, box]}>
      <Text style={[s.text, { fontSize: Math.round(size * 0.34) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  img: { backgroundColor: Colors.white, borderWidth: 1, borderColor: '#ECECEF' },
  empty: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800', color: Colors.primary },
});
