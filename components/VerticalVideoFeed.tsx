import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, Dimensions, Text, Pressable, Image, useWindowDimensions, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS, SPACING } from '../constants/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { TrailerResolver } from './TrailerResolver';
import { NetflixLoader } from './NetflixLoader';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  withRepeat, 
  withSequence, 
  withTiming,
  FadeInRight,
  FadeIn
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { height, width } = Dimensions.get('window');
interface VideoItemProps {
  item: {
    id: string;
    videoUrl: string;
    title: string;
    description: string;
    showId?: string;
    type?: string;
    rating?: string;
  };
  isActive: boolean;
}

const ClipPlayer = React.memo(({ url, isActive, isPreloading, isMuted }: { url: string, isActive: boolean, isPreloading: boolean, isMuted: boolean }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = isMuted;
    
    // Aggressive preloading
    if ('preferredForwardBufferDuration' in p) {
      (p as any).preferredForwardBufferDuration = 60; 
    }
  });

  // Handle Play/Pause
  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  // Handle Mute sync
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  if (!isActive && !isPreloading) return null;

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="cover"
      nativeControls={false}
    />
  );
});

const VideoItem = React.memo(({ item, isActive, isNext, isPrev, isPreShowing }: { item: any, isActive: boolean, isNext: boolean, isPrev: boolean, isPreShowing: boolean }) => {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  
  // Only create player if active, next or previous (3-player rule)
  const shouldHavePlayer = isActive || isNext || isPrev;
  
  // Trigger Resolution for mock/empty URLs when nearing viewport
  useEffect(() => {
    if ((isActive || isNext) && !resolvedUrl && (!item.videoUrl || item.videoUrl.includes('sample'))) {
      setIsResolving(true);
    }
  }, [isActive, isNext, item.videoUrl, resolvedUrl]);

  const handleLike = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleGoToDetails = () => {
    if (item.showId) {
      router.push({
        pathname: `/movie/${item.showId}` as any,
        params: { type: item.type || 'movie' }
      });
    }
  };

  return (
    <View style={styles.itemContainer}>
      {/* Hidden Resolver - only active for current and next */}
      {(isActive || isNext) && isResolving && (
        <TrailerResolver
          tmdbId={item.showId || ''}
          mediaType={(item.type as any) || 'movie'}
          enabled={isResolving}
          onResolved={(stream) => {
            setResolvedUrl(stream.url);
            setIsResolving(false);
          }}
          onError={() => setIsResolving(false)}
        />
      )}

      <View style={styles.videoPressable}>
        {shouldHavePlayer && resolvedUrl ? (
          <ClipPlayer 
            url={resolvedUrl} 
            isActive={isActive} 
            isPreloading={isNext || isPrev}
            isMuted={isMuted} 
          />
        ) : (
          <View style={styles.loadingPlaceholder}>
            {(isActive || isNext || isPrev) && (
              <Image 
                source={{ uri: `https://image.tmdb.org/t/p/original${item.backdrop_path || ''}` }} 
                style={styles.video} 
                blurRadius={isActive ? 15 : 0}
              />
            )}
            {isActive && !resolvedUrl && <NetflixLoader size={40} />}
          </View>
        )}
        
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.9)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Interaction Rail */}
      <View style={styles.rightRail}>
        <Animated.View entering={FadeInRight.delay(200)}>
          <Pressable style={styles.railAction} onPress={handleLike}>
            <Ionicons name="heart-outline" size={32} color="white" />
            <Text style={styles.railLabel}>LOL</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(400)}>
          <Pressable style={styles.railAction}>
            <MaterialCommunityIcons name="share-variant" size={30} color="white" />
            <Text style={styles.railLabel}>Share</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(500)}>
          <Pressable style={styles.playFunnel} onPress={handleGoToDetails}>
            <Ionicons name="play" size={24} color="black" />
            <Text style={styles.playFunnelText}>Play</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Content Info */}
      <View style={styles.infoContainer}>
        <View style={styles.badgeRow}>
          <ExpoImage 
            source={require('../assets/images/netflix-n-logo.svg')} 
            style={styles.nBadgeImage} 
            contentFit="contain" 
          />
          <Text style={styles.seriesText}>SERIES</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{item.overview || item.description}</Text>
      </View>

      <View style={styles.progressContainer}>
         <View style={[styles.progressBar, { width: isActive ? '100%' : '0%' }]} />
      </View>
    </View>
  );
});

VideoItem.displayName = 'VideoItem';

export function VerticalVideoFeed({ data }: { data: any[] }) {
  const { height: ITEM_HEIGHT, width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const [isScreenFocused, setIsScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  return (
    <FlatList
      data={data}
      renderItem={({ item, index }) => (
        <VideoItem 
          item={item} 
          isActive={index === activeIndex && isScreenFocused} 
          isNext={index === activeIndex + 1 && isScreenFocused}
          isPrev={index === activeIndex - 1 && isScreenFocused}
          isPreShowing={Math.abs(index - activeIndex) <= 1}
        />
      )}
      keyExtractor={(item) => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      disableIntervalMomentum={Platform.OS === 'android'}
      decelerationRate="fast"
      style={styles.feedList}
      windowSize={5}
      maxToRenderPerBatch={2}
      initialNumToRender={2}
      removeClippedSubviews={true}
      getItemLayout={(data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
    />
  );
}

const styles = StyleSheet.create({
  feedList: {
    backgroundColor: 'black',
  },
  itemContainer: {
    height: Dimensions.get('window').height,
    width: Dimensions.get('window').width,
    backgroundColor: 'black',
  },
  videoPressable: {
    flex: 1,
  },
  video: {
    flex: 1,
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  loadingPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  rightRail: {
    position: 'absolute',
    right: 12,
    bottom: 100, // Above tab bar
    alignItems: 'center',
    gap: 20,
    zIndex: 10,
  },
  railAction: {
    alignItems: 'center',
    gap: 4,
  },
  railLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  playFunnel: {
    backgroundColor: 'white',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  playFunnelText: {
    color: 'black',
    fontSize: 10,
    fontWeight: '900',
    marginTop: -2,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 80,
    zIndex: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  nBadgeImage: {
    width: 14,
    height: 18,
  },
  seriesText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    opacity: 0.8,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  description: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  }
});
