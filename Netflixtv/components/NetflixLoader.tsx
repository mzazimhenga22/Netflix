import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

interface NetflixLoaderProps {
  size?: number;
  color?: string;
  withPercentage?: boolean; // kept for API compat, ignored
}

// Pure UI-thread Netflix spinner. Zero JS thread overhead.
export function NetflixLoader({ 
  size = 60, 
  color = '#E50914',
}: NetflixLoaderProps) {
  const rotation = useSharedValue(0);

  const ringSize = size * 0.85;
  const ringBorder = size * 0.06;

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => cancelAnimation(rotation);
  }, []);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View 
        style={[
          styles.ring, 
          spinnerStyle,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: ringBorder,
            borderColor: 'rgba(255,255,255,0.1)',
            borderTopColor: color,
            borderRightColor: color,
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
  },
  textContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 2,
  },
  percentageText: {
    color: '#FFFFFF',
    fontWeight: '900',
  }
});
