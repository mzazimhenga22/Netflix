import { Tabs } from 'expo-router';
import React, { useEffect, useCallback, memo, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View, Text, Pressable, useWindowDimensions, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/* ── Individual Liquid Tab Button (Main Bar) ── */
const LiquidTabButton = memo(({ route, isFocused, themeColor, onPress, onLongPress, avatar, label }: any) => {
  const scale = useSharedValue(isFocused ? 1.06 : 0.96);
  const opacity = useSharedValue(isFocused ? 1 : 0.85);
  const isFirstRender = React.useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scale.value = withSpring(isFocused ? 1.06 : 0.96, {
      damping: 15,
      stiffness: 180,
    });
    opacity.value = withTiming(isFocused ? 1 : 0.85, { duration: 200 });
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const activeColor = themeColor || '#E50914';
  const inactiveColor = 'rgba(255,255,255,0.88)';
  const color = isFocused ? activeColor : inactiveColor;

  let icon = null;
  if (route.name === 'home') {
    icon = (
      <Ionicons
        name={isFocused ? 'home' : 'home-outline'}
        size={20}
        color={color}
      />
    );
  } else if (route.name === 'search') {
    icon = (
      <Ionicons
        name={isFocused ? 'search' : 'search-outline'}
        size={20}
        color={color}
      />
    );
  } else if (route.name === 'new') {
    icon = (
      <MaterialCommunityIcons
        name={isFocused ? 'play-box-multiple' : 'play-box-multiple-outline'}
        size={20}
        color={color}
      />
    );
  } else if (route.name === 'social') {
    icon = (
      <Ionicons
        name={isFocused ? 'people' : 'people-outline'}
        size={20}
        color={color}
      />
    );
  } else if (route.name === 'my-netflix') {
    icon = (
      <Animated.Image
        source={avatar}
        style={[
          lgStyles.avatar,
          {
            borderColor: isFocused
              ? '#FFFFFF'
              : 'rgba(255,255,255,0.25)',
          },
        ]}
      />
    );
  }

  const handlePress = () => {
    onPress(route.name, route.key, isFocused);
  };

  const handleLongPress = () => {
    onLongPress(route.key);
  };

  return (
    <Pressable
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={lgStyles.tabBtn}
    >
      <Animated.View style={[lgStyles.tabContentWrap, animatedStyle]}>
        <View style={lgStyles.iconWrap}>{icon}</View>
        <Text
          style={[
            lgStyles.label,
            {
              color,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/* ── Individual Liquid Tab Button (Mini Bar) ── */
const LiquidMiniTabButton = memo(({ isFocused, themeColor, onPress, iconName, label, index = 0 }: any) => {
  const scale = useSharedValue(isFocused ? 1.06 : 0.96);
  const opacity = useSharedValue(isFocused ? 1 : 0.85);
  const isFirstRender = useRef(true);

  // Continuous floating / levitation animation
  const floatY = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    // Stagger the float per button index for organic feel
    const delay = index * 400;
    floatY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(3, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
    // Subtle glow pulse
    glowPulse.value = withDelay(
      delay + 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isFocused) {
      // Bouncy entrance when selected
      scale.value = withSequence(
        withTiming(1.18, { duration: 120 }),
        withSpring(1.06, { damping: 8, stiffness: 200 })
      );
    } else {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 180 });
    }
    opacity.value = withTiming(isFocused ? 1 : 0.85, { duration: 200 });
  }, [isFocused]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.15, 0.45]),
  }));

  const activeColor = themeColor || '#E50914';
  const color = isFocused ? activeColor : 'rgba(255,255,255,0.80)';

  return (
    <Animated.View style={[lgStyles.miniCapsuleContainer, containerAnimStyle]}>
      {/* Capsule Shadow */}
      <View style={lgStyles.miniShadowLayer} />

      {/* Dynamic Ambient Glow — now animated */}
      <Animated.View 
        style={[
          lgStyles.miniAmbientShadowLayer, 
          { shadowColor: isFocused ? '#00E5FF' : 'transparent' },
          glowAnimStyle,
        ]} 
      />

      <Pressable onPress={onPress} style={lgStyles.miniGlassBody}>
        {/* Glass Blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="default"
          style={StyleSheet.absoluteFill}
        />
        <View style={lgStyles.tintFill} />

        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.07)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.07)',
            'rgba(0,0,0,0.20)',
          ]}
          locations={[0, 0.1, 0.25, 0.75, 0.9, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={lgStyles.convexVignetteMini}
          pointerEvents="none"
        />

        {/* Convex dome – vertical center-bright */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.convexCenterBandMini}
          pointerEvents="none"
        />

        {/* Specular Glint */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim highlight
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.specularHighlight}
          pointerEvents="none"
        />

        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.innerShadow}
          pointerEvents="none"
        />

        {/* Refraction edge line */}
        <View style={lgStyles.glassRefractionMini} pointerEvents="none" />

        {/* Outer glass border */}
        <View style={lgStyles.glassBorder} pointerEvents="none" />

        {/* Active background glow */}
        {isFocused && (
          <View style={StyleSheet.absoluteFill}>
            <View style={lgStyles.pillTint} />
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.25)',
                'transparent',
                'rgba(255,255,255,0.12)',
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}

        <Animated.View style={[lgStyles.tabContentWrap, contentAnimStyle]}>
          <View style={lgStyles.iconWrap}>
            <MaterialCommunityIcons
              name={iconName}
              size={16}
              color={isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.80)'}
            />
          </View>
          <Text
            style={[
              lgStyles.miniLabel,
              {
                color,
                fontWeight: isFocused ? '700' : '500',
              },
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/* ── My Netflix Glass Button Component (Circular Floating) ── */
const MyNetflixGlassButton = memo(({ isFocused, themeColor, onPress, avatar }: any) => {
  const scale = useSharedValue(isFocused ? 1.08 : 0.96);
  const opacity = useSharedValue(isFocused ? 1 : 0.85);
  const isFirstRender = useRef(true);

  // Breathing glow ring
  const breathe = useSharedValue(0);
  // Ripple ring on activation
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);
  // Icon wiggle rotation
  const iconRotate = useSharedValue(0);

  useEffect(() => {
    // Continuous breathing pulse
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isFocused) {
      // Bouncy scale up
      scale.value = withSequence(
        withTiming(1.2, { duration: 100 }),
        withSpring(1.08, { damping: 8, stiffness: 220 })
      );
      // Icon wiggle
      iconRotate.value = withSequence(
        withTiming(-15, { duration: 80 }),
        withTiming(12, { duration: 80 }),
        withTiming(-8, { duration: 60 }),
        withSpring(0, { damping: 6, stiffness: 200 })
      );
      // Ripple ring burst
      rippleScale.value = 0.5;
      rippleOpacity.value = 0.7;
      rippleScale.value = withTiming(2.2, { duration: 600, easing: Easing.out(Easing.cubic) });
      rippleOpacity.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    } else {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 180 });
      iconRotate.value = withSpring(0, { damping: 12, stiffness: 120 });
    }
    opacity.value = withTiming(isFocused ? 1 : 0.85, { duration: 200 });
  }, [isFocused]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const breatheGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.0, 0.6]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.92, 1.08]) }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const activeColor = themeColor || '#E50914';

  return (
    <View style={lgStyles.searchContainer}>
      {/* Shadow */}
      <View style={lgStyles.shadowLayer} />

      {/* Breathing glow ring */}
      <Animated.View
        style={[
          lgStyles.searchBreathRing,
          { borderColor: activeColor },
          breatheGlowStyle,
        ]}
        pointerEvents="none"
      />

      {/* Ripple burst ring */}
      <Animated.View
        style={[
          lgStyles.searchRippleRing,
          { borderColor: activeColor },
          rippleStyle,
        ]}
        pointerEvents="none"
      />

      {/* Ambient color bleed */}
      <View 
        style={[
          lgStyles.ambientShadowLayer, 
          { shadowColor: isFocused ? activeColor : 'transparent' }
        ]} 
      />

      <Pressable onPress={onPress} style={lgStyles.searchGlassBody}>
        {/* Real-time blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="default"
          style={StyleSheet.absoluteFill}
        />
        <View style={lgStyles.tintFill} />

        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.22)',
            'rgba(0,0,0,0.08)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.08)',
            'rgba(0,0,0,0.22)',
          ]}
          locations={[0, 0.12, 0.28, 0.72, 0.88, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={lgStyles.convexVignetteCircle}
          pointerEvents="none"
        />

        {/* Convex dome – vertical center-bright */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.convexCenterBandCircle}
          pointerEvents="none"
        />

        {/* Specular */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim highlight
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.specularHighlight}
          pointerEvents="none"
        />

        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={lgStyles.innerShadow}
          pointerEvents="none"
        />

        {/* Circular glass refraction glint */}
        <View style={lgStyles.glassRefractionSearch} pointerEvents="none" />

        {/* Glass border */}
        <View style={lgStyles.glassBorder} pointerEvents="none" />

        {/* Active Pill background (if selected, we show a full inner glow) */}
        {isFocused && (
          <View style={StyleSheet.absoluteFill}>
            <View style={lgStyles.pillTint} />
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.30)',
                'transparent',
                'rgba(255,255,255,0.15)',
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}

        {/* Avatar Image — with wiggle + scale */}
        <Animated.View style={[lgStyles.searchIconWrap, iconAnimStyle]}>
          <Animated.Image
            source={avatar}
            style={[
              lgStyles.avatarCircle,
              {
                borderColor: isFocused
                  ? '#FFFFFF'
                  : 'rgba(255,255,255,0.25)',
              },
            ]}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
});

