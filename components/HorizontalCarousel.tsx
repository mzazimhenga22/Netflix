import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { DynamicTitleCard } from './DynamicTitleCard';
import { COLORS, SPACING } from '../constants/theme';
import Animated, { SharedValue } from 'react-native-reanimated';

interface HorizontalCarouselProps {
  title: string;
  data: {
    id: string;
    title: string;
    imageUrl: string;
    synopsis?: string;
  }[];
  variant?: 'poster' | 'landscape';
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
}

const HorizontalCarouselComponent = ({ title, data, variant = 'poster', tiltX, tiltY }: HorizontalCarouselProps) => {
  const renderItem = React.useCallback(({ item }: any) => (
    <DynamicTitleCard item={item} variant={variant} tiltX={tiltX} tiltY={tiltY} />
  ), [variant, tiltX, tiltY]);

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
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
};

export const HorizontalCarousel = React.memo(HorizontalCarouselComponent);

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
