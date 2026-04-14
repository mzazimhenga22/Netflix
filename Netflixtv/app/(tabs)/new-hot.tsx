import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Dimensions, 
  FlatList, 
  ActivityIndicator,
  Pressable
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchUpcoming, getBackdropUrl } from '../../services/tmdb';
import { TrailerResolver, TrailerStream } from '../../components/TrailerResolver';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

// We use the full height for each item, minus the Top Nav height (approx 100px)
const ITEM_HEIGHT = height - 100;

export default function NewHotScreen() {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchUpcoming();
        if (data) {
          // Send all items
          setUpcoming(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id.toString()}
        pagingEnabled
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item, index }) => (
          <FeedItem 
            item={item} 
            isActive={index === activeIndex} 
            onFocus={() => setActiveIndex(index)}
          />
        )}
      />
    </View>
  );
}

function FeedItem({ item, isActive, onFocus }: { item: any, isActive: boolean, onFocus: () => void }) {
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [reminded, setReminded] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const focusTimeout = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Re-fetch or reset trailer when active state changes
  useEffect(() => {
    if (isActive) {
      focusTimeout.current = setTimeout(() => {
        setShowTrailer(true);
      }, 1000); // 1-second delay before switching to video
    } else {
      if (focusTimeout.current) clearTimeout(focusTimeout.current);
      setShowTrailer(false);
    }
    return () => {
      if (focusTimeout.current) clearTimeout(focusTimeout.current);
    }
  }, [isActive]);

  const player = useVideoPlayer(trailerUrl && isActive && showTrailer ? { uri: trailerUrl } : null, (player) => {
    player.loop = true;
    player.muted = false; // "New & Hot" usually auto-plays with sound
    player.play();
  });

  const handleTrailerResolved = useCallback((stream: TrailerStream) => {
    setTrailerUrl(stream.url);
  }, []);

  // Format the date
  const releaseDate = new Date(item.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <Pressable onFocus={onFocus} style={[styles.itemContainer, { height: ITEM_HEIGHT }]}>
      {/* Background Graphic */}
      <View style={StyleSheet.absoluteFill}>
        {isActive && !trailerUrl && (
           <TrailerResolver
             tmdbId={item.id}
             mediaType="movie"
             onResolved={handleTrailerResolved}
             onError={() => {}}
             enabled={true}
           />
        )}

        <Image 
          source={{ uri: getBackdropUrl(item.backdrop_path) }} 
          style={StyleSheet.absoluteFill} 
          contentFit="cover"
        />

        {isActive && trailerUrl && showTrailer && (
           <Animated.View entering={FadeIn.duration(1000)} exiting={FadeOut} style={StyleSheet.absoluteFill}>
             <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
             />
           </Animated.View>
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.9)']}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Foreground Content */}
      <View style={styles.contentOverlay}>
         {/* Metadata Left */}
         <View style={styles.metadataPane}>
            <View style={styles.nSeriesContainer}>
               <Image 
                 source={require('../../assets/images/netflix-n-logo.svg')} 
                 style={styles.nLogo} 
                 contentFit="contain"
               />
               <Text style={styles.nSeriesText}>FILM</Text>
            </View>

            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.releaseDate}>Coming {releaseDate}</Text>
            <Text style={styles.synopsis} numberOfLines={3}>{item.overview}</Text>
         </View>

         {/* Actions Right */}
         <View style={styles.actionsPane}>
            <Pressable 
              onPress={() => setReminded(!reminded)}
              style={({ focused }) => [
                styles.actionBtn, 
                focused && styles.actionBtnFocused
              ]}
            >
               <Ionicons name={reminded ? "notifications" : "notifications-outline"} size={36} color="white" />
               <Text style={styles.actionText}>{reminded ? "Reminded" : "Remind Me"}</Text>
            </Pressable>
            
            <Pressable 
              style={({ focused }) => [
                styles.actionBtn, 
                focused && styles.actionBtnFocused
              ]}
              onPress={() => router.push({ pathname: `/movie/${item.id}`, params: { type: 'movie' } })}
            >
               <Ionicons name="information-circle-outline" size={36} color="white" />
               <Text style={styles.actionText}>Info</Text>
            </Pressable>
         </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 100, // TopNav offset
  },
  center: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#000',
  },
  itemContainer: {
    width: width,
    justifyContent: 'flex-end',
  },
  contentOverlay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 80,
    paddingBottom: 60,
  },
  metadataPane: {
    width: '60%',
  },
  nSeriesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
  },
  nLogo: {
    width: 25,
    height: 35,
  },
  nSeriesText: {
    color: '#E50914',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
  },
  title: {
    color: 'white',
    fontSize: 72,
    fontWeight: '900',
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    marginBottom: 10,
  },
  releaseDate: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  synopsis: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20,
    lineHeight: 30,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  actionsPane: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 20,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 10,
    padding: 15,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.0)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionBtnFocused: {
    borderColor: 'white',
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 1.1 }],
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
