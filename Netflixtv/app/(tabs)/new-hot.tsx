import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, findNodeHandle } from 'react-native';
import { fetchUpcoming, fetchTrending, fetchPopular } from '../../services/tmdb';
import ExpandingRow from '../../components/ExpandingRow';
import { useProfile } from '../../context/ProfileContext';
import { usePageColor } from '../../context/PageColorContext';
import HomeSkeleton from '../../components/HomeSkeleton';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

const { width } = Dimensions.get('window');

export default function NewAndHotScreen() {
  const { selectedProfile } = useProfile();
  const { setPageColor } = usePageColor();
  const { setHeroFocusTag } = useTvFocusBridge();
  const [loading, setLoading] = useState(true);
  const firstRowRef = useRef<any>(null);
  
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  
  const [focusedStreamUrl, setFocusedStreamUrl] = useState<string | undefined>();
  const [focusedStreamHeaders, setFocusedStreamHeaders] = useState<string | undefined>();

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
        const tag = findNodeHandle(firstRowRef.current);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        clearTimeout(timeout);
        setHeroFocusTag(null);
      };
    }, [loading, setHeroFocusTag])
  );

  if (loading) return <HomeSkeleton />;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.9)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
           <Text style={styles.title}>New & Hot</Text>
           <Text style={styles.subtitle}>Discovery what's coming soon and trending right now.</Text>
        </View>

        {/* 1. Coming Soon (Upcoming) */}
        <ExpandingRow
          ref={firstRowRef}
          title="🍿 Coming Soon"
          content={upcoming}
          onItemFocus={(movie) => {
            // In a real app, we'd resolve trailer here
            setFocusedStreamUrl(undefined);
          }}
        />

        {/* 2. Everyone's Watching */}
        <ExpandingRow 
          title="🔥 Everyone's Watching"
          content={trending}
        />

        {/* 3. Top 10 Today */}
        <ExpandingRow 
          title="🔟 Top 10 Today"
          content={popular.slice(0, 10)}
          showRank={true}
        />

        {/* 4. Fresh Arrivals */}
        <ExpandingRow 
          title="✨ Fresh Arrivals"
          content={popular.slice(10, 25)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 60,
    marginTop: 40,
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
  }
});
