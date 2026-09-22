import React, { useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
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

/** Driver photo / initials avatar component with status indicator. */
export function DriverAvatar({ initials, avatarUrl, imageUri, status, size = 56, className }: DriverAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const radius = Math.round(size * 0.28);
  const source = !hasError ? resolveAvatarSource(avatarUrl, imageUri) : null;

  return (
    <View style={{ width: size, height: size }} className={`relative ${className ?? ''}`}>
      {source ? (
        <Image
          source={source}
          resizeMode="cover"
          onError={() => setHasError(true)}
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <View
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#FA634E' }}
          className="items-center justify-center shadow-sm"
        >
          <Text style={{ fontSize: Math.round(size * 0.36) }} className="font-bold text-white tracking-wide">
            {initials}
          </Text>
        </View>
      )}
      {status && (
        <View className="absolute -bottom-0.5 -right-0.5">
          <DriverStatusIndicator status={status} size={Math.round(size * 0.24)} />
        </View>
      )}
    </View>
  );
}
