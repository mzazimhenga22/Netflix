import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable 
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  withTiming,
  FadeIn
} from 'react-native-reanimated';

interface TvPosterCardProps {
  title: string;
  imageUrl: string;
  year?: string;
  rating?: string;
  match?: string;
  onPress?: () => void;
  onFocus?: () => void;
  width?: number;
  height?: number;
  showBadge?: boolean;
  progressPercentage?: number; // 0-100
  isLocked?: boolean;
}

export default function TvPosterCard({ 
  title, 
  imageUrl, 
  year = '2024', 
  rating = 'PG-13', 
  match = '98% Match',
  onPress, 
  onFocus, 
  width = 200, 
  height = 300,
  showBadge = false,
  progressPercentage,
  isLocked = false,
}: TvPosterCardProps) {
  const scale = useSharedValue(1);
  const borderOpacity = useSharedValue(0);
  const [isFocused, setIsFocused] = useState(false);
  const focusTimeout = useRef<NodeJS.Timeout | null>(null);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 150 }) }],
    zIndex: isFocused ? 1000 : 1,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    opacity: withTiming(borderOpacity.value, { duration: 200 }),
    transform: [{ scale: scale.value + 0.02 }],
  }));

  const handleFocus = () => {
    setIsFocused(true);
    scale.value = 1.25; // More aggressive expansion for 2025 look
    borderOpacity.value = 1;
    
    // Debounce the hero update and metadata reveal
    if (focusTimeout.current) clearTimeout(focusTimeout.current);
    focusTimeout.current = setTimeout(() => {
      if (onFocus) onFocus();
    }, 300);
  };

  const handleBlur = () => {
    setIsFocused(false);
    scale.value = 1;
    borderOpacity.value = 0;
    if (focusTimeout.current) clearTimeout(focusTimeout.current);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPress={onPress}
        style={styles.pressable}
      >
        {/* Glow Border Effect */}
        <Animated.View style={[
          styles.focusBorder, 
          { width: width + 10, height: height + 10 },
          borderStyle
        ]} />

        <Animated.View style={[styles.container, { width, height }, animatedStyle]}>
          <Image source={{ uri: imageUrl }} style={styles.image} />
          
          {showBadge && (
            <View style={styles.nBadgeContainer}>
              <Image 
                source={require('../assets/images/netflix-n-logo.svg')} 
                style={styles.nBadgeImage} 
                contentFit="contain"
              />
            </View>
          )}

          {isLocked && (
            <View style={styles.lockOverlay}>
              <Text style={{ fontSize: 32 }}>🔒</Text>
            </View>
          )}
          
          {/* Expanded Metadata (Visible only on focus) */}
          {isFocused && (
            <Animated.View entering={FadeIn.delay(200)} style={styles.expandedInfo}>
              <View style={styles.metaRow}>
                <Text style={styles.matchText}>{match}</Text>
                <View style={styles.ratingBadge}>
                  <Text style={styles.badgeText}>{rating}</Text>
                </View>
                <Text style={styles.yearText}>{year}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            </Animated.View>
          )}
          
          {/* Progress Bar for Continue Watching */}
          {progressPercentage !== undefined && progressPercentage > 0 && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progressPercentage))}%` }]} />
            </View>
          )}
          
          {/* Default Title (Visible when not focused or as fallback) */}
          {!isFocused && (
            <View style={styles.titleOverlay}>
               <Text style={styles.smallTitle} numberOfLines={1}>{title}</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 40, // Increased gap for expansion
    paddingVertical: 40, 
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  focusBorder: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#fff',
    borderRadius: 12,
    zIndex: 50,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  expandedInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  matchText: {
    color: '#46d369',
    fontSize: 12,
    fontWeight: '900',
  },
  ratingBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  yearText: {
    color: '#fff',
    fontSize: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  titleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  smallTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    textAlign: 'center',
  },
  nBadgeContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
  },
  nBadgeImage: {
    width: 14,
    height: 22,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
});
