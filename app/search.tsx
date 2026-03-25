import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Image, Pressable, ScrollView, Dimensions, FlatList, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchPopular, getImageUrl, getBackdropUrl, searchMulti } from '../services/tmdb';
import { NetflixLoader } from '../components/NetflixLoader';
import Animated, { 
  FadeIn, 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const BENTO_ITEMS = [
  { id: '1', title: 'Action', color: '#e50914', size: 'large', icon: 'flash' },
  { id: '2', title: 'Games', color: '#2b0a14', size: 'small', icon: 'gamepad-variant' },
  { id: '3', title: 'Live', color: '#1a1a1a', size: 'small', icon: 'broadcast' },
  { id: '4', title: 'Sci-Fi', color: '#0071eb', size: 'medium', icon: 'rocket' },
  { id: '5', title: 'Romance', color: '#ff4d4d', size: 'medium', icon: 'heart' },
  { id: '6', title: 'Docs', color: '#333', size: 'small', icon: 'book-open-variant' },
];

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  
  const searchBarWidth = useSharedValue(width - 32);
  const aiSparkleScale = useSharedValue(1);

  useEffect(() => {
    const loadTopSearches = async () => {
      const data = await fetchPopular('movie');
      setTopSearches(data.slice(0, 12));
    };
    loadTopSearches();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery) {
        setLoading(true);
        const results = await searchMulti(searchQuery);
        setSearchResults(results);
        setLoading(false);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearchFocus = () => {
    searchBarWidth.value = withSpring(width - 80);
  };

  const handleCancel = () => {
    searchInputRef.current?.blur();
    setSearchQuery('');
    searchBarWidth.value = withSpring(width - 32);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Immersive AI Search Bar */}
      <View style={styles.header}>
        <Animated.View style={[styles.searchBar, { width: searchBarWidth }]}>
          <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" />
          <TextInput
            ref={searchInputRef}
            style={styles.input}
            placeholder="Ask AI or search titles..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (text.length > 0) aiSparkleScale.value = withSpring(1.2);
              else aiSparkleScale.value = withSpring(1);
            }}
            onFocus={handleSearchFocus}
          />
          <Pressable style={styles.aiButton} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
            <Animated.View style={{ transform: [{ scale: aiSparkleScale }] }}>
              <MaterialCommunityIcons name="creation" size={20} color="#0071eb" />
            </Animated.View>
          </Pressable>
        </Animated.View>
        
        {searchQuery.length > 0 || searchBarWidth.value < width - 40 ? (
          <Pressable onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!searchQuery ? (
          <>
            {/* Immersive Discovery Tab (TikTok Style) */}
            <View style={styles.discoverySection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Discovery Feed</Text>
                <Pressable><Text style={styles.seeAll}>Vibe Check</Text></Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={width * 0.8 + 10} decelerationRate="fast">
                {topSearches.slice(0, 5).map((item, index) => (
                  <Pressable 
                    key={item.id} 
                    style={styles.discoveryCard}
                    onPress={() => router.push(`/movie/${item.id}`)}
                  >
                    <Image source={{ uri: getBackdropUrl(item.backdrop_path) }} style={styles.discoveryImage} />
                    <View style={styles.discoveryOverlay}>
                      <View style={styles.liveTag}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>CLIPS</Text>
                      </View>
                      <Text style={styles.discoveryTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Bento Discovery */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Browse Everything</Text>
              <View style={styles.bentoGrid}>
                {BENTO_ITEMS.map((item, index) => {
                   const itemWidth = item.size === 'large' ? width - 32 : (item.size === 'medium' ? (width - 42) * 0.55 : (width - 42) * 0.4);
                   return (
                    <Animated.View 
                      key={item.id}
                      entering={FadeInDown.delay(index * 50)}
                      style={[styles.bentoItem, { backgroundColor: item.color, width: itemWidth }]}
                    >
                      <MaterialCommunityIcons name={item.icon as any} size={22} color="rgba(255,255,255,0.4)" />
                      <Text style={styles.bentoTitle}>{item.title}</Text>
                    </Animated.View>
                   );
                })}
              </View>
            </View>

            {/* Top Searches List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommended for You</Text>
              {topSearches.map((item) => (
                <Pressable 
                  key={item.id} 
                  style={styles.searchItem}
                  onPress={() => router.push(`/movie/${item.id}`)}
                >
                  <Image 
                    source={{ uri: getImageUrl(item.poster_path) }} 
                    style={styles.searchItemImage} 
                  />
                  <View style={styles.searchItemInfo}>
                    <Text style={styles.searchItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.searchItemMeta}>Trending • 2026</Text>
                  </View>
                  <Ionicons name="play-circle-outline" size={28} color="rgba(255,255,255,0.6)" />
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.resultsGrid}>
            {loading ? (
              <View style={{ marginTop: 50, alignItems: 'center' }}>
                 <NetflixLoader size={40} />
              </View>
            ) : (
              <View style={styles.grid}>
                {searchResults.map((item, index) => (
                  <Animated.View 
                    key={item.id} 
                    entering={FadeIn.delay(index * 30)}
                    style={styles.gridItem}
                  >
                    <Pressable onPress={() => router.push(`/movie/${item.id}`)}>
                      <Image source={{ uri: getImageUrl(item.poster_path) }} style={styles.gridImage} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
    fontWeight: '500',
  },
  aiButton: {
    padding: 4,
  },
  cancelBtn: {
    paddingHorizontal: 4,
  },
  cancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  discoverySection: {
    marginTop: 10,
    paddingLeft: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  seeAll: {
    color: '#0071eb',
    fontWeight: 'bold',
    fontSize: 14,
  },
  discoveryCard: {
    width: width * 0.8,
    height: 200,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  discoveryImage: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  discoveryOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  discoveryTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    marginTop: 30,
    paddingHorizontal: 16,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 15,
  },
  bentoItem: {
    height: 100,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bentoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bentoIcon: {
    alignSelf: 'flex-end',
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 8,
    gap: 12,
  },
  searchItemImage: {
    width: 60,
    height: 80,
    borderRadius: 8,
  },
  searchItemInfo: {
    flex: 1,
  },
  searchItemTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  searchItemMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  gridItem: {
    width: (width - 52) / 3,
    aspectRatio: 2/3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  resultsGrid: {
    flex: 1,
  }
});
