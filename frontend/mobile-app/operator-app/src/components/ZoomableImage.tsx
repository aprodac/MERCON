/**
 * A photo that pinches to zoom (up to 5×) and pans while zoomed — the native
 * scroll-view zoom, so it also works inside a sideways-paging list. iOS only;
 * Android shows the photo as is.
 */
import React, { useState } from 'react';
import { Image, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

export function ZoomableImage({ uri, style }: { uri: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={style} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && uri ? (
        <ScrollView
          style={{ flex: 1 }}
          maximumZoomScale={5}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri }} style={{ width: size.w, height: size.h }} resizeMode="contain" />
        </ScrollView>
      ) : null}
    </View>
  );
}
