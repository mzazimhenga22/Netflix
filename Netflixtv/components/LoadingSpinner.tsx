import React, { useEffect, useMemo } from 'react';
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
  const color = '#E50914'; // Netflix Brand Crimson

  // Generate paths once using useMemo.
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

    return () => cancelAnimation(rotation);
  }, [rotation]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <View style={[styles.spinnerFrame, { width: size, height: size }]}>
        {/* Ambient static blur glow underneath the spinner */}
        <View 
          style={[
            styles.glowBacklight,
            {
              width: size * 1.5,
              height: size * 1.5,
              borderRadius: (size * 1.5) / 2,
              backgroundColor: color,
              opacity: 0.15,
            }
          ]}
        />
        
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
        
        {typeof progress === 'number' ? (
          <View style={styles.progressOverlay}>
            <Text
              style={[
                styles.progressText,
                tone === 'light' && styles.progressTextLight,
                { fontSize: Math.max(12, size * 0.18) },
              ]}
              numberOfLines={1}
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
    backgroundColor: '#000000',
  },
  spinnerFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  spinner: {
    position: 'absolute',
  },
  glowBacklight: {
    position: 'absolute',
    transform: [{ scale: 1.2 }],
    shadowColor: '#E50914',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
    fontFamily: 'System',
    textAlign: 'center',
  },
  progressTextLight: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
