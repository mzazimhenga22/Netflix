import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  Dimensions,
  Animated
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useVideoPlayer, VideoView } from 'expo-video';
import { resolveTrailer } from '../utils/useTvNative';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HomeHeroProps {
  title: string;
  description: string;
  imageUrl: string;
  logoUrl?: string;
  item?: any;
  top10?: boolean;
  onPlay: () => void;
  onInfo: () => void;
}

function HomeHero({ title, description, imageUrl, logoUrl, item, top10, onPlay, onInfo }: HomeHeroProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    player.muted = false;  // Play with sound
    player.volume = 0.8;
  });

  const mediaType = item?.media_type || (item?.first_air_date ? 'tv' : 'movie');

  // Enable resolver when item is available — delayed 2s to avoid competing with initial data fetches
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        console.log(`[Hero] 🎬 Resolving trailer via native for: ${title}`);
        const result = await resolveTrailer(item.id, mediaType as 'movie' | 'tv');
        if (!cancelled && result?.url) {
          console.log(`[Hero] 🎬 Trailer resolved: ${result.type} - ${result.url.substring(0, 60)}...`);
          setVideoUrl(result.url);
        }
      } catch (e: any) {
        console.warn(`[Hero] Trailer resolve failed: ${e.message}`);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item?.id, mediaType, title]);

  // Play trailer when focused, stop when blurred
  useEffect(() => {
    if (isFocused && videoUrl) {
      // 2s delay before trailer starts — avoids flashing during quick scroll
      focusTimerRef.current = setTimeout(() => {
        console.log(`[Hero] 🚀 Starting trailer for: ${title}`);
        setShowVideo(true);
        player.play();
        Animated.timing(videoOpacity, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }).start();
      }, 2000);
    } else {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (showVideo) {
        // Fade out and pause
        Animated.timing(videoOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setShowVideo(false);
          player.pause();
        });
      }
    }

    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [isFocused, videoUrl]);

  const year = item?.release_date?.split('-')[0] || item?.first_air_date?.split('-')[0] || new Date().getFullYear().toString();
  const isTv = item?.media_type === 'tv' || item?.first_air_date !== undefined;
  const typeStr = isTv ? 'TV Shows' : 'Movies';
  
  const duration = isTv ? '8 Episodes' : '2h 15m'; 
  const rating = 'TV-PG';
  const category = 'Family Time TV';
  const metadataText = `${category} • ${year} • ${duration} • ${rating}`;
  
  const cast = item?.credits?.cast?.slice(0, 3).map((c: any) => c.name).join(', ') || 'Gordon Cormier, Kiawentiio and Ian Ousley';

  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  return (
    <View style={styles.container}>
      <View style={styles.heroWrapper}>
        {/* Background Image */}
        <Image source={{ uri: imageUrl }} style={styles.backgroundImage} />

        {/* Trailer resolution now via Kotlin native module (useEffect above) */}

        {/* Video Player for Autoplay */}
        {showVideo && videoUrl && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity, zIndex: 1 }]}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </Animated.View>
        )}
        
        {/* Overlays for cinematic feel - lighter when video is playing */}
        <LinearGradient
          colors={showVideo 
            ? ['transparent', 'transparent', 'rgba(0,0,0,0.3)'] 
            : ['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
          locations={[0, 0.4, 1]}
          style={[styles.gradient, { zIndex: 2 }]}
        />
        <LinearGradient
          colors={showVideo 
            ? ['rgba(0,0,0,0.2)', 'transparent'] 
            : ['rgba(0,0,0,0.6)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.sideGradient, { zIndex: 2 }]}
        />

        {/* Content overlay — fades out when trailer plays */}
        <Animated.View style={[styles.content, { opacity: showVideo ? 0 : 1 }]} pointerEvents={showVideo ? 'none' : 'auto'}>
          {isTv && (
            <View style={styles.seriesRow}>
              <Image 
                source={require('../assets/images/netflix-n-logo.svg')} 
                style={styles.nSeriesLogoImage} 
                contentFit="contain"
              />
              <Text style={styles.seriesText}>S E R I E S</Text>
            </View>
          )}

          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="contain" />
          ) : (
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          )}
          
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{metadataText}</Text>
          </View>

          <Animated.View style={[styles.buttonRow, { opacity: opacityAnim }]}>
            <Pressable
              style={({ focused }) => [
                styles.playButton,
                focused && styles.buttonFocused
              ]}
              onPress={onPlay}
              onFocus={handleFocus}
              onBlur={handleBlur}
              hasTVPreferredFocus={true}
            >
              <Ionicons name="play" size={28} color="black" />
              <Text style={styles.playButtonText}>Play</Text>
            </Pressable>

            <Pressable
              style={({ focused }) => [
                styles.infoButton,
                focused && styles.buttonFocused
              ]}
              onPress={onInfo}
              onFocus={handleFocus}
              onBlur={handleBlur}
            >
              <Ionicons name="information-circle-outline" size={30} color="white" />
              <Text style={styles.infoButtonText}>More Info</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.badgeContainer}>
            {top10 && (
              <View style={styles.top10Badge}>
                <View style={styles.top10Icon}>
                  <Text style={styles.top10Label}>TOP</Text>
                  <Text style={styles.top10Number}>10</Text>
                </View>
                <Text style={styles.top10Text}>#2 in {typeStr} Today</Text>
              </View>
            )}
            
            <View style={styles.castBadge}>
              <Ionicons name="star" size={16} color="#fff" />
              <Text style={styles.castText} numberOfLines={1}>Starring {cast}</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

export default React.memo(HomeHero, (prev, next) => {
  return prev.item?.id === next.item?.id &&
    prev.imageUrl === next.imageUrl &&
    prev.logoUrl === next.logoUrl &&
    prev.top10 === next.top10;
});

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT * 0.78,
    width: '100%',
    paddingHorizontal: 54, 
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  heroWrapper: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  sideGradient: {
    ...StyleSheet.absoluteFillObject,
    width: '50%',
  },
  content: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    zIndex: 10,
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  nSeriesLogoImage: {
    width: 24,
    height: 34,
    marginRight: 8,
  },
  seriesText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 4,
  },
  logoImage: {
    width: 350,
    height: 120,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  title: {
    color: 'white',
    fontSize: 60,
    fontWeight: '900',
    marginBottom: 10,
    width: '60%',
  },
  metaRow: {
    marginBottom: 20,
  },
  metaText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    opacity: 0.9,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 35,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  playButtonText: {
    color: 'black',
    fontSize: 22,
    fontWeight: 'bold',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 100, 100, 0.7)',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  infoButtonText: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  buttonFocused: {
    transform: [{ scale: 1.05 }],
    backgroundColor: '#E50914',
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  top10Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50,50,50,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 12,
  },
  top10Icon: {
    alignItems: 'center',
    backgroundColor: '#E50914',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
  },
  top10Label: {
    color: '#fff',
    fontSize: 6,
    fontWeight: 'bold',
  },
  top10Number: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    marginTop: -2,
  },
  top10Text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  castBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50,50,50,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 12,
  },
  castText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: 500,
  }
});
