import React, { useState } from 'react';
import { View, Text, StyleSheet, requireNativeComponent, ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface TvRowViewProps {
  data: any[];
  onSelect: (event: any) => void;
  onFocusChange: (event: any) => void;
  style?: ViewStyle;
}

const NativeTvRow = requireNativeComponent<TvRowViewProps>('TvRowView');

interface ExpandingRowProps {
  title: string;
  data: any[];
  onSelect: (id: number, type?: string) => void;
  onFocusChange?: (item: any) => void;
  showProgress?: boolean;
  isTop10?: boolean;
}

const ExpandingRow = React.memo(({ title, data, onSelect, onFocusChange }: ExpandingRowProps) => {
  const [activeItem, setActiveItem] = useState<any>(null);

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.rowTitle}>{title}</Text>

      {/* Jetpack Compose Native TV Row via ViewManager */}
      <NativeTvRow
        data={data.map(item => ({ ...item, id: String(item.id) }))}
        style={{ width: '100%', height: 320, marginTop: 10 }}
        onSelect={(e) => {
          const id = Number(e.nativeEvent.id);
          const mediaType = e.nativeEvent.mediaType;
          console.log(`[ExpandingRow] onSelect → id=${id} type=${mediaType}`);
          onSelect(id, mediaType);
        }}
        onFocusChange={(e) => {
          const item = data.find(i => String(i.id) === String(e.nativeEvent.id));
          if (item) {
            setActiveItem(item);
            if (onFocusChange) onFocusChange(item);
          }
        }}
      />


      {activeItem && (
        <Animated.View style={styles.metadataContainer} entering={FadeIn.duration(400)}>
          <Text style={styles.metadataText}>
            {activeItem.media_type === 'tv' ? 'TV Show' : 'Movie'} • {
              activeItem.first_air_date?.split('-')[0] || activeItem.release_date?.split('-')[0]
            } • {activeItem.vote_average?.toFixed(1)} ★
          </Text>
          <Text style={styles.synopsis} numberOfLines={2}>
            {activeItem.overview}
          </Text>
        </Animated.View>
      )}
    </View>
  );
});

export default ExpandingRow;

const styles = StyleSheet.create({
  container: {
    marginVertical: 15,
  },
  rowTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 60,
    marginBottom: 0,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  metadataContainer: {
    paddingHorizontal: 60,
    marginTop: 10,
    minHeight: 80,
  },
  metadataText: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  synopsis: {
    color: '#a3a3a3',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: '80%',
  },
});
