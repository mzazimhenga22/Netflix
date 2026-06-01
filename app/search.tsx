import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Image, Pressable, ScrollView, useWindowDimensions, FlatList, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchPopular, getImageUrl, getBackdropUrl, searchMulti } from '../services/tmdb';
import { SearchService } from '../services/SearchService';
import { NetflixLoader } from '../components/NetflixLoader';
import { useProfile } from '../context/ProfileContext';
import { isContentLockedForFreePlan } from '../services/AccessControl';
import Animated, { 
  FadeIn, 
  useSharedValue, 
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Removed static Dimensions measurement to prevent orientation-change distortion
// useWindowDimensions() is used inside the component instead.

const POPULAR_DICTIONARY = [
  "Stranger Things", "Wednesday", "Squid Game", "The Crown", "Bridgerton", "Avatar", 
  "Inception", "Titanic", "Breaking Bad", "Game of Thrones", "The Witcher", "Black Mirror", 
  "Ozark", "Mindhunter", "Narcos", "Peaky Blinders", "Better Call Saul", "Lucifer", 
  "The Umbrella Academy", "Money Heist", "Dark", "Elite", "You", "Sex Education", "Cobra Kai", 
  "The Queen's Gambit", "The Sandman", "Outer Banks", "Manifest", "Emily in Paris", 
  "Sweet Tooth", "Shadow and Bone", "Lupin", "Locke & Key", "Alice in Borderland", 
  "All of Us Are Dead", "Kingdom", "The Last Dance", "Rick and Morty", "BoJack Horseman", 
  "Friends", "The Office", "The Big Bang Theory", "Brooklyn Nine-Nine", "Sherlock", 
  "Fargo", "The Mandalorian", "The Boys", "Succession", "Ted Lasso", "Severance", 
  "Euphoria", "Dune", "Interstellar", "The Dark Knight", "Pulp Fiction", "Forrest Gump", 
  "The Matrix", "Gladiator", "The Godfather", "Star Wars", "Jurassic Park", "Spider-Man", 
  "Iron Man", "Avengers", "Black Panther", "The Lion King", "Frozen", "Toy Story", 
  "Shrek", "Harry Potter", "Lord of the Rings", "The Hobbit", "Hunger Games", "Twilight"
];

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

function findSpellingSuggestion(query: string, dictionary: string[]): string | null {
  const cleanQuery = query.toLowerCase().trim();
  if (cleanQuery.length < 3) return null;

  let bestMatch: string | null = null;
  let minDistance = 3; // Max threshold distance is 2 edits

  for (const title of dictionary) {
    if (!title) continue;
    const cleanTitle = title.toLowerCase().trim();
    // Exact match: no suggestion needed
    if (cleanTitle === cleanQuery) return null;

    // Check if query is a substring of the title
    if (cleanTitle.includes(cleanQuery)) {
      continue;
    }

    const dist = getLevenshteinDistance(cleanQuery, cleanTitle);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = title;
    }
  }

  return bestMatch;
}

