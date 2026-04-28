import React, { forwardRef } from 'react';
import { View, StyleSheet, requireNativeComponent, ViewStyle } from 'react-native';

interface TvHeroBannerViewProps {
  movieData: string;
  streamUrl?: string;
  streamHeaders?: string;
  onFocus?: (event: any) => void;
  onColorExtracted?: (event: any) => void;
  style?: ViewStyle;
}

const NativeTvHeroBanner = requireNativeComponent<TvHeroBannerViewProps>('TvHeroBanner');

interface NativeHeroBannerProps {
  movieData: string;
  streamUrl?: string;
  streamHeaders?: string;
  placeholderColor?: string; // Kept for interface compatibility, but unused natively
  onColorExtracted?: (color: string) => void;
  onFocus?: () => void;
  style?: ViewStyle;
}

/**
 * NativeHeroBanner — Thin JS wrapper around Jetpack Compose TvHeroBannerView.
 * Replaces the old React Native HomeHero component with a native Kotlin implementation
 * that includes ExoPlayer trailer autoplay on remote focus.
 */
const NativeHeroBanner = forwardRef<any, NativeHeroBannerProps>(function NativeHeroBanner({
  movieData,
  streamUrl,
  streamHeaders,
  placeholderColor,
  onColorExtracted,
  onFocus,
  style,
}, ref) {
  return (
    <View style={[styles.container, style]}>
      <NativeTvHeroBanner
        ref={ref}
        movieData={movieData}
        streamUrl={streamUrl}
        streamHeaders={streamHeaders}
        style={styles.heroView}
        onFocus={() => onFocus?.()}
        onColorExtracted={(e: any) => {
          onColorExtracted?.(e.nativeEvent?.color);
        }}
      />
    </View>
  );
});

export default React.memo(NativeHeroBanner, (prev, next) => {
  return prev.movieData === next.movieData &&
    prev.streamUrl === next.streamUrl &&
    prev.streamHeaders === next.streamHeaders &&
    prev.placeholderColor === next.placeholderColor;
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: 'transparent',
  },
  heroView: {
    width: '100%',
    height: '100%',
  },
});
