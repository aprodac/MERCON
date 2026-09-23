import React, { useState } from 'react';
import { Image, Text, View, StyleSheet, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { Colors } from '../../../theme/tokens';
import { SkeletonBlock } from '../../../shared/components';
import { DriverStatusIndicator } from './DriverStatusIndicator';
import type { DriverDisplayStatus } from '../types';

export const DRIVER_AVATAR_SIZES = {
  xl: 46,
  lg: 40,
  md: 34,
  sm: 32,
  xs: 24,
} as const;

export interface DriverAvatarProps {
  initials: string;
  avatarUrl?: string | null;
  imageUri?: ImageSourcePropType;
  status?: DriverDisplayStatus;
  size?: number;
  style?: ViewStyle;
}

/** Helper to resolve avatar source string to ImageSourcePropType */
function resolveAvatarSource(avatarUrl?: string | null, imageUri?: ImageSourcePropType): ImageSourcePropType | null {
  if (imageUri) return imageUri;
  if (!avatarUrl || typeof avatarUrl !== 'string' || !avatarUrl.trim()) return null;

  const url = avatarUrl.trim();
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
    return { uri: url };
  }
  return { uri: url.startsWith('/') ? `https://dev.mercon.tech${url}` : `https://dev.mercon.tech/${url}` };
}

/** Purely circular driver avatar component with image loading skeleton & status dot indicator. */
export function DriverAvatar({ initials, avatarUrl, imageUri, status, size = 40, style }: DriverAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const source = !hasError ? resolveAvatarSource(avatarUrl, imageUri) : null;
  const halfSize = Math.round(size / 2);

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <View
        style={[
          styles.avatarFrame,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            backgroundColor: Colors.primary,
            borderColor: Colors.gray200,
          },
        ]}
      >
        {source ? (
          <>
            {isLoading && (
              <View style={styles.skeletonContainer}>
                <SkeletonBlock width={size} height={size} radius={halfSize} />
              </View>
            )}
            <Image
              source={source}
              resizeMode="cover"
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              style={{ width: size, height: size, borderRadius: halfSize }}
            />
          </>
        ) : (
          <Text style={[styles.initialsText, { fontSize: Math.round(size * 0.38) }]}>
            {initials}
          </Text>
        )}
      </View>
      {status && (
        <View style={styles.statusContainer}>
          <DriverStatusIndicator status={status} size={Math.round(size * 0.28)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFrame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  initialsText: {
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statusContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    zIndex: 20,
  },
});
