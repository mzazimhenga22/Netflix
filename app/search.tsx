import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Image, Pressable, ScrollView, Dimensions, FlatList, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchPopular, getImageUrl, getBackdropUrl, searchMulti } from '../services/tmdb';
import { NetflixLoader } from '../components/NetflixLoader';
import { useProfile } from '../context/ProfileContext';
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

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  
  const { selectedProfile } = useProfile();
  const isKids = selectedProfile?.isKids || false;
  
  const searchBarWidth = useSharedValue(width - 32);

  useEffect(() => {
    const loadTopSearches = async () => {
      const data = await fetchPopular('movie', isKids);
      setTopSearches(data.slice(0, 12));
    };
    loadTopSearches();
  }, [isKids]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery) {
        setLoading(true);
        const results = await searchMulti(searchQuery, isKids);
        setSearchResults(results);
        setLoading(false);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isKids]);

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
      
      {/* Standard iOS Search Bar */}
      <View style={styles.header}>
        <Animated.View style={[styles.searchBar, { width: searchBarWidth }]}>
          <Ionicons name="search" size={20} color="#b3b3b3" />
          <TextInput
            ref={searchInputRef}
            style={styles.input}
            placeholder="Search games, shows, movies..."
            placeholderTextColor="#b3b3b3"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={handleSearchFocus}
            selectionColor="#e50914"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} style={styles.iconBtn}>
              <Ionicons name="close-circle" size={20} color="#b3b3b3" />
            </Pressable>
          ) : (
            <Pressable style={styles.iconBtn}>
              <Ionicons name="mic" size={20} color="#b3b3b3" />
            </Pressable>
          )}
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
            {/* Top Searches List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Searches</Text>
              {topSearches.map((item) => (
                <Pressable 
                  key={item.id} 
                  style={styles.searchItem}
                  onPress={() => router.push({
                    pathname: "/movie/[id]",
                    params: { id: item.id.toString(), type: 'movie' }
                  })}
                >
                  <Image 
                    source={{ uri: getBackdropUrl(item.backdrop_path) }} 
                    style={styles.searchItemImage} 
                  />
                  <View style={styles.searchItemInfo}>
                    <Text style={styles.searchItemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                  <Pressable onPress={(e) => {
                    e.stopPropagation();
                    router.push({ pathname: "/movie/[id]", params: { id: item.id.toString(), type: 'movie', autoplay: 'true' }});
                  }}>
                    <Ionicons name="play-circle-outline" size={32} color="#fff" style={styles.playIcon} />
                  </Pressable>
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
                    <Pressable onPress={() => router.push({
                      pathname: "/movie/[id]",
                      params: { id: item.id.toString(), type: item.media_type || 'movie' }
                    })}>
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
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36, // Standard iOS height
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    marginLeft: 8,
    fontWeight: '400',
  },
  iconBtn: {
    padding: 4,
  },
  cancelBtn: {
    paddingHorizontal: 4,
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
    backgroundColor: '#121212', // Standard dark background
    paddingVertical: 2,
    gap: 12,
  },
  searchItemImage: {
    width: 140,
    height: 78,
    borderRadius: 4,
  },
  searchItemInfo: {
    flex: 1,
    paddingVertical: 10,
  },
  searchItemTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  playIcon: {
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 10,
    gap: 8, // Tighter gap
  },
  gridItem: {
    width: (width - 32) / 3, // Compute carefully for 3 columns with 8px gap
    aspectRatio: 2/3,
    borderRadius: 4,
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
