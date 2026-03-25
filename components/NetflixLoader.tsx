import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  cancelAnimation
} from 'react-native-reanimated';

interface NetflixLoaderProps {
  size?: number;
  color?: string;
  withPercentage?: boolean;
}

export function NetflixLoader({ 
  size = 50, 
  color = '#E50914', 
  withPercentage = false 
}: NetflixLoaderProps) {
  const rotation = useSharedValue(0);
  const [percentage, setPercentage] = useState(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    let interval: NodeJS.Timeout;
    if (withPercentage) {
      interval = setInterval(() => {
        setPercentage(p => {
          if (p >= 99) {
            clearInterval(interval);
            return 99; // Cap at 99 while buffering
          }
          // Increment randomly to feel like real buffering
          return p + Math.floor(Math.random() * 10) + 1;
        });
      }, 200);
    }

    return () => {
      cancelAnimation(rotation);
      if (interval) clearInterval(interval);
    };
  }, [withPercentage]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View 
        style={[
          styles.spinner, 
          { 
            width: size, 
            height: size, 
            borderRadius: size / 2,
            borderWidth: size / 10,
            borderTopColor: color,
            borderRightColor: color,
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
          },
          animatedStyle
        ]} 
      />
      {withPercentage && (
        <View style={styles.textContainer}>
          <Text style={[styles.percentageText, { fontSize: size * 0.3 }]}>
            {percentage}
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
  },
  percentageText: {
    color: '#E50914',
    fontWeight: 'bold',
  }
});
