import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType, ViewStyle } from 'react-native';

export interface FadedBottomIllustrationProps {
  imageSource?: ImageSourcePropType;
  type?: 'start_loading' | 'loading' | 'delivery' | 'home' | 'stop';
  height?: number;
  backgroundColor?: string;
  imageOpacity?: number;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  fullWidth?: boolean;
  style?: ViewStyle;
}

export const FadedBottomIllustration: React.FC<FadedBottomIllustrationProps> = ({
  imageSource,
  type = 'start_loading',
  height = 240,
  imageOpacity = 0.25,
  resizeMode = 'contain',
  fullWidth = false,
  style,
}) => {
  const source = imageSource || (
    type === 'stop'
      ? require('../../assets/images/stop.webp')
      : type === 'delivery'
      ? require('../../assets/images/delivery.webp')
      : type === 'loading'
      ? require('../../assets/images/loading.webp')
      : require('../../assets/images/loading.webp')
  );

  return (
    <View
      style={[
        styles.wrapper,
        { height },
        fullWidth && styles.fullWidthWrapper,
        style,
      ]}
    >
      <Image
        source={source}
        style={[styles.image, { opacity: imageOpacity }]}
        resizeMode={resizeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 18,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  fullWidthWrapper: {
    marginHorizontal: -14,
    borderRadius: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
