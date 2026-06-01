import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useAnimatedProps,
  withTiming, 
  withSequence, 
  withDelay, 
  runOnJS,
  interpolate,
  Extrapolate,
  Easing
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Timing constants (ms) matches the provided canvas code
const DURATION = {
  build: 1200,
  impact: 400,
  zoom: 1800,
  total: 4800 // The total sequence length
};

const THEME = {
  bg: '#000000',
  redCore: '#E50914',
  redBright: '#FF1F2F',
  redDeep: '#68040a',
};

const LOGO = {
  w: 160,
  h: 260,
  p: 48 // Pillar width
};

const THREAD_COUNT = 60;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const buildProg = useSharedValue(0);
  const zoomProg = useSharedValue(0);
  const flashProg = useSharedValue(0);

  // Generate threads once
  const threads = useMemo(() => {
    return Array.from({ length: THREAD_COUNT }, () => ({
      xOffset: (Math.random() - 0.5) * LOGO.w * 2,
      yOffset: (Math.random() - 0.5) * LOGO.h * 1.5,
      zStart: Math.random() * 2000,
      speed: 15 + Math.random() * 25,
      width: 1 + Math.random() * 3,
      color: Math.random() > 0.85 ? '#ffffff' : THEME.redCore,
      opacity: 0.1 + Math.random() * 0.4
    }));
  }, []);

  useEffect(() => {
    // 1. Build Phase
    buildProg.value = withTiming(1, { 
      duration: DURATION.build, 
      easing: Easing.bezier(0.4, 0, 0.2, 1) 
    });

    // 2. Zoom Phase (after build and impact)
    const zoomStart = DURATION.build + DURATION.impact;
    zoomProg.value = withDelay(zoomStart, withTiming(1, { 
      duration: DURATION.zoom, 
      easing: Easing.bezier(0.7, 0, 0.84, 0) // Heavy exponential-like curve
    }, (finished) => {
      if (finished && onFinish) {
        runOnJS(onFinish)();
      }
    }));

    // 3. Final Flash
    flashProg.value = withDelay(zoomStart + DURATION.zoom * 0.8, withTiming(1, { 
      duration: DURATION.zoom * 0.2 
    }));
  }, []);

  // Root container scale (dramatic zoom)
  const rootAnimatedStyle = useAnimatedStyle(() => {
    // Dramatic exponential zoom: scale = 1 / Math.max(0.001, 1 - Math.pow(zoomProg, 4))
    const zoomEase = Math.pow(zoomProg.value, 4);
    const cameraZ = Math.max(0.001, 1 - zoomEase);
    const scale = 1 / cameraZ;
    
    const opacity = interpolate(
      zoomProg.value,
      [0, 0.2, 0.5],
      [1, 1, 0],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashProg.value * 0.2,
  }));

  return (
    <View style={styles.container}>
      {/* 1. Backdrop Textures */}
      <View style={StyleSheet.absoluteFill}>
        {/* Radial Vignette */}
        <View style={styles.vignette} />
        
        {/* Vertical Grain */}
        <View style={styles.grain} />
        
        {/* Bottom Shadow */}
        <LinearGradient
          colors={['transparent', '#000000']}
          style={styles.bottomShadow}
        />
      </View>

      {/* 2. The "N" Logo Animation */}
      <Animated.View style={[styles.logoWrapper, rootAnimatedStyle]}>
        <View style={styles.logoContainer}>
          {/* Left Pillar */}
          <Pillar side="left" buildProg={buildProg} zoomProg={zoomProg} />
          
          {/* Right Pillar */}
          <Pillar side="right" buildProg={buildProg} zoomProg={zoomProg} />
          
          {/* Diagonal Ribbon */}
          <DiagonalRibbon buildProg={buildProg} />
        </View>
      </Animated.View>

      {/* 3. Thread Zoom Streaks */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {threads.map((t, i) => (
          <Thread key={i} thread={t} zoomProg={zoomProg} />
        ))}
      </View>

      {/* 4. Final Flash Overlay */}
      <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

      {/* 5. Credits (Only visible during build) */}
      <Credits buildProg={buildProg} zoomProg={zoomProg} />
    </View>
  );
}

function Pillar({ side, buildProg, zoomProg }: any) {
  const animatedStyle = useAnimatedStyle(() => {
    const scaleY = interpolate(buildProg.value, [0, 1], [0, 1], Extrapolate.CLAMP);
    return {
      transform: [{ scaleY }],
    };
  });

  return (
    <Animated.View style={[styles.pillar, side === 'left' ? styles.pillarLeft : styles.pillarRight, animatedStyle]}>
      <LinearGradient
        colors={[THEME.redDeep, THEME.redBright, THEME.redDeep]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Grain lines on pillar */}
      <View style={styles.pillarGrainContainer}>
        {[0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44].map((x) => (
          <View key={x} style={[styles.pillarGrainLine, { left: x }]} />
        ))}
      </View>
    </Animated.View>
  );
}

