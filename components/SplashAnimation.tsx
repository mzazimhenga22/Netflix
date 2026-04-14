import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  Extrapolate,
  SharedValue
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const RIBBON_WIDTH = 42;
const N_SIZE = 130;
const N_HEIGHT = 175;

// Color palette for the 'N'
const RED_HILITE = '#E50914';
const RED_BASE = '#DB0000';
const RED_DARK = '#830A0A';

const Ribbon = ({ 
  style, 
  delay = 0, 
  duration = 500, 
  isDiagonal = false,
  skewX = '0deg',
  drawDirection = 'down',
  colors = [RED_BASE, RED_BASE]
}: { 
  style?: any, 
  delay?: number, 
  duration?: number, 
  isDiagonal?: boolean,
  skewX?: string,
  drawDirection?: 'up' | 'down',
  colors?: readonly [string, string, ...string[]]
}) => {
  const progress = useSharedValue(0);
  const glowPos = useSharedValue(-1);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { 
      duration, 
      easing: Easing.bezier(0.4, 0, 0.2, 1.2) // slight bounce
    }));

    // Start a specular shimmer down the ribbon
    glowPos.value = withDelay(delay + duration - 100, withTiming(2, { 
      duration: 1200, 
      easing: Easing.inOut(Easing.ease) 
    }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const scaleY = progress.value;
    const translateYOffset = drawDirection === 'down' 
      ? -(1 - scaleY) * (N_HEIGHT / 2) 
      : (1 - scaleY) * (N_HEIGHT / 2);
    
    return {
      height: '100%', 
      transform: [
        { skewX },
        { translateY: translateYOffset },
        { scaleY }
      ],
      opacity: interpolate(progress.value, [0, 0.1], [0, 1]),
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
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
      
      {/* Dynamic drop shadow strictly on diagonal to shade right leg */}
      {isDiagonal && (
        <LinearGradient 
          start={{x:0, y:0}} end={{x:1, y:0}}
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Spectral Glow Streamer */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <LinearGradient
          colors={[
            'transparent', 
            'rgba(255,255,255,0)', 
            'rgba(255,255,255,0.4)', 
            'rgba(255,255,255,0)',
            'transparent'
          ]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
};

// Generates the vibrant barcode-like vertical light spectra for the "Tudum" burst
const SPECTRUM_COLORS = [
  '#FF003C', '#00F0FF', '#7C00FF', '#FFE600', '#FF003C', '#00FF66'
];

const LightStreak = ({ index, zoomProgress }: { index: number, zoomProgress: SharedValue<number> }) => {
  const randomX = useMemo(() => (Math.random() - 0.5) * width * 1.5, []);
  const randomW = useMemo(() => 4 + Math.random() * 8, []);
  const color = useMemo(() => SPECTRUM_COLORS[index % SPECTRUM_COLORS.length], [index]);
  const delay = useMemo(() => Math.random() * 0.4, []);
  
  const animatedScale = useAnimatedStyle(() => {
    // Only start extending outward when zoom crosses 0.5
    const streakProgress = Math.max(0, zoomProgress.value - 0.4 - delay * 0.2) * 2;
    return {
      height: height * 1.5,
      opacity: interpolate(streakProgress, [0, 0.2, 0.8, 1], [0, 0.8, 0.8, 0]),
      transform: [
        { translateX: randomX * interpolate(streakProgress, [0, 1], [0.2, 2]) },
        { scaleY: interpolate(streakProgress, [0, 1], [0.01, 1]) }
      ]
    };
  });

  return (
    <Animated.View style={[
      styles.streak, 
      { width: randomW, backgroundColor: color }, 
      animatedScale
    ]} />
  );
};

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const containerOpacity = useSharedValue(1);
  const zoomProgress = useSharedValue(0);
  const nFade = useSharedValue(1);

  // Generate 40 random light streaks
  const streaks = useMemo(() => Array.from({ length: 40 }).map((_, i) => i), []);

  useEffect(() => {
    // 1. Draw N (0 - 1500ms)
    // 2. Initial hold
    // 3. Zoom into diagonal (approx 2000 - 3000ms)
    // 4. Burst spectrum rays
    
    // Zoom in dramatically through the N center
    zoomProgress.value = withDelay(1800, withTiming(1, {
      duration: 1500,
      easing: Easing.bezier(0.8, 0, 0.2, 1) // Exponential acceleration
    }));

    // Fade the solid N out midway through zoom so spectrum overtakes it
    nFade.value = withDelay(2400, withTiming(0, { duration: 400 }));

    // Fade out whole container to app
    containerOpacity.value = withDelay(3100, withTiming(0, {
      duration: 500
    }, (finished) => {
      if (finished) {
        runOnJS(onFinish)();
      }
    }));
  }, []);

  const zoomStyle = useAnimatedStyle(() => {
    const scale = interpolate(zoomProgress.value, [0, 1], [1, 55], Extrapolate.CLAMP);
    return {
      transform: [{ scale }],
      opacity: nFade.value
    };
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      
      {/* Light Burst Spectra array running behind the N and expanding vastly */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.burstContainer}>
          {streaks.map((i) => <LightStreak key={i} index={i} zoomProgress={zoomProgress} />)}
        </View>
      </View>

      {/* Primary N Wrapper */}
      <Animated.View style={[styles.nWrapper, zoomStyle]}>
        {/* Left Ribbon (Draws bottom -> up) */}
        <Ribbon 
          style={{ left: 0 }} 
          delay={100}
          duration={400}
          drawDirection="up"
          colors={[RED_BASE, RED_HILITE]}
        />
        
        {/* Diagonal Ribbon (Draws top -> down) OVERLAPS */}
        <Ribbon 
          isDiagonal 
          skewX="-26.8deg"
          style={{ 
            left: 44, 
            width: RIBBON_WIDTH + 4,
            zIndex: 10,
          }} 
          delay={400} 
          duration={500}
          drawDirection="down"
          colors={[RED_HILITE, RED_HILITE, RED_BASE]}
        />

        {/* Right Ribbon (Draws bottom -> up) - Darkest to simulate shadow beneath diagonal */}
        <Ribbon 
          style={{ right: 0 }} 
          delay={800} 
          duration={400}
          drawDirection="up"
          colors={[RED_DARK, RED_DARK]}
        />
      </Animated.View>

      {/* Screen flood (the flash at end of tudum) */}
      <Animated.View style={[StyleSheet.absoluteFill, useAnimatedStyle(() => ({
        backgroundColor: '#000',
        opacity: interpolate(zoomProgress.value, [0.8, 0.9, 1], [0, 1, 0])
      }))]} pointerEvents="none" />
      
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  burstContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streak: {
    position: 'absolute',
    borderRadius: 10,
    shadowColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }
  },
  nWrapper: {
    width: N_SIZE,
    height: N_HEIGHT,
    position: 'relative',
  },
  ribbonBase: {
    position: 'absolute',
    width: RIBBON_WIDTH,
    borderRadius: 2,
    overflow: 'hidden',
  }
});
