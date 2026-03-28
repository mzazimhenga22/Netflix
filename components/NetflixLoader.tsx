import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  withSequence,
  Easing,
  cancelAnimation,
  useAnimatedProps,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface NetflixLoaderProps {
  size?: number;
  color?: string;
  withPercentage?: boolean;
}

export function NetflixLoader({ 
  size = 60, 
  color = '#E50914', 
  withPercentage = false 
}: NetflixLoaderProps) {
  const rotation = useSharedValue(0);
  const strokeOffset = useSharedValue(0);
  const [percentage, setPercentage] = useState(0);

  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    // Continuous rotation
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    // Liquid stretch effect (animating the stroke-dashoffset)
    strokeOffset.value = withRepeat(
      withSequence(
        withTiming(circumference * 0.8, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
        withTiming(0, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.2, 1) })
      ),
      -1,
      true
    );

    let interval: NodeJS.Timeout;
    if (withPercentage) {
      interval = setInterval(() => {
        setPercentage(p => {
          if (p >= 99) return 99;
          const inc = Math.floor(Math.random() * 5) + 1;
          return Math.min(p + inc, 99);
        });
      }, 300);
    }

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(strokeOffset);
      if (interval) clearInterval(interval);
    };
  }, [withPercentage, circumference]);

  const animatedRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeOffset.value,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.spinner, animatedRotationStyle]}>
        <Svg width={size} height={size}>
          {/* Background Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Active Spinner Arc */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedCircleProps}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      
      {withPercentage && (
        <View style={styles.textContainer}>
          <Text style={[styles.percentageText, { fontSize: size * 0.28 }]}>
            {percentage}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    position: 'absolute',
  },
  textContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 2, // Slight adjustment for optical centering
  },
  percentageText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontFamily: 'System', // Closest to Netflix Sans
  }
});
