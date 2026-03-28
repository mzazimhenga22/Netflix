import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, FadeIn, Easing } from 'react-native-reanimated';
import { getImageUrl, getBackdropUrl } from '../services/tmdb';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CARD_WIDTH = 220;
const CARD_HEIGHT = 330;
const EXPANDED_WIDTH = 550;
const EXPAND_SCALE = EXPANDED_WIDTH / CARD_WIDTH; // ~2.5x

interface ExpandingRowProps {
  title: string;
  data: any[];
  onSelect: (id: number, type?: string) => void;
  onFocusChange?: (item: any) => void;
  showProgress?: boolean;
  isTop10?: boolean;
}

const ExpandingRow = React.memo(({ title, data, onSelect, onFocusChange, showProgress, isTop10 }: ExpandingRowProps) => {
  const [activeItem, setActiveItem] = useState<any>(null);
  const scrollRef = React.useRef<ScrollView>(null);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Trailers disabled on TV to save RAM on low-end devices (1GB Android 9)
  // Each row was creating a VideoPlayer + TrailerResolver WebView = 7+ decoders for 1GB RAM
  // Cards show backdrop image on focus instead — visually similar, zero extra RAM

  return (
    <View style={styles.container}>
      <Text style={styles.rowTitle}>{title}</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={CARD_WIDTH + 20}
        decelerationRate="fast"
      >
        {data.map((item, index) => (
          <ExpandingCard
            key={item.id}
            item={item}
            index={index}
            isTop10={isTop10}
            showBadge={index % 3 === 0}
            showProgress={showProgress}
            isActive={activeItem?.id === item.id}
            onFocusItem={setActiveItem}
            onFocusChange={onFocusChange}
            debounceTimerRef={debounceTimerRef}
            onPress={() => onSelect(item.id, item.media_type)}
          />
        ))}
      </ScrollView>

      {activeItem && (
        <Animated.View style={styles.metadataContainer} entering={FadeIn.duration(400)}>
          <Text style={styles.metadataText}>
            {activeItem.media_type === 'tv' ? 'TV Show' : 'Movie'} • {activeItem.first_air_date?.split('-')[0] || activeItem.release_date?.split('-')[0]} • {activeItem.vote_average?.toFixed(1)} ★
          </Text>
          <Text style={styles.synopsis} numberOfLines={2}>
            {activeItem.overview}
          </Text>
        </Animated.View>
      )}
    </View>
  );
});

export default ExpandingRow;

const ExpandingCard = React.memo(({ item, index, showBadge, showProgress, isTop10, isActive, onFocusItem, onFocusChange, debounceTimerRef, onPress }: { 
  item: any, 
  index: number,
  showBadge?: boolean, 
  showProgress?: boolean,
  isTop10?: boolean,
  isActive: boolean,
  onFocusItem: (item: any) => void,
  onFocusChange?: (item: any) => void,
  debounceTimerRef: React.MutableRefObject<NodeJS.Timeout | null>,
  onPress: () => void 
}) => {
  const isFocused = useSharedValue(0);
  const [focused, setFocused] = React.useState(false);

  const handleFocus = useCallback(() => {
    isFocused.value = 1;
    setFocused(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onFocusItem(item);
      onFocusChange?.(item);
    }, 300);
  }, [item, onFocusItem, onFocusChange, debounceTimerRef]);

  const handleBlur = useCallback(() => {
    isFocused.value = 0;
    setFocused(false);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    // GPU-only transform animation — no layout recalculation
    // scaleX runs on GPU compositor, unlike width animation which triggers layout per frame
    const duration = 250;
    const easing = Easing.out(Easing.cubic);
    
    return {
      transform: [
        { scale: withTiming(isFocused.value ? 1.05 : 1, { duration, easing }) },
        { scaleX: withTiming(isFocused.value ? EXPAND_SCALE : 1, { duration, easing }) },
      ] as any, // Reanimated 4 typing issue with heterogeneous transform arrays
      zIndex: isFocused.value ? 10 : 1,
    };
  });

  const titleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isFocused.value ? 1 : 0, { duration: 300 }),
  }));

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[styles.cardContainer, isTop10 && { marginLeft: 50, marginRight: 20 }]}
    >
      {/* Giant Top 10 Overlapping Badge */}
      {isTop10 && index < 10 && (
        <View style={styles.top10Badge}>
          <Text style={styles.top10Text}>{index + 1}</Text>
        </View>
      )}

      <Animated.View style={[styles.card, animatedStyle]}>
        <Image
          source={{ uri: focused && item.backdrop_path ? getBackdropUrl(item.backdrop_path) : getImageUrl(item.poster_path) }}
          style={styles.image}
          contentFit="cover"
        />

        <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.55, 1]}
            style={styles.gradient}
        />

        {showBadge && (
          <View style={styles.nBadgeContainer}>
            <Image 
              source={require('../assets/images/netflix-n-logo.svg')} 
              style={styles.nBadgeImage} 
              contentFit="contain"
            />
          </View>
        )}

        <View style={styles.contentOverlay}>
           <Animated.Text 
             style={[styles.cardTitle, titleStyle]} 
             numberOfLines={1}
           >
             {item.title || item.name}
           </Animated.Text>
        </View>

        {/* Progress Bar for Continue Watching */}
        {(showProgress || item.progressPercentage !== undefined) && (
          <View style={styles.progressBarContainer}>
             <View style={[styles.progressFill, { width: `${item.progressPercentage || 0}%` }]} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});



const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
    paddingLeft: 60,
  },
  rowTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    opacity: 0.9,
  },
  scrollContent: {
    paddingRight: 60,
    paddingVertical: 20,
    gap: 20,
    alignItems: 'center',
  },
  cardContainer: {
    height: CARD_HEIGHT + 40,
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  cardTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  metadataContainer: {
    marginTop: 10,
    maxWidth: EXPANDED_WIDTH,
  },
  metadataText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  synopsis: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    lineHeight: 24,
  },
  nBadgeContainer: {
    position: 'absolute',
    top: 15,
    left: 15,
    zIndex: 20,
  },
  nBadgeImage: {
    width: 20,
    height: 30,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    zIndex: 30,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  top10Badge: {
    position: 'absolute',
    left: -60,
    bottom: -40,
    zIndex: 20,
    elevation: 20,
  },
  top10Text: {
    fontSize: 240,
    fontWeight: '900',
    color: '#000',
    textShadowColor: '#fff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    letterSpacing: -12,
  }
});
