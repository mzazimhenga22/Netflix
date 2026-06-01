import React, { Component, forwardRef } from 'react';
import { View, StyleSheet, requireNativeComponent, ViewStyle, Text } from 'react-native';
import HeroSkeleton from './HeroSkeleton';

interface TvHeroBannerViewProps {
  movieData: string;
  streamUrl?: string;
  streamHeaders?: string;
  isScreenActive?: boolean;
  onBannerFocus?: (event: any) => void;
  onBannerPress?: (event: any) => void;
  onMyListPress?: (event: any) => void;
  onColorExtracted?: (event: any) => void;
  style?: ViewStyle;
}

class ErrorBoundary extends Component<{ children: React.ReactNode, pageColor?: string }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.warn("NativeHeroBanner Error:", error); }
  render() {
    if (this.state.hasError) {
      return <HeroSkeleton pageColor={this.props.pageColor} />;
    }
    return this.props.children;
  }
}

const NativeTvHeroBanner = requireNativeComponent<TvHeroBannerViewProps>('TvHeroBanner');

interface NativeHeroBannerProps {
  movieData: string;
  streamUrl?: string;
  streamHeaders?: string;
  isScreenActive?: boolean;
  placeholderColor?: string; // Kept for interface compatibility, but unused natively
  useSkeleton?: boolean; // Debug flag to force skeleton
  onColorExtracted?: (color: string) => void;
  onFocus?: () => void;
  onPress?: () => void;
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
  isScreenActive = true,
  placeholderColor,
  useSkeleton,
  onColorExtracted,
  onFocus,
  onPress,
  style,
}, ref) {
  if (useSkeleton) {
    return <HeroSkeleton pageColor={placeholderColor} style={style} />;
  }

  return (
    <ErrorBoundary pageColor={placeholderColor}>
      <View style={[styles.container, style]}>
        <NativeTvHeroBanner
          ref={ref}
          movieData={movieData}
          streamUrl={streamUrl}
          streamHeaders={streamHeaders}
          isScreenActive={isScreenActive}
          style={styles.heroView}
          onBannerFocus={() => onFocus?.()}
          onBannerPress={() => onPress?.()}
          onMyListPress={() => {
            // Can be implemented to add to my list later
          }}
          onColorExtracted={(e: any) => {
            onColorExtracted?.(e.nativeEvent?.color);
          }}
        />
      </View>
    </ErrorBoundary>
  );
});

export default React.memo(NativeHeroBanner, (prev, next) => {
  return prev.movieData === next.movieData &&
    prev.streamUrl === next.streamUrl &&
    prev.streamHeaders === next.streamHeaders &&
    prev.isScreenActive === next.isScreenActive &&
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
  errorFallback: {
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#444',
    fontSize: 12,
  },
});
