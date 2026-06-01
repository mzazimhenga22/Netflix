import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { 
  Path, 
  Defs, 
  LinearGradient, 
  Stop, 
  Filter, 
  FeGaussianBlur, 
  FeMerge, 
  FeMergeNode 
} from 'react-native-svg';

// Generates a path that physically tapers from a thick leading head to a razor-thin trailing tail.
const getTaperedArcPath = (
  cx: number,
  cy: number,
  rOut: number,
  startAngleDeg: number,
  endAngleDeg: number,
  maxThick: number,
  minThick: number
): string => {
  const pointsOuter: string[] = [];
  const pointsInner: string[] = [];
  const steps = 60;
  
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 (tail sharp point) to 1 (head thick rounded cap)
    const angle = startRad + t * (endRad - startRad);
    
    // Interpolate thickness non-linearly to create an elegant comet sweep
    const thickness = minThick + (maxThick - minThick) * Math.pow(t, 1.8);
    const rIn = rOut - thickness;
    
    // Outer arc points
    const xOut = cx + rOut * Math.cos(angle);
    const yOut = cy + rOut * Math.sin(angle);
    pointsOuter.push(`${xOut.toFixed(3)},${yOut.toFixed(3)}`);
    
    // Inner arc points (drawn in reverse to construct a closed vector polygon)
    const xIn = cx + rIn * Math.cos(angle);
    const yIn = cy + rIn * Math.sin(angle);
    pointsInner.unshift(`${xIn.toFixed(3)},${yIn.toFixed(3)}`);
  }
  
  // Build path commands
  let d = `M ${pointsOuter[0]}`;
  for (let i = 1; i < pointsOuter.length; i++) {
    d += ` L ${pointsOuter[i]}`;
  }
  
  // Draw the rounded cap at the thickest leading edge
  const capRadius = maxThick / 2;
  const targetPoint = pointsInner[0];
  d += ` A ${capRadius} ${capRadius} 0 0 1 ${targetPoint}`;
  
  for (let i = 1; i < pointsInner.length; i++) {
    d += ` L ${pointsInner[i]}`;
  }
  
  d += ' Z';
  return d;
};

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
  const [percentage, setPercentage] = useState(0);

  // Generate paths once using useMemo. 
  // ViewBox is fixed to 0 0 100 100, so paths don't depend on `size` prop.
  const pathDataMain = useMemo(() => {
    return getTaperedArcPath(50, 50, 42, -180, -180 + 185, 7.5, 0.5);
  }, []);

  const pathDataGlow = useMemo(() => {
    return getTaperedArcPath(50, 50, 42, -180, -180 + 185, 7.5 + 1.5, 0.2);
  }, []);

  useEffect(() => {
    // Smooth infinite rotation matching reference
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1250,
        easing: Easing.linear,
      }),
      -1,
      false
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
      if (interval) clearInterval(interval);
    };
  }, [withPercentage, rotation]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.spinner, spinnerStyle, { width: size, height: size }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
          <Defs>
            {/* Volumetric Neon Glow filter matching netflix_spinner_still.png */}
            <Filter id="netflix-neon-glow" x="-50%" y="-50%" width="200%" height="200%">
              <FeGaussianBlur in="SourceGraphic" stdDeviation={6.5} result="blur" />
              <FeMerge>
                <FeMergeNode in="blur" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>

            {/* Smooth fading gradient as the comet tail wraps backwards */}
            <LinearGradient id="taper-gradient-fill" x1="1" y1="1" x2="0" y2="0">
              <Stop offset="0%" stopColor={color} stopOpacity="1" />
              <Stop offset="40%" stopColor={color} stopOpacity="0.95" />
              <Stop offset="80%" stopColor={color} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* LAYER 1: Ambient Neon Bloom Backdrop (Soft Blurred Copy) */}
          <Path
            d={pathDataGlow}
            fill="url(#taper-gradient-fill)"
            filter="url(#netflix-neon-glow)"
            opacity={0.85}
          />

          {/* LAYER 2: Razor Crisp Core Foreground */}
          <Path
            d={pathDataMain}
            fill="url(#taper-gradient-fill)"
          />
        </Svg>
      </Animated.View>
      
      {withPercentage && (
        <View style={styles.textContainer}>
          <Text style={[styles.percentageText, { fontSize: size * 0.22 }]} numberOfLines={1}>
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
    position: 'relative',
  },
  spinner: {
    position: 'absolute',
  },
  glowBacklight: {
    position: 'absolute',
    transform: [{ scale: 1.2 }],
    // Pure CSS blur filter behaves beautifully on platforms that support it, 
    // and falls back gracefully as a subtle red ambient overlay on others.
    shadowColor: '#E50914',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  textContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  percentageText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontFamily: 'System',
    textAlign: 'center',
  }
});
