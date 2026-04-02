import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { HorizontalCarousel } from './HorizontalCarousel';
import { getImageUrl, getBackdropUrl } from '../services/tmdb';

// Removed static width constant to prevent orientation distortion.
// useWindowDimensions() is used inside the component instead.

interface LazyCarouselRowProps {
  title: string;
  fetchFn: () => Promise<any[]>;
  tiltX?: any;
  tiltY?: any;
  variant?: 'poster' | 'landscape';
}

const LazyCarouselRowComponent = ({ title, fetchFn, tiltX, tiltY, variant = 'poster' }: LazyCarouselRowProps) => {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Store fetchFn in a ref so its closure changes don't trigger the effect
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const results = await fetchFnRef.current();
        if (isMounted && results) {
          const formatted = results.map((item: any) => ({
            id: item.id.toString(),
            title: item.title || item.name,
            imageUrl: variant === 'landscape' ? getBackdropUrl(item.backdrop_path || item.poster_path) : getImageUrl(item.poster_path || item.backdrop_path),
            backdropUrl: getBackdropUrl(item.backdrop_path),
            synopsis: item.overview || "Explore this trending title.",
            type: item.media_type || (item.title ? 'movie' : 'tv'),
          }));
          setData(formatted);
        }
      } catch (err) {
        console.warn("Failed to load row", title, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []); // Empty deps so it only runs once per component mount

  if (loading) {
    const W = variant === 'landscape' ? width * 0.35 : width * 0.28;
    const H = variant === 'landscape' ? W * 1.4 : W * 1.5;
    return (
      <View style={styles.skeletonContainer}>
        {/* We just return an empty box of the correct height to act as a skeleton spacer placeholder */}
        <View style={{ height: H + 30, width: '100%', backgroundColor: 'transparent' }} />
      </View>
    );
  }

  if (data.length === 0) return null;

  return (
    <HorizontalCarousel 
      title={title} 
      data={data} 
      variant={variant}
      tiltX={tiltX}
      tiltY={tiltY}
    />
  );
};

export const LazyCarouselRow = React.memo(LazyCarouselRowComponent);

const styles = StyleSheet.create({
  skeletonContainer: {
    marginVertical: 10,
    width: '100%',
  }
});