export default function SearchScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [spellingSuggestion, setSpellingSuggestion] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  
  const { selectedProfile } = useProfile();
  const isKids = selectedProfile?.isKids || false;
  
  const [isFreePlan, setIsFreePlan] = useState(false);

  useEffect(() => {
    const { SubscriptionService } = require('../services/SubscriptionService');
    const unsub = SubscriptionService.listenToSubscription((sub: any) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);
  
  const searchBarWidth = useSharedValue(width - 32);

  // Load Recent Searches
  useEffect(() => {
    if (!selectedProfile) return;
    
    // Initial load from local storage
    SearchService.getRecentSearchesLocal(selectedProfile.id).then(setRecentSearches);

    // Real-time sync from Firestore
    const unsubscribe = SearchService.subscribeToRecentSearches(selectedProfile.id, (queries) => {
      if (queries && queries.length > 0) {
        setRecentSearches(queries);
      }
    });

    return () => unsubscribe();
  }, [selectedProfile]);

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
        
        // Generate live spelling and search suggestions
        if (results && results.length > 0) {
          const suggestions: string[] = [];
          for (const item of results) {
            const title = item.title || item.name;
            if (title && !suggestions.includes(title)) {
              suggestions.push(title);
            }
            if (suggestions.length >= 5) break;
          }
          setLiveSuggestions(suggestions);
          setSpellingSuggestion(null);
        } else {
          setLiveSuggestions([]);
          // If no results, perform fuzzy search against top Searches & popular titles dictionary
          const dict = [...POPULAR_DICTIONARY, ...topSearches.map(t => t.title || t.name).filter(Boolean)];
          const suggestion = findSpellingSuggestion(searchQuery, dict);
          setSpellingSuggestion(suggestion);
        }
        
        // Save to recent searches if result is found (Netflix-like behavior)
        if (results.length > 0 && searchQuery.length > 3) {
           SearchService.saveSearch(selectedProfile?.id || '', searchQuery);
        }
      } else {
        setSearchResults([]);
        setLiveSuggestions([]);
        setSpellingSuggestion(null);
      }
    }, 600); // 600ms debounce for smoother live typing corrections

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isKids, topSearches]);

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
            returnKeyType="search"
            onSubmitEditing={() => {
              if (searchQuery.trim()) {
                SearchService.saveSearch(selectedProfile?.id || '', searchQuery);
              }
            }}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSearchQuery('');
            }} style={styles.iconBtn}>
              <Ionicons name="close-circle" size={20} color="#b3b3b3" />
            </Pressable>
          ) : (
            <Pressable style={styles.iconBtn} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
              <Ionicons name="mic" size={20} color="#b3b3b3" />
            </Pressable>
          )}
        </Animated.View>
        
        {searchQuery.length > 0 || (searchBarWidth.value && searchBarWidth.value < width - 40) ? (
          <Pressable onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleCancel();
          }} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Spelling Correction & Autocomplete Suggestions */}
      {searchQuery.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {spellingSuggestion && (
            <Pressable 
              style={styles.spellingBanner}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchQuery(spellingSuggestion);
              }}
            >
              <Ionicons name="sparkles" size={16} color="#E50914" />
              <Text style={styles.spellingText}>
                Did you mean: <Text style={styles.spellingHighlight}>{spellingSuggestion}</Text>?
              </Text>
            </Pressable>
          )}

          {liveSuggestions.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsHorizontalScroll}
            >
              {liveSuggestions.map((suggestion, index) => (
                <Pressable
                  key={index}
                  style={styles.suggestionPill}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSearchQuery(suggestion);
                  }}
                >
                  <Ionicons name="search" size={12} color="#A3A3A3" style={{ marginRight: 4 }} />
                  <Text style={styles.suggestionPillText} numberOfLines={1}>{suggestion}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {!searchQuery ? (
        <FlatList
          data={topSearches}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={
            recentSearches.length > 0 ? (
              <View style={[styles.section, { marginBottom: 20 }]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent Searches</Text>
                  <Pressable onPress={() => SearchService.clearSearchHistory(selectedProfile?.id || '')}>
                     <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, gap: 8 }}>
                  {recentSearches.map((query, index) => (
                    <Pressable 
                      key={index} 
                      style={styles.recentItem}
                      onPress={() => setSearchQuery(query)}
                    >
                      <Text style={styles.recentItemText}>{query}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          ListHeaderComponentStyle={{ paddingBottom: 10 }}
          ListEmptyComponent={
             <View style={styles.section}><Text style={styles.sectionTitle}>Top Searches</Text></View>
          }
          renderItem={({ item }) => {
            const isLocked = isContentLockedForFreePlan(item.id, isFreePlan);
            
            return (
              <Pressable 
                style={styles.searchItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isLocked) {
                    const { Alert } = require('react-native');
                    Alert.alert(
                      'Upgrade Required',
                      'This content is locked on the Free Plan. Upgrade your subscription to watch.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Upgrade', onPress: () => router.push('/subscription') }
                      ]
                    );
                    return;
                  }
                  router.push({
                    pathname: "/movie/[id]",
                    params: { id: item.id.toString(), type: 'movie' }
                  });
                }}
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  if (isLocked) {
                    const { Alert } = require('react-native');
                    Alert.alert(
                      'Upgrade Required',
                      'This content is locked on the Free Plan. Upgrade your subscription to watch.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Upgrade', onPress: () => router.push('/subscription') }
                      ]
                    );
                    return;
                  }
                  router.push({ pathname: "/movie/[id]", params: { id: item.id.toString(), type: 'movie', autoplay: 'true' }});
                }}>
                  <Ionicons name="play-circle-outline" size={32} color="#fff" style={styles.playIcon} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={styles.resultsGrid}>
          {loading ? (
            <View style={{ marginTop: 50, alignItems: 'center' }}>
               <NetflixLoader size={40} />
            </View>
          ) : (
            <FlatList
              key={`grid-${Math.max(3, Math.floor((width - 16) / 110))}`}
              data={searchResults}
              keyExtractor={(item) => item.id.toString()}
              numColumns={Math.max(3, Math.floor((width - 16) / 110))}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.columnWrapper}
              renderItem={({ item, index }) => {
                const isLocked = isContentLockedForFreePlan(item.id, isFreePlan);
                
                const numCols = Math.max(3, Math.floor((width - 16) / 110));
                const itemWidth = (width - 16 - (8 * (numCols - 1))) / numCols;
                
                return (
                  <Animated.View 
                    entering={FadeIn.delay((index % 15) * 30)}
                    style={[styles.gridItem, { width: itemWidth, aspectRatio: 2/3 }]}
                  >
                    <Pressable onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (isLocked) {
                        const { Alert } = require('react-native');
                        Alert.alert(
                          'Upgrade Required',
                          'This content is locked on the Free Plan. Upgrade your subscription to watch.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Upgrade', onPress: () => router.push('/subscription') }
                          ]
                        );
                        return;
                      }
                      router.push({
                        pathname: "/movie/[id]",
                        params: { id: item.id.toString(), type: item.media_type || 'movie' }
                      });
                    }}>
                      <Image source={{ uri: getImageUrl(item.poster_path) }} style={styles.gridImage} />
                      {isLocked && (
                        <View style={{...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'}}>
                          <Text style={{fontSize: 24}}>🔒</Text>
                        </View>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              }}
            />
          )}
        </View>
      )}
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
  listContent: {
    paddingBottom: 60,
  },
  section: {
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  clearText: {
    color: '#b3b3b3',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  recentItem: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recentItemText: {
    color: '#fff',
    fontSize: 14,
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
  columnWrapper: {
    gap: 8,
    paddingHorizontal: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 10,
    gap: 8, // Tighter gap
  },
  gridItem: {
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
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#000',
  },
  spellingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.25)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  spellingText: {
    color: '#D4D4D4',
    fontSize: 13,
    marginLeft: 8,
  },
  spellingHighlight: {
    color: '#E50914',
    fontWeight: '700',
    fontStyle: 'italic',
  },
  suggestionsHorizontalScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  suggestionPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
});
