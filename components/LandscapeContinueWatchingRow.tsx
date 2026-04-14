import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, FlatList } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  SharedValue,
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const styles = StyleSheet.create({
  rowContainer: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContainer: {
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  pressable: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  landscapeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  titleContainer: {
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 20, // gradient bleed space
    backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)', // Fallback web, not strictly needed for Native as we use a real gradient or just a dark background
  },
  movieTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 4,
  },
  progressBarBackground: {
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E50914', // Official Netflix Red
  },
  infoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 0.9,
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
  }
});

interface LandscapeCardProps {
  item: any;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
}

const LandscapeCard = React.memo(({ item, tiltX, tiltY }: LandscapeCardProps) => {
  const { width } = useWindowDimensions();
  // Cinema ratio 16:9
  const cardWidth = width * 0.65;
  const cardHeight = cardWidth * (9 / 16);

  const router = useRouter();
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 500 },
        { rotateX: `${(tiltX?.value ?? 0) * 0.5}deg` },
        { rotateY: `${(tiltY?.value ?? 0) * 0.5}deg` },
        { scale: scale.value }
      ],
      zIndex: zIndex.value,
    };
  });

  const handlePressIn = React.useCallback(() => {
    zIndex.value = 10;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePressOut = React.useCallback(() => {
    zIndex.value = 0;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  const handlePress = React.useCallback(() => {
    router.push({
      pathname: "/movie/[id]",
      params: { id: item.id || item.item?.id, type: item.type || item.item?.type || 'movie' }
    });
  }, [item, router]);

  // Use backdrop if available, otherwise poster
  const imageSource = item.backdropUrl || item.imageUrl || (item.item?.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.item.backdrop_path}` : '');
  const title = item.title || item.item?.title || item.item?.name || '';
  const progress = item.progress || 0.15; // fallback to 15% to show it works
  
  return (
    <Animated.View style={[styles.cardContainer, { width: cardWidth, height: cardHeight }, animatedStyle]}>
      <Pressable 
        style={styles.pressable}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        <AnimatedImage 
          source={{ uri: imageSource }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        
        <View style={styles.landscapeOverlay}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={20} color="white" style={{ marginLeft: 3 }} />
          </View>
        </View>

        <Pressable style={styles.infoBtn} onPress={(e) => {
          e.stopPropagation();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // could trigger preview modal or details sheet
        }}>
          <Ionicons name="information" size={14} color="white" />
        </Pressable>

        <View style={styles.footer}>
          <View style={[styles.titleContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Text style={styles.movieTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
        </View>

      </Pressable>
    </Animated.View>
  );
});

interface LandscapeCarouselRowProps {
  title: string;
  data: any[];
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
}

export const LandscapeContinueWatchingRow = React.memo(({ title, data, tiltX, tiltY }: LandscapeCarouselRowProps) => {
  if (!data || data.length === 0) return null;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item, index) => `${item.id || index}`}
        renderItem={({ item }) => (
          <LandscapeCard item={item} tiltX={tiltX} tiltY={tiltY} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
        snapToInterval={useWindowDimensions().width * 0.65 + 10}
        snapToAlignment="start"
        decelerationRate="fast"
      />
    </View>
  );
});
