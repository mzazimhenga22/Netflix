import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Text } from 'react-native';
import { fetchPopular, fetchTopRated, fetchDiscoverByGenre, getImageUrl, getBackdropUrl, getLogoUrl, fetchMovieImages } from '../../services/tmdb';
import { useRouter } from 'expo-router';
import { useProfile } from '../../context/ProfileContext';
import NativeHeroBanner from '../../components/NativeHeroBanner';
import ColorExtractor from '../../components/ColorExtractor';
import ExpandingRow from '../../components/ExpandingRow';
import TvCategoryPills from '../../components/TvCategoryPills';
import HomeSkeleton from '../../components/HomeSkeleton';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function MoviesScreen() {
  const [data, setData] = useState<{
    popular: any[],
    topRated: any[],
    horror: any[],
    action: any[],
    comedy: any[]
  }>({
    popular: [],
    topRated: [],
    horror: [],
    action: [],
    comedy: [],
  });
  const [heroMovie, setHeroMovie] = useState<any>(null);
  const [heroLogo, setHeroLogo] = useState<string | null>(null);
  const [heroColors, setHeroColors] = useState<readonly [string, string, string]>(['rgba(20, 20, 20, 0.8)', 'rgba(10, 10, 10, 0.9)', '#000']);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const movieCategories = useMemo(() => [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 27, name: 'Horror' }
  ], []);

  const { selectedProfile } = useProfile();
  const isKids = selectedProfile?.isKids;

  useEffect(() => {
    async function loadData() {
      try {
        const [pop, top, hor, act, com] = await Promise.all([
          fetchPopular('movie', isKids),
          fetchTopRated('movie', isKids),
          fetchDiscoverByGenre('movie', 27, isKids),
          fetchDiscoverByGenre('movie', 28, isKids),
          fetchDiscoverByGenre('movie', 35, isKids),
        ]);
        setData({
          popular: pop,
          topRated: top,
          horror: hor,
          action: act,
          comedy: com,
        });
        setHeroMovie(pop[0]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isKids]);

  useEffect(() => {
    async function loadLogo() {
      if (!heroMovie) return;
      try {
        const images = await fetchMovieImages(heroMovie.id, 'movie');
        if (images?.logos?.length > 0) {
          const engLogo = images.logos.find((l: any) => l.iso_639_1 === 'en');
          const logoToUse = engLogo || images.logos[0];
          setHeroLogo(getLogoUrl(logoToUse.file_path) || null);
        } else {
          setHeroLogo(null);
        }
      } catch (e) { setHeroLogo(null); }
    }
    loadLogo();
  }, [heroMovie]);

  const handleColorExtracted = useCallback((color: string) => {
    setHeroColors([`${color}B3`, `${color}80`, '#000000']);
  }, []);

  const handleSelect = useCallback((id: number) => {
    router.push({ pathname: `/movie/${id}`, params: { type: 'movie' } });
  }, [router]);

  // Build rows data with useMemo
  const rowData = useMemo(() => {
    const allRows = [
      { id: 'action', title: 'Action Blockbusters', data: data.action, genreId: 28 },
      { id: 'popular', title: 'Trending Movies', data: data.popular, genreId: null },
      { id: 'topRated', title: 'Award-Winning Films', data: data.topRated, genreId: null },
      ...(isKids ? [] : [{ id: 'horror', title: 'Horror & Thrillers', data: data.horror, genreId: 27 }]),
      { id: 'comedy', title: 'Comedy Favorites', data: data.comedy, genreId: 35 },
    ];
    if (selectedCategory === null) return allRows;
    return allRows.filter(r => r.genreId === null || r.genreId === selectedCategory);
  }, [data, selectedCategory, isKids]);

  const renderRow = useCallback(({ item: row }: { item: any }) => (
    <ExpandingRow 
      title={row.title}
      data={row.data} 
      onSelect={handleSelect}
      onFocusChange={setHeroMovie}
    />
  ), [handleSelect]);

  const ListHeader = useCallback(() => (
    <>
      <Animated.View key={heroMovie?.id} entering={FadeIn.duration(1000)}>
        {heroMovie && (
          <NativeHeroBanner
            title={heroMovie.title}
            description={heroMovie.overview}
            imageUrl={getBackdropUrl(heroMovie.backdrop_path) || ''}
            logoUrl={heroLogo || ''}
            item={heroMovie}
            onPlay={() => router.push({ pathname: `/movie/${heroMovie.id}`, params: { type: 'movie' } })}
            onInfo={() => router.push({ pathname: `/movie/${heroMovie.id}`, params: { type: 'movie' } })}
          />
        )}
      </Animated.View>
      <TvCategoryPills 
         categories={movieCategories} 
         selectedId={selectedCategory} 
         onSelect={setSelectedCategory} 
      />
    </>
  ), [heroMovie, heroLogo, movieCategories, selectedCategory, router]);

  if (loading) {
    return <HomeSkeleton />;
  }

  return (
    <View style={styles.masterContainer}>
      <View style={styles.ambientBackground}>
        <LinearGradient
          colors={heroColors}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ColorExtractor 
        imageUrl={getBackdropUrl(heroMovie?.backdrop_path) || ''} 
        onColorExtracted={handleColorExtracted}
      />

      <FlatList
        data={rowData}
        renderItem={renderRow}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 100,
  },
  contentContainer: { 
    paddingBottom: 100 
  },
});
