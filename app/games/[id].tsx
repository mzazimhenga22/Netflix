import React, { useMemo } from 'react';
import { View, StyleSheet, StatusBar, requireNativeComponent, ViewProps } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

interface GameDetailsNativeViewProps extends ViewProps {
  gameData?: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    heroUrl: string;
    posterUrl: string;
  };
  onBackClick?: (event: any) => void;
}

const GameDetailsNativeView = requireNativeComponent<GameDetailsNativeViewProps>('GameDetailsNativeView');

const GAMES_CATALOG: Record<string, any> = {
  transformers: {
    id: 'transformers',
    title: 'TRANSFORMERS Forged to Fight',
    subtitle: 'Action',
    description: 'Optimus Prime, Bumblebee and bots across the multiverse are in danger. Ready to build a team, shore up defenses and fight epic battles? Roll out!',
    heroUrl: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?q=80&w=2000&auto=format&fit=crop',
    posterUrl: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=500&auto=format&fit=crop'
  },
  gta_sa: {
    id: 'gta_sa',
    title: 'GTA: San Andreas',
    subtitle: 'Action',
    description: 'Experience the blockbuster classic, updated for a new generation with across-the-board enhancements.',
    heroUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2000&auto=format&fit=crop',
    posterUrl: 'https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg'
  },
  hades: {
    id: 'hades',
    title: 'Hades',
    subtitle: 'Action',
    description: 'Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler.',
    heroUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2000&auto=format&fit=crop',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg'
  }
};

export default function GameDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const gameData = useMemo(() => {
    return GAMES_CATALOG[id as string] || GAMES_CATALOG.transformers;
  }, [id]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <GameDetailsNativeView 
        style={StyleSheet.absoluteFill}
        gameData={gameData}
        onBackClick={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
