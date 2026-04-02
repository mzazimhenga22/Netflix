import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const RIBBON_WIDTH = 40;
const N_SIZE = 120;
const N_HEIGHT = 160;

const Ribbon = ({ 
  style, 
  delay = 0, 
  duration = 800, 
  isDiagonal = false,
  skewX = '0deg'
}: { 
  style?: any, 
  delay?: number, 
  duration?: number, 
  isDiagonal?: boolean,
  skewX?: string
}) => {
  const progress = useSharedValue(0);
  const glowPos = useSharedValue(-1);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { 
      duration, 
      easing: Easing.bezier(0.4, 0, 0.2, 1) 
    }));

    glowPos.value = withDelay(delay + 400, withTiming(2, { 
      duration: 1500, 
      easing: Easing.linear 
    }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const scaleY = progress.value;
    const opacity = interpolate(progress.value, [0, 0.2], [0, 1]);
    
    return {
      height: '100%', 
      transform: [
        { skewX },
        { scaleY },
        { translateY: isDiagonal ? 0 : (1 - scaleY) * (N_HEIGHT / 2) * (style?.bottom === 0 ? 1 : -1) }
      ],
      opacity,
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const translateY = interpolate(glowPos.value, [0, 2], [-N_HEIGHT, N_HEIGHT]);
    return {
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.View style={[styles.ribbonBase, style, animatedStyle]}>
      <LinearGradient
        colors={['#E50914', '#B20710', '#E50914']}
        style={StyleSheet.absoluteFill}
      />
      {/* Spectral Glow Streamer */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <LinearGradient
          colors={[
            'transparent', 
            'rgba(255, 255, 255, 0)', 
            'rgba(255, 255, 255, 0.1)', 
            'rgba(255, 50, 50, 0.3)',
            'rgba(255, 255, 255, 0.1)',
            'rgba(255, 255, 255, 0)',
            'transparent'
          ]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
};

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const containerScale = useSharedValue(1);
  const containerOpacity = useSharedValue(1);
  const zoomProgress = useSharedValue(0);

  useEffect(() => {
    // Total animation time is approx 2.5s
    const totalDuration = 2800;
    
    // Zoom in dramatically through the N center
    zoomProgress.value = withDelay(2000, withTiming(1, {
      duration: 1000,
      easing: Easing.bezier(0.7, 0, 0.84, 0)
    }));

    containerOpacity.value = withDelay(2600, withTiming(0, {
      duration: 400
    }, (finished) => {
      if (finished) {
        runOnJS(onFinish)();
      }
    }));
  }, []);

  const zoomStyle = useAnimatedStyle(() => {
    const scale = interpolate(zoomProgress.value, [0, 1], [1, 50], Extrapolate.CLAMP);
    const opacity = interpolate(zoomProgress.value, [0.8, 1], [1, 0]);
    
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.View style={[styles.nWrapper, zoomStyle]}>
        {/* Left Ribbon */}
        <Ribbon 
          style={{ left: 0, bottom: 0 }} 
          delay={100} 
        />
        
        {/* Right Ribbon */}
        <Ribbon 
          style={{ right: 0, top: 0 }} 
          delay={600} 
        />
        
        {/* Diagonal Ribbon (Middle) */}
        <Ribbon 
          isDiagonal 
          skewX="-26.565deg"
          style={{ 
            left: 40, 
            top: 0,
            width: RIBBON_WIDTH,
            zIndex: 2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
          }} 
          delay={350} 
          duration={700}
        />
      </Animated.View>

      {/* Subtle background light explosion during zoom */}
      <Animated.View style={[styles.lightBurst, useAnimatedStyle(() => ({
        opacity: interpolate(zoomProgress.value, [0.4, 0.8], [0, 0.3]),
        transform: [{ scale: interpolate(zoomProgress.value, [0.4, 1], [0.5, 2]) }]
      }))]}>
        <LinearGradient
          colors={['rgba(229, 9, 20, 0.5)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  nWrapper: {
    width: N_SIZE,
    height: N_HEIGHT,
    position: 'relative',
  },
  ribbonBase: {
    position: 'absolute',
    width: RIBBON_WIDTH,
    backgroundColor: '#E50914',
    borderRadius: 2,
    overflow: 'hidden',
  },
  lightBurst: {
    position: 'absolute',
    width: width,
    height: width,
    borderRadius: width / 2,
    zIndex: -1,
  }
});
