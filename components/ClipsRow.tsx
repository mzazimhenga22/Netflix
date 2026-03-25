import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions, ScrollView, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { COLORS, SPACING } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.42;
const CARD_HEIGHT = CARD_WIDTH * 1.6;

interface ClipItem {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
}

const ClipCard = ({ item }: { item: ClipItem }) => {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const scale = useSharedValue(1);
  
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePressIn = () => {
    scale.value = withSpring(1.05);
    setIsHovered(true);
    player.play();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    setIsHovered(false);
    player.pause();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to New & Hot screen and tell it to open Discovery tab
    router.push({
      pathname: '/(tabs)/new',
      params: { tab: 'discovery', clipId: item.id }
    });
  };

  return (
    <Pressable 
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={styles.cardContainer}
    >
      <Animated.View style={[styles.card, animatedStyle]}>
        <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
        
        {isHovered && (
          <View style={StyleSheet.absoluteFill}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </View>
        )}

        <View style={styles.overlay}>
          <View style={styles.clipBadge}>
            <MaterialCommunityIcons name="play" size={12} color="white" />
            <Text style={styles.clipBadgeText}>CLIP</Text>
          </View>
          <Text style={styles.clipTitle} numberOfLines={1}>{item.title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export function ClipsRow({ title, data }: { title: string, data: ClipItem[] }) {
  return (
    <View style={styles.container}>
      <Text style={styles.rowTitle}>{title}</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {data.map((item) => (
          <ClipCard key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.lg,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: 12,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  clipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
    gap: 2,
  },
  clipBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
  },
  clipTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  }
});
