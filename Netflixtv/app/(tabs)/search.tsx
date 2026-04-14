import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  ActivityIndicator,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { searchMulti, getImageUrl, fetchTrending, fetchDiscoverByGenre } from '../../services/tmdb';
import { SearchService } from '../../services/SearchService';
import { useProfile } from '../../context/ProfileContext';
import TvPosterCard from '../../components/TvPosterCard';
import TvKeyboard from '../../components/TvKeyboard';

export default function SearchScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const isKids = selectedProfile?.isKids;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  React.useEffect(() => {
    async function loadTrending() {
      const data = await fetchTrending('all', isKids);
      setTrending(data.slice(0, 12));
    }
    loadTrending();
  }, [isKids]);

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
        const data = await searchMulti(text, isKids);
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

  const GENRE_MAP: Record<string, number> = isKids
    ? { Animation: 16, Comedy: 35, 'Sci-Fi': 878, Anime: 16, Fantasy: 14 }
    : { Action: 28, Comedy: 35, 'Sci-Fi': 878, Horror: 27, Documentaries: 99, Anime: 16, Romance: 10749 };

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
      const data = await fetchDiscoverByGenre('movie', genreId, isKids);
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
        {/* Left Sidebar */}
        <View style={styles.sidebar}>
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
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          ) : (
            <FlatList
              data={query.length > 2 ? results : activeGenre ? results : trending}
              keyExtractor={(item) => item.id.toString()}
              numColumns={4}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={{ marginRight: 25, marginBottom: 30 }}>
                  <TvPosterCard
                    title={item.title || item.name}
                    imageUrl={getImageUrl(item.poster_path) || ''}
                    width={200}
                    height={300}
                    showBadge={true}
                    onPress={() => router.push({ pathname: `/movie/${item.id}`, params: { type: item.media_type || 'movie' } })}
                  />
                </View>
              )}
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
    paddingHorizontal: 40,
    paddingTop: 20,
    backgroundColor: '#000',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  queryDisplay: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 1,
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
