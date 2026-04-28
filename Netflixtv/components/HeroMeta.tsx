import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HeroMetaProps {
  movie: any;
  logoUrl?: string;
}

function HeroMeta({ movie, logoUrl }: HeroMetaProps) {
  if (!movie) return null;

  const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
    10752: 'War', 37: 'Western',
    10759: 'Action', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
    10765: 'Sci-Fi', 10766: 'Soap', 10767: 'Talk', 10768: 'Politics',
  };

  const mediaType = movie.media_type || 'movie';
  const releaseDate = movie.release_date || movie.first_air_date || '';
  const year = releaseDate.length >= 4 ? releaseDate.substring(0, 4) : '';
  const voteAvg = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const seasons = movie.number_of_seasons;
  const episodes = movie.number_of_episodes;

  // Genre labels (first 2)
  const genreList = movie.genre_ids || [];
  const genres: string[] = [];
  genreList.slice(0, 2).forEach((id: number) => {
    if (GENRE_MAP[id]) genres.push(GENRE_MAP[id]);
  });

  // Build metadata items: "Family Time TV • 2024 • 8 Episodes • TV-PG"
  const items: string[] = [];
  if (genres.length > 0) items.push(genres.join(' · '));
  if (year) items.push(year);
  if (seasons && seasons > 0) items.push(`${seasons} Season${seasons > 1 ? 's' : ''}`);
  else if (episodes && episodes > 0) items.push(`${episodes} Episodes`);
  if (voteAvg && parseFloat(voteAvg) > 0) items.push(`★ ${voteAvg}`);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <View key={`${item}-${i}`} style={styles.row}>
          {i > 0 && <Text style={styles.dot}>{'\u2022'}</Text>}
          <Text style={styles.metaText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default memo(HeroMeta);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 80,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 4,
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginRight: 6,
  },
  metaText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
