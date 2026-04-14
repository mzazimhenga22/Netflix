import React from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DynamicTitleCard } from './DynamicTitleCard';
import { COLORS, SPACING } from '../constants/theme';
import Animated, { SharedValue } from 'react-native-reanimated';
import { PhoneRowNative } from './PhoneRowNative';
import { useRouter } from 'expo-router';

// Styles moved to top to avoid hoisting issues with React.memo
const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
  }
});

interface HorizontalCarouselProps {
  title: string;
  data: {
    id: string;
    title: string;
    imageUrl: string;
    synopsis?: string;
    type?: string;
  }[];
  variant?: 'poster' | 'landscape' | 'square';
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  isTop10?: boolean;
  isGamesRow?: boolean;
  isWatchHistory?: boolean;
  onCardLongPress?: (item: { id: string; title: string; imageUrl: string; type?: string }) => void;
}

const HorizontalCarouselComponent = ({ title, data, variant = 'poster', tiltX, tiltY, isTop10, isGamesRow, isWatchHistory, onCardLongPress }: HorizontalCarouselProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const POSTER_W = windowWidth * 0.28;
  const LANDSCAPE_W = windowWidth * 0.35;
  const SQUARE_W = windowWidth * 0.28;

  const router = useRouter();
  const isListTop10 = isTop10 || title.includes('Top 10') || title.includes('Trending');
  const actualVariant = isGamesRow ? 'square' : variant;

  const itemWidth = actualVariant === 'landscape' ? LANDSCAPE_W : (actualVariant === 'square' ? SQUARE_W : (isListTop10 ? POSTER_W + 40 : POSTER_W));
  const snapInterval = itemWidth + 8; // width + gap
  const actualHeight = actualVariant === 'landscape' ? LANDSCAPE_W * 1.4 : (actualVariant === 'square' ? SQUARE_W : POSTER_W * 1.5);

  const renderItem = React.useCallback(({ item, index }: any) => (
    <DynamicTitleCard 
      item={item} 
      variant={actualVariant} 
      tiltX={tiltX} 
      tiltY={tiltY} 
      index={index}
      isTop10={isListTop10 && actualVariant === 'poster'}
      isOriginal={isGamesRow || (!isGamesRow && parseInt(item.id) % 3 === 0)}
      isRecentlyAdded={!isGamesRow && parseInt(item.id) % 5 === 0}
      isGame={isGamesRow}
      isWatchHistory={isWatchHistory}
      onLongPress={onCardLongPress}
    />
  ), [actualVariant, tiltX, tiltY, isListTop10, isGamesRow, isWatchHistory, onCardLongPress]);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 50
  }).current;

  const onViewableItemsChanged = React.useCallback(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      Haptics.selectionAsync();
    }
  }, []);

  if (Platform.OS === 'android' && !isListTop10 && !isWatchHistory && !isGamesRow) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <PhoneRowNative 
          data={data.map(d => ({ 
            id: d.id, 
            title: d.title, 
            imageUrl: d.imageUrl, 
            type: d.type || 'movie' 
          }))} 
          variant={actualVariant} 
          onSelect={(id, type) => {
            Haptics.selectionAsync();
            router.push({ pathname: "/movie/[id]", params: { id, type } });
          }} 
          style={{ width: '100%', height: actualHeight, marginTop: 4 }} 
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
      />
    </View>
  );
};

export const HorizontalCarousel = React.memo(HorizontalCarouselComponent);