function DiagonalRibbon({ buildProg }: any) {
  const animatedProps = useAnimatedProps(() => {
    // Ribbon starts at 0.4 and ends at 1.0 of build phase
    const dProg = interpolate(buildProg.value, [0.4, 0.95], [0, 1], Extrapolate.CLAMP);
    
    const leftX = 0;
    const topY = 0;
    const pW = LOGO.p;
    const targetX = (LOGO.w - LOGO.p) * dProg;
    const targetY = LOGO.h * dProg;

    // We use an SVG Path to draw the trapezoid that grows
    const path = `M ${leftX} ${topY} L ${leftX + pW} ${topY} L ${targetX + pW} ${targetY} L ${targetX} ${targetY} Z`;
    
    return {
      d: path,
      opacity: dProg > 0 ? 1 : 0
    };
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width={LOGO.w} height={LOGO.h} viewBox={`0 0 ${LOGO.w} ${LOGO.h}`}>
        <Defs>
          <SvgGradient id="diagGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ff3344" />
            <Stop offset="1" stopColor="#800000" />
          </SvgGradient>
        </Defs>
        <AnimatedPath animatedProps={animatedProps} fill="url(#diagGrad)" />
      </Svg>
    </View>
  );
}

function Thread({ thread, zoomProg }: any) {
  const animatedStyle = useAnimatedStyle(() => {
    // Projection math
    const z = (thread.zStart - zoomProg.value * 2000 * (1 + thread.speed / 5)) % 2000;
    const actualZ = z < 0 ? z + 2000 : z;
    const pScale = 600 / Math.max(1, actualZ);
    const tx = SCREEN_W / 2 + thread.xOffset * pScale;
    
    const opacity = (zoomProg.value === 0) ? 0 : interpolate(
      actualZ,
      [0, 500, 2000],
      [0, thread.opacity, 0],
      Extrapolate.CLAMP
    ) * (1 - zoomProg.value);

    return {
      opacity,
      transform: [
        { translateX: tx - (thread.width * pScale) / 2 },
        { scaleX: pScale },
      ] as any,
      width: thread.width,
      height: SCREEN_H * 2,
      top: -SCREEN_H,
      backgroundColor: thread.color,
      position: 'absolute',
    };
  });

  return <Animated.View style={animatedStyle} />;
}

function Credits({ buildProg, zoomProg }: any) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      zoomProg.value,
      [0, 0.1],
      [1, 0],
      Extrapolate.CLAMP
    );
    const translateY = interpolate(buildProg.value, [0, 1], [20, 0], Extrapolate.CLAMP);
    
    return {
      opacity: opacity * buildProg.value,
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.View style={[styles.creditWrap, animatedStyle]}>
      <View style={styles.creditBadge}>
        <LinearGradient
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.creditEyebrow}>crafted for the big screen</Text>
        <Text style={styles.creditName}>made by mzazimhenga</Text>
        <View style={styles.creditAccent} />
      </View>
    </Animated.View>
  );
}

export default SplashAnimation;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // Radial gradient simulation using a large round view if needed, 
    // but typically a dark overlay with opacity works well.
    borderWidth: SCREEN_W / 3,
    borderColor: 'rgba(0,0,0,0.8)',
    borderRadius: SCREEN_W,
    transform: [{ scale: 2 }],
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
    backgroundColor: 'transparent',
    // Simulate vertical grain with thin repeating lines
    borderLeftWidth: 1,
    borderLeftColor: '#ffffff',
    width: 2,
  },
  bottomShadow: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '25%',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: LOGO.w,
    height: LOGO.h,
    position: 'relative',
  },
  pillar: {
    position: 'absolute',
    bottom: 0,
    width: LOGO.p,
    height: LOGO.h,
    transformOrigin: 'bottom',
    overflow: 'hidden',
    borderRadius: 2,
  },
  pillarLeft: {
    left: 0,
  },
  pillarRight: {
    right: 0,
  },
  pillarGrainContainer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
  },
  pillarGrainLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#000000',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
  creditWrap: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  creditBadge: {
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  creditEyebrow: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 14,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  creditName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  creditAccent: {
    marginTop: 14,
    width: 92,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E50914',
  },
});

