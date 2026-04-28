import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  ScrollView,
  Pressable,
  useWindowDimensions,
  findNodeHandle
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { searchMulti, getImageUrl, fetchTrending, fetchDiscoverByGenre } from '../../services/tmdb';
import { SearchService } from '../../services/SearchService';
import { useProfile } from '../../context/ProfileContext';
import TvPosterCard from '../../components/TvPosterCard';
import TvKeyboard from '../../components/TvKeyboard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

export default function SearchScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { setHeroFocusTag } = useTvFocusBridge();
  const { selectedProfile } = useProfile();
  const maturityLevel = selectedProfile?.maturityLevel;
  const isKids = selectedProfile?.isKids;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [isFreePlan, setIsFreePlan] = useState(false);
  const firstGenreRef = React.useRef<any>(null);

  React.useEffect(() => {
    const { SubscriptionService } = require('../../services/SubscriptionService');
    const unsub = SubscriptionService.listenToSubscription((sub: any) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    async function loadTrending() {
      const data = await fetchTrending('all', maturityLevel);
      setTrending(data.slice(0, 12));
    }
    loadTrending();
  }, [maturityLevel]);

  // Load Recent Searches
  React.useEffect(() => {
    if (!selectedProfile) return;
    
    SearchService.getRecentSearchesLocal(selectedProfile.id).then(setRecentSearches);

    const unsubscribe = SearchService.subscribeToRecentSearches(selectedProfile.id, (queries) => {
      if (queries && queries.length > 0) {
        setRecentSearches(queries);
      }
    });

    return () => unsubscribe();
  }, [selectedProfile]);

  useFocusEffect(
    useCallback(() => {
      const tag = findNodeHandle(firstGenreRef.current);
      setHeroFocusTag(typeof tag === 'number' ? tag : null);
      return () => setHeroFocusTag(null);
    }, [setHeroFocusTag])
  );

  const handleKeyPress = (key: string) => {
    const newQuery = query + key;
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  const handleBackspace = () => {
    const newQuery = query.slice(0, -1);
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
  };

  const debouncedSearch = async (text: string) => {
    if (text.length > 2) {
      setLoading(true);
      try {
        const data = await searchMulti(text, maturityLevel);
        setResults(data);
        
        if (data.length > 0 && text.length > 3) {
           SearchService.saveSearch(selectedProfile?.id || '', text);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setResults([]);
    }
  };

  const getGenreMap = () => {
    switch(maturityLevel) {
      case 'G':
        return { Animation: 16, Family: 10751, Kids: 10762, Music: 10402 };
      case 'PG':
        return { Animation: 16, Comedy: 35, Adventure: 12, Fantasy: 14, Kids: 10762 };
      case 'TV-14':
        return { Action: 28, Comedy: 35, 'Sci-Fi': 878, Romance: 10749, Drama: 18, Anime: 16 };
      default: // MA
        return { Action: 28, Comedy: 35, 'Sci-Fi': 878, Horror: 27, Documentaries: 99, Anime: 16, Romance: 10749, Thriller: 53 };
    }
  };

  const GENRE_MAP = getGenreMap();

  const GENRES = Object.keys(GENRE_MAP);

  const handleGenrePress = async (genre: string) => {
    if (activeGenre === genre) {
      // Toggle off — go back to trending
      setActiveGenre(null);
      setResults([]);
      setQuery('');
      return;
    }
    setActiveGenre(genre);
    setQuery('');
    setLoading(true);
    try {
      const genreId = GENRE_MAP[genre];
      const data = await fetchDiscoverByGenre('movie', genreId, maturityLevel);
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Left Sidebar — Scrollable */}
        <View style={styles.sidebar}>
          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sidebarContent}
          >
            <View style={styles.searchBox}>
               <Ionicons name="search" size={24} color="rgba(255,255,255,0.6)" />
               <Text style={styles.queryDisplay}>{query || 'Search...'}</Text>
            </View>
            
            <TvKeyboard 
              onKeyPress={handleKeyPress}
              onBackspace={handleBackspace}
              onClear={handleClear}
            />

            {/* Recent Searches (TV specific layout) */}
            {recentSearches.length > 0 && !query && (
              <View style={styles.recentContainer}>
                 <View style={styles.recentHeader}>
                   <Text style={styles.recentTitle}>Recents</Text>
                   <Pressable onPress={() => SearchService.clearSearchHistory(selectedProfile?.id || '')}>
                     <Text style={styles.clearText}>Clear</Text>
                   </Pressable>
                 </View>
                 <View style={styles.recentList}>
                   {recentSearches.slice(0, 5).map((q, i) => (
                     <Pressable 
                       key={i} 
                       style={({ focused }) => [styles.recentBtn, focused && styles.focusedRecent]}
                       onPress={() => {
                          setQuery(q);
                          debouncedSearch(q);
                       }}
                     >
                       <Text style={styles.recentText} numberOfLines={1}>{q}</Text>
                     </Pressable>
                   ))}
                 </View>
              </View>
            )}

            <View style={styles.genreList}>
              {GENRES.map((genre) => (
                <Pressable
                  key={genre}
                  ref={genre === GENRES[0] ? firstGenreRef : undefined}
                  style={({ focused }) => [
                    styles.genreButton,
                    focused && styles.focusedGenre,
                    activeGenre === genre && styles.activeGenre,
                  ]}
                  onPress={() => handleGenrePress(genre)}
                >
                  <Text style={[styles.genreText, activeGenre === genre && styles.activeGenreText]}>{genre}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Right Content */}
        <View style={styles.mainContent}>
          <Text style={styles.resultsTitle}>
            {activeGenre
              ? `${activeGenre} Titles`
              : query.length > 2
              ? `Results for "${query}"`
              : 'Your Search Recommendations'}
          </Text>

          {loading ? (
            <View style={styles.center}>
              <LoadingSpinner size={82} label="Searching" />
            </View>
          ) : (
            <FlatList
              key={`grid-${Math.max(2, Math.floor(((width * 0.7) - 120) / 225))}`}
              data={query.length > 2 ? results : activeGenre ? results : trending}
              keyExtractor={(item) => item.id.toString()}
              numColumns={Math.max(2, Math.floor(((width * 0.7) - 120) / 225))}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const hash = String(item.id).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                const isLocked = isFreePlan && (hash % 3 === 0);
                
                const numCols = Math.max(2, Math.floor(((width * 0.7) - 120) / 225));
                const itemWidth = ((width * 0.7) - 120 - (25 * (numCols - 1))) / numCols;
                
                return (
                  <View style={{ marginRight: 25, marginBottom: 30 }}>
                    <TvPosterCard
                      title={item.title || item.name}
                      imageUrl={getImageUrl(item.poster_path) || ''}
                      width={itemWidth}
                      height={itemWidth * 1.5}
                      showBadge={true}
                      isLocked={isLocked}
                      onPress={() => {
                        if (isLocked) {
                          const { Alert } = require('react-native');
                          Alert.alert(
                            'Upgrade Required',
                            'This content is locked on the Free Plan. Scan the QR code on the main screen to upgrade.'
                          );
                          return;
                        }
                        router.push({ pathname: `/movie/${item.id}`, params: { type: item.media_type || 'movie' } });
                      }}
                    />
                  </View>
                );
              }}
              ListEmptyComponent={
                query.length > 2 ? (
                  <View style={styles.center}>
                    <Text style={styles.emptyText}>No results found for "{query}"</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 100, // Matching top nav
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: '30%',
    paddingTop: 20,
    backgroundColor: '#000',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  sidebarContent: {
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  queryDisplay: {
    color: 'white',
    fontSize: 26,
    fontWeight: '700',
    marginLeft: 15,
  },
  recentContainer: {
    marginTop: 20,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  clearText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },
  recentList: {
    gap: 8,
  },
  recentBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  focusedRecent: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  recentText: {
    color: 'white',
    fontSize: 18,
  },
  genreList: {
    marginTop: 30,
    gap: 10,
  },
  genreButton: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  focusedGenre: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activeGenre: {
    backgroundColor: '#E50914',
  },
  activeGenreText: {
    color: 'white',
  },
  genreText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 22,
    fontWeight: '600',
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 60,
    backgroundColor: '#000',
  },
  resultsTitle: {
    color: 'white',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 40,
  },
  listContent: {
    paddingBottom: 60,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 20,
  }
});
