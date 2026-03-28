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
import { searchMulti, getImageUrl, fetchTrending } from '../../services/tmdb';
import TvPosterCard from '../../components/TvPosterCard';
import TvKeyboard from '../../components/TvKeyboard';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '../../context/ProfileContext';

export default function SearchScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const isKids = selectedProfile?.isKids;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    async function loadTrending() {
      const data = await fetchTrending('all', isKids);
      setTrending(data.slice(0, 12));
    }
    loadTrending();
  }, [isKids]);

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
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setResults([]);
    }
  };

  const GENRES = isKids ? ["Animation", "Comedy", "Sci-Fi", "Anime", "Fantasy"] : ["Action", "Comedy", "Sci-Fi", "Horror", "Documentaries", "Anime", "Romance"];

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

          <View style={styles.genreList}>
            {GENRES.map((genre) => (
              <Pressable
                key={genre}
                style={({ focused }) => [styles.genreButton, focused && styles.focusedGenre]}
              >
                <Text style={styles.genreText}>{genre}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Right Content */}
        <View style={styles.mainContent}>
          <Text style={styles.resultsTitle}>
            {query.length > 2 ? `Results for "${query}"` : "Your Search Recommendations"}
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          ) : (
            <FlatList
              data={query.length > 2 ? results : trending}
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
  genreList: {
    marginTop: 40,
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
