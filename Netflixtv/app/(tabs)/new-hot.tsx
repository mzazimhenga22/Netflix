import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, findNodeHandle, ImageBackground, Pressable } from 'react-native';
import { fetchUpcoming, fetchTrending, fetchPopular, getBackdropUrl } from '../../services/tmdb';
import { resolveStreamFromCloud } from '../../services/cloudResolver';
import ExpandingRow from '../../components/ExpandingRow';
import { useProfile } from '../../context/ProfileContext';
import { usePageColor } from '../../context/PageColorContext';
import HomeSkeleton from '../../components/HomeSkeleton';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, router } from 'expo-router';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';
import { TV_TOP_NAV_TOTAL_OFFSET } from './_layout';
import ColorExtractor from '../../components/ColorExtractor';

const { width } = Dimensions.get('window');

export default function NewAndHotScreen() {
  const { selectedProfile } = useProfile();
  const { pageColor, setPageColor } = usePageColor();
  const { setHeroFocusTag } = useTvFocusBridge();
  const [loading, setLoading] = useState(true);
  const firstRowRef = useRef<any>(null);
  const heroBannerRef = useRef<any>(null);
  
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  
  // Card stream — scoped to exactly one focused card at a time
  const [focusedCardStream, setFocusedCardStream] = useState<{ id: string; url: string; headers?: string } | null>(null);
  const cardStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentCardId = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const maturityLevel = selectedProfile?.maturityLevel;
      const [upc, tr, pop] = await Promise.all([
        fetchUpcoming(maturityLevel),
        fetchTrending('all', maturityLevel),
        fetchPopular('movie', maturityLevel),
      ]);

      setUpcoming(upc);
      setTrending(tr);
      setPopular(pop);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedProfile]);

  useEffect(() => {
    loadData();
    // Default cinematic color for New & Hot
    setPageColor('#080808');
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        const tag = findNodeHandle(heroBannerRef.current || firstRowRef.current);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        clearTimeout(timeout);
        setHeroFocusTag(null);
        // Clean up card stream when leaving tab
        if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
        setFocusedCardStream(null);
        currentCardId.current = null;
      };
    }, [loading, setHeroFocusTag])
  );

  // Card focus → resolve stream for that card's inline video player only
  const handleItemFocus = useCallback((movie: any) => {
    const movieId = String(movie.id);
    const mediaType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

    // Clear previous card stream immediately so old ExoPlayer releases
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    currentCardId.current = movieId;
    setFocusedCardStream(null);

    // Resolve after 1200ms debounce — only if focus is still on this card
    cardStreamTimeout.current = setTimeout(async () => {
      if (currentCardId.current !== movieId) return;
      try {
        const result = await resolveStreamFromCloud(
          movieId,
          mediaType as 'movie' | 'tv',
          mediaType === 'tv' ? 1 : undefined,
          mediaType === 'tv' ? 1 : undefined,
          { title: movie.title || movie.name }
        );
        if (currentCardId.current === movieId && result?.url) {
          setFocusedCardStream({
            id: movieId,
            url: result.url,
            headers: result.headers && Object.keys(result.headers).length > 0
              ? JSON.stringify(result.headers)
              : undefined,
          });
        }
      } catch (e) {
        console.log('[NewHot] Card stream resolve failed:', e);
      }
    }, 1200);
  }, []);

  const handleItemPress = useCallback((movie: any) => {
    // Kill card stream before navigating
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    setFocusedCardStream(null);
    currentCardId.current = null;

    const mediaType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
    
    // Pass metadata for instant rendering on details page
    router.push({ 
      pathname: `/movie/${movie.id}`, 
      params: { 
        type: mediaType,
        title: movie.title || movie.name,
        poster: movie.poster_path,
        backdrop: movie.backdrop_path,
        overview: movie.overview,
        year: (movie.release_date || movie.first_air_date)?.split('-')[0],
        rating: movie.vote_average?.toString()
      } 
    });
  }, []);

  if (loading) return <HomeSkeleton />;

  // Helper: only supply the stream URL to the row that owns the focused card
  const rowProps = (content: any[]) => {
    const isActive = focusedCardStream !== null && content.some((m: any) => String(m.id) === focusedCardStream.id);
    return {
      focusedStreamUrl: isActive ? focusedCardStream!.url : undefined,
      focusedStreamHeaders: isActive ? focusedCardStream!.headers : undefined,
      onItemFocus: handleItemFocus,
      onItemPress: handleItemPress,
    };
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[`${pageColor}99`, `${pageColor}66`, '#000000']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      
      <ColorExtractor 
        imageUrl={getBackdropUrl(upcoming[0]?.backdrop_path) || ''} 
        onColorExtracted={(color) => setPageColor(color)}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        focusable={false}
      >
        {upcoming.length > 0 ? (
          <Pressable
            ref={heroBannerRef}
            hasTVPreferredFocus={true}
            onPress={() => handleItemPress(upcoming[0])}
            style={({ focused }) => [
              styles.heroContainer,
              focused && styles.heroFocused
            ]}
          >
            <ImageBackground
              source={{ uri: getBackdropUrl(upcoming[0]?.backdrop_path) }}
              style={styles.heroImage}
              resizeMode="cover"
            >
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)', '#000000']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroContent}>
                 <Text style={styles.heroPreTitle}>NEW & HOT</Text>
                 <Text style={styles.heroMovieTitle}>{upcoming[0]?.title || upcoming[0]?.name}</Text>
                 <Text style={styles.heroOverview} numberOfLines={3}>
                   {upcoming[0]?.overview}
                 </Text>
              </View>
            </ImageBackground>
          </Pressable>
        ) : (
          <View style={styles.header} pointerEvents="none">
             <Text style={styles.title}>New & Hot</Text>
             <Text style={styles.subtitle}>Discover what's coming soon and trending right now.</Text>
          </View>
        )}

        {/* 1. Coming Soon (Upcoming) */}
        <ExpandingRow
          ref={firstRowRef}
          title="🍿 Coming Soon"
          content={upcoming}
          {...rowProps(upcoming)}
        />

        {/* 2. Everyone's Watching */}
        <ExpandingRow 
          title="🔥 Everyone's Watching"
          content={trending}
          {...rowProps(trending)}
        />

        {/* 3. Top 10 Today */}
        <ExpandingRow 
          title="🔟 Top 10 Today"
          content={popular.slice(0, 10)}
          showRank={true}
          {...rowProps(popular.slice(0, 10))}
        />

        {/* 4. Fresh Arrivals */}
        <ExpandingRow 
          title="✨ Fresh Arrivals"
          content={popular.slice(10, 25)}
          {...rowProps(popular.slice(10, 25))}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
    paddingTop: 0,
  },
  header: {
    paddingHorizontal: 60,
    marginTop: TV_TOP_NAV_TOTAL_OFFSET + 12,
    marginBottom: 20,
  },
  title: {
    color: 'white',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    marginTop: 8,
    fontWeight: '500',
  },
  heroContainer: {
    width: '100%',
    height: 500,
    marginBottom: 40,
    borderWidth: 4,
    borderColor: 'transparent',
  },
  heroFocused: {
    borderColor: 'white',
    transform: [{ scale: 0.98 }],
  },
  heroImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 60,
    paddingBottom: 40,
  },
  heroPreTitle: {
    color: '#e50914',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroMovieTitle: {
    color: 'white',
    fontSize: 52,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroOverview: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    marginTop: 12,
    maxWidth: '60%',
    lineHeight: 26,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  }
});
