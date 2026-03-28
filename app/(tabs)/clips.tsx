import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { COLORS } from '../../constants/theme';
import { fetchTrending } from '../../services/tmdb';
import { NetflixLoader } from '../../components/NetflixLoader';
import { useFocusEffect } from 'expo-router';
import { VerticalVideoFeed } from '../../components/VerticalVideoFeed';
import { useTheme } from '../_layout';

export default function ClipsScreen() {
  const { setThemeColor } = useTheme();
  const [discoveryData, setDiscoveryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setThemeColor('#000000');
      StatusBar.setHidden(true, 'fade');
      return () => StatusBar.setHidden(false, 'fade');
    }, [])
  );

  useEffect(() => {
    const loadDiscovery = async () => {
      try {
        const [movies, tv] = await Promise.all([
          fetchTrending('movie'),
          fetchTrending('tv')
        ]);
        
        // Interleave movies and tv for variety
        const combined = [];
        const maxLen = 10; // Get top 10 each
        for (let i = 0; i < maxLen; i++) {
          if (movies[i]) combined.push({ ...movies[i], media_type: 'movie', type: 'movie', showId: movies[i].id.toString(), videoUrl: '' });
          if (tv[i]) combined.push({ ...tv[i], media_type: 'tv', type: 'tv', showId: tv[i].id.toString(), videoUrl: '' });
        }
        
        setDiscoveryData(combined);
      } catch (error) {
        console.error("Error fetching discovery data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDiscovery();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <NetflixLoader size={40} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VerticalVideoFeed data={discoveryData} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
