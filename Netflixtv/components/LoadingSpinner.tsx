import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface LoadingSpinnerProps {
  size?: number;
  label?: string;
  fullScreen?: boolean;
  progress?: number | null;
  tone?: 'default' | 'light';
}

export default function LoadingSpinner({
  size = 84,
  label,
  fullScreen = false,
  progress = null,
  tone = 'default',
}: LoadingSpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1100,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => cancelAnimation(rotation);
  }, []);

  const cometStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const headSize = size * 0.16;
  const tailWidth = size * 0.42;
  const tailHeight = Math.max(8, size * 0.11);

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <View style={[styles.spinnerFrame, { width: size, height: size }]}>
        <Animated.View style={[styles.cometOrbit, cometStyle]}>
          <View
            style={[
              styles.cometTail,
              {
                width: tailWidth,
                height: tailHeight,
                borderRadius: tailHeight / 2,
                top: size * 0.5 - tailHeight / 2,
                left: size * 0.5 - tailWidth + headSize * 0.6,
              },
            ]}
          />
          <View
            style={[
              styles.cometGlow,
              {
                width: headSize * 2.1,
                height: headSize * 2.1,
                borderRadius: headSize,
                top: size * 0.5 - headSize * 1.05,
                left: size - headSize * 1.85,
              },
            ]}
          />
          <View
            style={[
              styles.cometHead,
              {
                width: headSize,
                height: headSize,
                borderRadius: headSize / 2,
                top: size * 0.5 - headSize / 2,
                left: size - headSize * 1.35,
              },
            ]}
          />
        </Animated.View>

        {typeof progress === 'number' ? (
          <View style={styles.progressOverlay}>
            <Text
              style={[
                styles.progressText,
                tone === 'light' && styles.progressTextLight,
                { fontSize: Math.max(12, size * 0.18) },
              ]}
            >
              {`${Math.max(1, Math.min(100, Math.round(progress)))}%`}
            </Text>
          </View>
        ) : null}
      </View>

      {label ? (
        <Text style={[styles.label, tone === 'light' && styles.labelLight]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  spinnerFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cometOrbit: {
    ...StyleSheet.absoluteFillObject,
  },
  cometTail: {
    position: 'absolute',
    backgroundColor: 'rgba(229,9,20,0.18)',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  cometGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(229,9,20,0.25)',
  },
  cometHead: {
    position: 'absolute',
    backgroundColor: '#E50914',
    shadowColor: '#E50914',
    shadowOpacity: 0.85,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  label: {
    marginTop: 18,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  labelLight: {
    color: 'rgba(255,255,255,0.9)',
  },
  progressText: {
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  progressTextLight: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
