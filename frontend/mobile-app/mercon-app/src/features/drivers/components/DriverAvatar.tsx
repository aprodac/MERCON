import React, { useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { Colors } from '@/theme/tokens';
import { DriverStatusIndicator } from './DriverStatusIndicator';
import type { DriverDisplayStatus } from '../types';

interface DriverAvatarProps {
  initials: string;
  avatarUrl?: string | null;
  imageUri?: ImageSourcePropType;
  status?: DriverDisplayStatus;
  size?: number;
  className?: string;
}

/** Helper to resolve avatar source string to ImageSourcePropType */
function resolveAvatarSource(avatarUrl?: string | null, imageUri?: ImageSourcePropType): ImageSourcePropType | null {
  if (imageUri) return imageUri;
  if (!avatarUrl || typeof avatarUrl !== 'string' || !avatarUrl.trim()) return null;

  const url = avatarUrl.trim();
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
    return { uri: url };
  }
  // Relative URL fallback
  return { uri: url.startsWith('/') ? `https://dev.mercon.tech${url}` : `https://dev.mercon.tech/${url}` };
}

/** Purely circular driver avatar component with status dot indicator. */
export function DriverAvatar({ initials, avatarUrl, imageUri, status, size = 52, className }: DriverAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const source = !hasError ? resolveAvatarSource(avatarUrl, imageUri) : null;
  const halfSize = Math.round(size / 2);

  return (
    <View style={{ width: size, height: size }} className={`relative items-center justify-center ${className ?? ''}`}>
      <View
        style={{ width: size, height: size, borderRadius: halfSize, backgroundColor: Colors.primary, borderColor: Colors.gray200 }}
        className="overflow-hidden items-center justify-center border"
      >
        {source ? (
          <Image
            source={source}
            resizeMode="cover"
            onError={() => setHasError(true)}
            style={{ width: size, height: size, borderRadius: halfSize }}
          />
        ) : (
          <Text style={{ fontSize: Math.round(size * 0.38) }} className="font-bold text-white tracking-wide text-center">
            {initials}
          </Text>
        )}
      </View>
      {status && (
        <View className="absolute bottom-0 right-0 z-10">
          <DriverStatusIndicator status={status} size={Math.round(size * 0.28)} />
        </View>
      )}
    </View>
  );
}
