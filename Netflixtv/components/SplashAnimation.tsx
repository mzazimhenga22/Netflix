import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Timing constants (ms)
const BUILD_DURATION = 1000;
const HOLD_DURATION = 200;
const ZOOM_DURATION = 1800;
const FADE_DURATION = 400;
const TOTAL_DURATION = BUILD_DURATION + HOLD_DURATION + ZOOM_DURATION + FADE_DURATION;

// Logo proportions
const LOGO_W = 120;
const LOGO_H = 200;
const PILLAR_W = 36;

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  // All animations use native driver for 60fps on UI thread
  const buildProg = useRef(new Animated.Value(0)).current;
  const zoomScale = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const screenFlash = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const diagProg = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      // Phase 1: Build the N — pillars grow up, diagonal slides in
      Animated.parallel([
        Animated.timing(buildProg, {
          toValue: 1,
          duration: BUILD_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(diagProg, {
          toValue: 1,
          duration: BUILD_DURATION,
          delay: BUILD_DURATION * 0.3,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      // Phase 2: Hold — brief pause with glow pulse
      Animated.parallel([
        Animated.timing(glowOpacity, {
          toValue: 0.6,
          duration: HOLD_DURATION,
          useNativeDriver: true,
        }),
        Animated.delay(HOLD_DURATION),
      ]),

      // Phase 3: Zoom into the N and fade out
      Animated.parallel([
        Animated.timing(zoomScale, {
          toValue: 25,
          duration: ZOOM_DURATION,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: ZOOM_DURATION * 0.6,
          delay: ZOOM_DURATION * 0.15,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: ZOOM_DURATION * 0.5,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(ZOOM_DURATION * 0.7),
          Animated.timing(screenFlash, {
            toValue: 1,
            duration: FADE_DURATION,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    sequence.start(() => {
      if (onFinish) onFinish();
    });

    return () => sequence.stop();
  }, []);

  // Pillar height animated via scaleY (native driver compatible)
  const pillarScale = buildProg;

  return (
    <View style={styles.container}>
      {/* Vignette background */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      {/* Logo container — zooms and fades */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: zoomScale }],
            opacity: logoOpacity,
          },
        ]}
      >
        {/* Glow behind the N */}
        <Animated.View
          style={[
            styles.glow,
            { opacity: glowOpacity },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(229,9,20,0.3)', 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>

        {/* Left pillar */}
        <Animated.View
          style={[
            styles.pillarLeft,
            {
              transform: [{ scaleY: pillarScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['#b00710', '#FF1F2F', '#b00710']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        </Animated.View>

        {/* Right pillar */}
        <Animated.View
          style={[
            styles.pillarRight,
            {
              transform: [{ scaleY: pillarScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['#b00710', '#FF1F2F', '#b00710']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        </Animated.View>

        {/* Diagonal ribbon */}
        <Animated.View
          style={[
            styles.diagonal,
            {
              opacity: diagProg,
              transform: [
                { scaleY: diagProg },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['#ff3344', '#E50914', '#68040a']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.creditWrap,
          {
            opacity: logoOpacity,
            transform: [{ translateY: Animated.multiply(Animated.subtract(1, buildProg), 22) }],
          },
        ]}
      >
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

      {/* Screen flash at the end */}
      <Animated.View
        style={[
          styles.flash,
          { opacity: screenFlash },
        ]}
        pointerEvents="none"
      />
    </View>
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
  },
  logoContainer: {
    width: LOGO_W,
    height: LOGO_H,
    position: 'relative',
  },
  creditWrap: {
    position: 'absolute',
    top: SCREEN_H * 0.5 + LOGO_H * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBadge: {
    minWidth: 380,
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
  glow: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    left: -60,
    right: -60,
    borderRadius: 80,
  },
  pillarLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: PILLAR_W,
    height: LOGO_H,
    transformOrigin: 'bottom',
    borderRadius: 2,
    overflow: 'hidden',
  },
  pillarRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: PILLAR_W,
    height: LOGO_H,
    transformOrigin: 'bottom',
    borderRadius: 2,
    overflow: 'hidden',
  },
  diagonal: {
    position: 'absolute',
    top: 0,
    left: PILLAR_W * 0.15,
    width: LOGO_W - PILLAR_W * 0.3,
    height: LOGO_H,
    transformOrigin: 'top',
    // Skew the diagonal to connect left-top to right-bottom
    transform: [{ skewX: '-22deg' }],
    borderRadius: 2,
    overflow: 'hidden',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