/* ── Custom Liquid Glass Tab Bar Component ── */
function LiquidGlassTabBar({ state, descriptors, navigation }: any) {
  const { width: windowWidth } = useWindowDimensions();
  const { selectedProfile } = useProfile();
  const { themeColor } = useTheme();
  
  const visibleRoutes = useMemo(() => {
    return state.routes.filter((route: any) => {
      const { options } = descriptors[route.key];
      // Hide games, clips AND my-netflix from the main tab bar's flex row
      if (['games', 'clips', 'my-netflix'].includes(route.name)) {
        return false;
      }
      return options.href !== null;
    });
  }, [state.routes, descriptors]);

  const activeIndex = useMemo(() => {
    return visibleRoutes.findIndex(
      (r: any) => r.name === state.routes[state.index].name
    );
  }, [visibleRoutes, state.routes, state.index]);
  
  const paddingH = 6;
  const { mainBarWidth, tabWidth } = useMemo(() => {
    const containerWidth = windowWidth - 32;
    const searchBtnSize = 64;
    const gap = 12;
    const mainBarW = containerWidth - searchBtnSize - gap;
    const contentWidth = mainBarW - paddingH * 2;
    const tabW = contentWidth / visibleRoutes.length;
    return { mainBarWidth: mainBarW, tabWidth: tabW };
  }, [windowWidth, visibleRoutes.length, paddingH]);

  const pillX = useSharedValue(activeIndex >= 0 ? activeIndex * tabWidth : 0);
  const prevIndex = useSharedValue(activeIndex);
  const pillScaleX = useSharedValue(1);
  const pillSkewX = useSharedValue(0);

  // Sheen sweep reflection
  const sheenX = useSharedValue(-200);

  useEffect(() => {
    if (activeIndex >= 0) {
      pillX.value = withSpring(activeIndex * tabWidth, {
        damping: 24,
        stiffness: 200,
        mass: 0.8,
      });

      const diff = activeIndex - prevIndex.value;
      if (diff !== 0) {
        const direction = diff > 0 ? 1 : -1;
        pillSkewX.value = withSequence(
          withTiming(direction * -10, { duration: 100 }),
          withSpring(0, { damping: 10, stiffness: 120 })
        );
        pillScaleX.value = withSequence(
          withTiming(1.22, { duration: 100 }),
          withSpring(1, { damping: 12, stiffness: 120 })
        );
      }
      prevIndex.value = activeIndex;

      // Sweep reflection sheen
      sheenX.value = -200;
      sheenX.value = withTiming(mainBarWidth + 200, {
        duration: 800,
      });
    }
  }, [activeIndex, tabWidth, mainBarWidth]);

  const pillSlide = useAnimatedStyle(() => ({
    transform: [
      { translateX: pillX.value },
      { scaleX: pillScaleX.value },
      { skewX: `${pillSkewX.value}deg` }
    ],
    opacity: activeIndex >= 0 ? 1 : 0,
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sheenX.value },
      { skewX: '-30deg' }
    ],
  }));

  // Mini Floating Bar logic for Games and Clips
  const activeRouteName = state.routes[state.index].name;
  const isGamesFocused = activeRouteName === 'games';
  const isClipsFocused = activeRouteName === 'clips';

  const handlePress = useCallback((routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(routeName);
    }
  }, [navigation]);

  const handleLongPress = useCallback((routeKey: string) => {
    navigation.emit({ type: 'tabLongPress', target: routeKey });
  }, [navigation]);

  const handleMiniPress = useCallback((screenName: string) => {
    const state = navigation.getState();
    const activeRouteName = state.routes[state.index].name;
    const route = state.routes.find((r: any) => r.name === screenName);
    if (route) {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (activeRouteName !== screenName && !event.defaultPrevented) {
        Haptics.selectionAsync();
        navigation.navigate(screenName);
      }
    }
  }, [navigation]);

  const handleGamesPress = useCallback(() => {
    handleMiniPress('games');
  }, [handleMiniPress]);

  const handleClipsPress = useCallback(() => {
    handleMiniPress('clips');
  }, [handleMiniPress]);

  const handleMyNetflixPress = useCallback(() => {
    const state = navigation.getState();
    const activeRouteName = state.routes[state.index].name;
    const myNetflixRoute = state.routes.find((r: any) => r.name === 'my-netflix');
    if (myNetflixRoute) {
      const event = navigation.emit({
        type: 'tabPress',
        target: myNetflixRoute.key,
        canPreventDefault: true,
      });
      if (activeRouteName !== 'my-netflix' && !event.defaultPrevented) {
        Haptics.selectionAsync();
        navigation.navigate('my-netflix');
      }
    }
  }, [navigation]);

  if (activeRouteName === 'clips') {
    return null;
  }

  return (
    <View style={lgStyles.outerWrap}>
      {/* ── Mini Floating Liquid Glass Bar ── */}
      <View style={lgStyles.miniBarWrap}>
        {/* Games Button */}
        <LiquidMiniTabButton
          isFocused={isGamesFocused}
          themeColor={themeColor}
          onPress={handleGamesPress}
          iconName={isGamesFocused ? 'gamepad-variant' : 'gamepad-variant-outline'}
          label="Games"
          index={0}
        />

        {/* Clips Button */}
        <LiquidMiniTabButton
          isFocused={isClipsFocused}
          themeColor={themeColor}
          onPress={handleClipsPress}
          iconName={isClipsFocused ? 'creation' : 'creation-outline'}
          label="Clips"
          index={1}
        />
      </View>

      {/* Row containing main bar and separate search circle */}
      <View style={lgStyles.bottomRowWrap}>
        {/* ── Main Tab Bar Capsule ── */}
        <View style={[lgStyles.mainBarContainer, { width: mainBarWidth }]}>
          {/* Layer 0a: Deep black drop shadow ── */}
          <View style={lgStyles.shadowLayer} />

          {/* ── Layer 0b: Dynamic ambient colored light-bleed aura ── */}
          <View 
            style={[
              lgStyles.ambientShadowLayer, 
              { shadowColor: activeIndex >= 0 ? (themeColor || '#E50914') : 'transparent' }
            ]} 
          />

          {/* ── Layer 1: The Glass Body ── */}
          <View style={lgStyles.glassBody}>
            {/* Real-time blur of whatever is behind */}
            <BlurView
              intensity={Platform.OS === 'ios' ? 65 : 75}
              tint="default"
              style={StyleSheet.absoluteFill}
            />

            {/* Translucent tint that lets content show through. */}
            <View style={lgStyles.tintFill} />

            {/* ── Layer 1b: Convex dome – horizontal edge vignette ── */}
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.18)',
                'rgba(0,0,0,0.06)',
                'transparent',
                'transparent',
                'rgba(0,0,0,0.06)',
                'rgba(0,0,0,0.18)',
              ]}
              locations={[0, 0.08, 0.22, 0.78, 0.92, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={lgStyles.convexVignette}
              pointerEvents="none"
            />

            {/* ── Layer 1c: Convex dome – vertical center-bright band ── */}
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.20)', // brighter top sheen
                'rgba(255,255,255,0.06)',
                'transparent',
                'transparent',
                'rgba(255,255,255,0.05)',
                'rgba(255,255,255,0.12)',
              ]}
              locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={lgStyles.convexCenterBand}
              pointerEvents="none"
            />

            {/* ── Layer 2: Specular horizontal cylinder reflection ── */}
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.30)', // Top rim highlight
                'rgba(255,255,255,0.05)', 
                'rgba(255,255,255,0.40)', // Cylindrical bright glint band on face
                'rgba(255,255,255,0.08)',
                'transparent',            // Face shadow
                'rgba(255,255,255,0.15)', // Bottom bounce light
              ]}
              locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={lgStyles.specularHighlight}
              pointerEvents="none"
            />

            {/* ── Layer 3: Convex Inner Shadow (Top & Bottom curves) ── */}
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.28)', // Top shadow roll
                'transparent',
                'transparent',
                'rgba(0,0,0,0.48)', // Bottom shadow roll (curving away)
              ]}
              locations={[0, 0.12, 0.78, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={lgStyles.innerShadow}
              pointerEvents="none"
            />

            {/* ── Layer 3b: Glass refraction line ── */}
            <View style={lgStyles.glassRefraction} pointerEvents="none" />

            {/* ── Layer 3c: Animated Sweep Sheen ── */}
            <Animated.View
              shouldRasterizeIOS={true}
              renderToHardwareTextureAndroid={true}
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  width: 100,
                  opacity: 0.55,
                },
                sheenStyle,
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={['transparent', 'rgba(255, 255, 255, 0.4)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* ── Layer 4: Crisp glass-edge border ── */}
            <View style={lgStyles.glassBorder} pointerEvents="none" />

            {/* ── Layer 5: Tab content ── */}
            <View style={[lgStyles.tabRow, { paddingHorizontal: paddingH }]}>
              {/* Animated active pill shadow wrapper */}
              <Animated.View
                shouldRasterizeIOS={true}
                renderToHardwareTextureAndroid={true}
                style={[
                  lgStyles.activePillShadow,
                  { 
                    width: tabWidth - 12, 
                    height: 52, 
                    top: 6, 
                    left: 6,
                    shadowColor: themeColor || '#E50914'
                  },
                  pillSlide,
                ]}
              >
                {/* Inner clip container */}
                <View style={lgStyles.activePillInner}>
                  {/* pill blur */}
                  <BlurView
                    intensity={Platform.OS === 'ios' ? 35 : 45}
                    tint="default"
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={lgStyles.pillTint} />

                  {/* pill specular */}
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0.60)',
                      'rgba(255,255,255,0.20)',
                      'transparent',
                      'rgba(255,255,255,0.05)',
                      'rgba(255,255,255,0.25)',
                    ]}
                    locations={[0, 0.25, 0.5, 0.55, 1]}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={lgStyles.pillSpecular}
                    pointerEvents="none"
                  />

                  {/* pill border */}
                  <View style={lgStyles.pillBorder} pointerEvents="none" />
                </View>
              </Animated.View>

              {/* Tab buttons */}
              {visibleRoutes.map((route: any) => {
                const { options } = descriptors[route.key];
                const isFocused = state.routes[state.index].name === route.name;
                const label = options.title !== undefined ? options.title : route.name;

                return (
                  <LiquidTabButton
                    key={route.key}
                    route={route}
                    isFocused={isFocused}
                    themeColor={themeColor}
                    onPress={handlePress}
                    onLongPress={handleLongPress}
                    avatar={selectedProfile?.avatar}
                    label={label}
                  />
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Separate My Netflix Glass Circle ── */}
        <MyNetflixGlassButton
          isFocused={activeRouteName === 'my-netflix'}
          themeColor={themeColor}
          onPress={handleMyNetflixPress}
          avatar={selectedProfile?.avatar}
        />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════ */

export default function TabLayout() {
  const { selectedProfile } = useProfile();
  const { themeColor } = useTheme();

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{
        sceneStyle: { backgroundColor: '#000000' },
        tabBarHideOnKeyboard: true,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="games"
        options={{
          href: null,
          title: 'Games',
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: 'New & Hot',
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          href: null,
          title: 'Clips',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'creation' : 'creation-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'search' : 'search-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="my-netflix"
        options={{
          title: 'My Netflix',
          tabBarIcon: ({ color, focused }) => (
            <Animated.Image
              source={selectedProfile?.avatar}
              style={[
                lgStyles.avatar,
                { borderColor: focused ? 'white' : 'rgba(255,255,255,0.2)' },
              ]}
            />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
    </Tabs>
  );
}

/* ═══════════════════════════════════════════════ */

const lgStyles = StyleSheet.create({
  /* ── Outer wrapper (shadow host) ── */
  outerWrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 20,
    left: 16,
    right: 16,
    height: 64,
  },

  /* Row containing main bar and separate search circle */
  bottomRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 64,
  },

  mainBarContainer: {
    height: 64,
    marginRight: 12,
  },

  /* Deep, diffuse drop-shadow behind the glass */
  shadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.01)', // needs a bg so shadow renders
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 16,
  },

  /* Dynamic ambient colored light-bleed aura */
  ambientShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.01)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 12,
  },

  /* ── The glass capsule itself ── */
  glassBody: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
  },

  /* Translucent tint — NOT opaque. Deepens the contrast to prevent a washed-out look. */
  tintFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },

  /* Top-edge specular glint that fades smoothly across the entire height */
  specularHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },

  /* Soft inner shadow for concavity / depth */
  innerShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },

  /* Upper glint for refraction effect */
  glassRefraction: {
    position: 'absolute',
    top: 1.5,
    left: 2,
    right: 2,
    height: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.45)',
  },

  /* 2.5px glass-edge highlight – graduated for convex dome illusion */
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.22)',
    borderTopColor: 'rgba(255,255,255,0.65)',
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderLeftColor: 'rgba(255,255,255,0.12)',
    borderRightColor: 'rgba(255,255,255,0.12)',
  },

  /* ── Convex dome surface layers ── */
  convexVignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  convexCenterBand: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  convexVignetteMini: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  convexCenterBandMini: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  convexVignetteCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  convexCenterBandCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },

  /* ── Tab row ── */
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },

  /* ── Active pill shadow wrapper ── */
  activePillShadow: {
    position: 'absolute',
    borderRadius: 26,
    // iOS Shadow - colorful glow of the active theme
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    // Android elevation (uses dynamic shadow, will fallback to black, but still looks good)
    elevation: 8,
  },

  /* ── Active pill inner container ── */
  activePillInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    overflow: 'hidden',
  },

  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.06)', // Crisper, less foggy active highlight
  },

  pillSpecular: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
  },

  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    borderTopColor: 'rgba(255,255,255,0.68)',
    borderBottomColor: 'rgba(255,255,255,0.10)',
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightColor: 'rgba(255,255,255,0.14)',
  },

  /* ── Individual tab button ── */
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 2,
  },

  tabContentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },

  iconWrap: {
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },

  label: {
    fontSize: 9.5,
    letterSpacing: 0.15,
  },

  avatar: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
  },

  /* ── Search Container and Glass Circle ── */
  searchContainer: {
    width: 64,
    height: 64,
  },
  searchGlassBody: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassRefractionSearch: {
    position: 'absolute',
    top: 1.5,
    left: 2,
    right: 2,
    height: 14,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.45)',
  },
  searchIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Breathing glow ring around search button */
  searchBreathRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 36,
    borderWidth: 1.5,
  },
  /* Ripple burst ring */
  searchRippleRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    borderWidth: 2,
  },

  /* ── Mini Floating Bar ── */
  miniBarWrap: {
    position: 'absolute',
    bottom: 78, // 64px height + 14px spacing
    right: 0,
    width: 128,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniCapsuleContainer: {
    width: 60,
    height: 44,
  },
  miniGlassBody: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  miniShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.01)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  miniAmbientShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.01)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  glassRefractionMini: {
    position: 'absolute',
    top: 1.5,
    left: 2,
    right: 2,
    height: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.45)',
  },
  miniLabel: {
    fontSize: 8.5,
    letterSpacing: 0.1,
    marginTop: -2,
  },
});
