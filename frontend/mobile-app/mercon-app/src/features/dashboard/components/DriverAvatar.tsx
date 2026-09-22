import React, { useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { OnlineIndicator } from './OnlineIndicator';

interface DriverAvatarProps {
  initials: string;
  imageUri?: ImageSourcePropType;
  online?: boolean;
  size?: number;
  className?: string;
}

export function DriverAvatar({ initials, imageUri, online, size = 52, className }: DriverAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const showImage = imageUri && !hasError;

  return (
    <View style={{ width: size, height: size }} className={`relative ${className ?? ''}`}>
      {showImage ? (
        <Image
          source={imageUri}
          resizeMode="cover"
          onError={() => setHasError(true)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={{ width: size, height: size, borderRadius: size / 2 }}
          className="items-center justify-center bg-[#3E3C3D] border border-gray-200"
        >
          <Text style={{ fontSize: size * 0.36 }} className="font-extrabold text-white">
            {initials}
          </Text>
        </View>
      )}
      {online !== undefined && (
        <View className="absolute -bottom-0.5 -right-0.5">
          <OnlineIndicator online={online} size={Math.round(size * 0.28)} />
        </View>
      )}
    </View>
  );
}
